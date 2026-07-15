"""Thorough mocked tests for scripts/fetch_data_artifact.py's private-
repository artifact-download logic (pre-deployment correction pass).

No test in this file ever touches the real network -- every HTTP
interaction goes through `fetch_data_artifact._open_url`, which is
monkeypatched to a fake transport that records every call (URL +
headers) so tests can assert exactly what was sent, including that a
token is never leaked to the wrong host.
"""

from __future__ import annotations

import hashlib
import json
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

import fetch_data_artifact as fda
import pytest


class FakeResponse:
    def __init__(self, body: bytes, status: int = 200):
        self._body = body
        self._pos = 0
        self.status = status

    def read(self, n: int | None = None) -> bytes:
        if n is None:
            result = self._body[self._pos :]
            self._pos = len(self._body)
            return result
        result = self._body[self._pos : self._pos + n]
        self._pos += len(result)
        return result


@dataclass
class RecordedCall:
    url: str
    headers: dict


@dataclass
class FakeTransport:
    calls: list[RecordedCall] = field(default_factory=list)
    responses: dict[str, tuple] = field(default_factory=dict)

    def register_json(self, url: str, payload) -> None:
        self.responses[url] = (json.dumps(payload).encode("utf-8"), 200, None)

    def register_bytes(self, url: str, body: bytes, status: int = 200) -> None:
        self.responses[url] = (body, status, None)

    def register_error(self, url: str, code: int) -> None:
        self.responses[url] = (
            None,
            None,
            urllib.error.HTTPError(url, code, f"HTTP {code}", {}, None),
        )

    def register_redirect(self, url: str, location: str) -> None:
        headers = {"Location": location}
        self.responses[url] = (
            None,
            None,
            urllib.error.HTTPError(url, 302, "Found", headers, None),
        )

    def __call__(self, url: str, headers: dict):
        self.calls.append(RecordedCall(url, dict(headers)))
        if url not in self.responses:
            raise AssertionError(
                f"Unexpected URL requested in test: {url}\nRegistered: {list(self.responses)}"
            )
        body, status, error = self.responses[url]
        if error is not None:
            raise error
        return FakeResponse(body, status)


REPO = "carhanc/scc-health-intelligence"
WAREHOUSE_CONTENT = b"fake duckdb warehouse bytes " * 1000
WAREHOUSE_SHA = hashlib.sha256(WAREHOUSE_CONTENT).hexdigest()


def _manifest(build_id: str = "prod-20260101T000000Z", warehouse_sha: str = WAREHOUSE_SHA) -> dict:
    return {"build_id": build_id, "warehouse_sha256": warehouse_sha, "total_rows": 670291}


def _release(tag: str, *, draft: bool = False, prerelease: bool = False, asset_id: int = 1) -> dict:
    return {
        "tag_name": tag,
        "draft": draft,
        "prerelease": prerelease,
        "assets": [
            {
                "name": fda.MANIFEST_ASSET_NAME,
                "url": f"https://api.github.com/repos/{REPO}/releases/assets/{asset_id}",
                "browser_download_url": f"https://github.com/{REPO}/releases/download/{tag}/{fda.MANIFEST_ASSET_NAME}",
            },
            {
                "name": fda.WAREHOUSE_ASSET_NAME,
                "url": f"https://api.github.com/repos/{REPO}/releases/assets/{asset_id + 1}",
                "browser_download_url": f"https://github.com/{REPO}/releases/download/{tag}/{fda.WAREHOUSE_ASSET_NAME}",
            },
        ],
    }


@pytest.fixture
def paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    warehouse = tmp_path / "warehouse" / "scc_health.duckdb"
    manifest = tmp_path / "DATA_MANIFEST.production.json"
    monkeypatch.setattr(fda, "WAREHOUSE_PATH", warehouse)
    monkeypatch.setattr(fda, "MANIFEST_PATH", manifest)
    return warehouse, manifest


def test_authenticated_private_release_lookup_and_download(
    paths, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A private repo requires DATA_ARTIFACT_GITHUB_TOKEN; every request
    (metadata + both asset downloads) must be authenticated via the
    api.github.com asset-download endpoint, never browser_download_url."""
    warehouse_path, manifest_path = paths
    transport = FakeTransport()
    tag = "data-prod-20260101T000000Z"
    release = _release(tag)
    transport.register_json(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}", release)
    transport.register_bytes(release["assets"][0]["url"], json.dumps(_manifest()).encode())
    transport.register_bytes(release["assets"][1]["url"], WAREHOUSE_CONTENT)
    monkeypatch.setattr(fda, "_open_url", transport)

    message = fda.fetch_artifact(tag, "ghp_fake_token_value", REPO)

    assert "Verified and installed" in message
    assert warehouse_path.read_bytes() == WAREHOUSE_CONTENT
    assert json.loads(manifest_path.read_text())["build_id"] == "prod-20260101T000000Z"
    # Every call must have hit the authenticated asset-download API, never
    # a public browser_download_url, and every call must carry the token.
    for call in transport.calls:
        assert call.url.startswith("https://api.github.com/")
        assert call.headers.get("Authorization") == "Bearer ghp_fake_token_value"


def test_public_release_fallback_uses_browser_download_url_with_no_token(
    paths, monkeypatch
) -> None:
    """No token configured -- must fall back to unauthenticated requests
    against the plain browser_download_url, for a genuinely public repo."""
    warehouse_path, manifest_path = paths
    transport = FakeTransport()
    tag = "data-prod-20260101T000000Z"
    release = _release(tag)
    transport.register_json(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}", release)
    transport.register_bytes(
        release["assets"][0]["browser_download_url"], json.dumps(_manifest()).encode()
    )
    transport.register_bytes(release["assets"][1]["browser_download_url"], WAREHOUSE_CONTENT)
    monkeypatch.setattr(fda, "_open_url", transport)

    message = fda.fetch_artifact(tag, None, REPO)

    assert "Verified and installed" in message
    assert warehouse_path.read_bytes() == WAREHOUSE_CONTENT
    asset_calls = [c for c in transport.calls if "releases/download" in c.url]
    assert len(asset_calls) == 2
    for call in asset_calls:
        assert "Authorization" not in call.headers


def test_latest_resolves_newest_published_data_release(paths, monkeypatch) -> None:
    """'latest' must skip drafts, prereleases, and non-data-* tags, and
    pick the first matching entry (GitHub lists releases newest-first)."""
    warehouse_path, _ = paths
    transport = FakeTransport()
    good_tag = "data-prod-20260201T000000Z"
    releases = [
        {"tag_name": "v1.2.3", "draft": False, "prerelease": False, "assets": []},
        {
            "tag_name": "data-prod-20260301T000000Z",
            "draft": True,
            "prerelease": False,
            "assets": [],
        },
        {
            "tag_name": "data-prod-20260215T000000Z",
            "draft": False,
            "prerelease": True,
            "assets": [],
        },
        _release(good_tag),
        _release("data-prod-20260101T000000Z"),
    ]
    transport.register_json(f"https://api.github.com/repos/{REPO}/releases?per_page=100", releases)
    good_release = releases[3]
    transport.register_bytes(good_release["assets"][0]["url"], json.dumps(_manifest()).encode())
    transport.register_bytes(good_release["assets"][1]["url"], WAREHOUSE_CONTENT)
    monkeypatch.setattr(fda, "_open_url", transport)

    message = fda.fetch_artifact("latest", "tok", REPO)

    assert "Verified and installed" in message
    assert warehouse_path.read_bytes() == WAREHOUSE_CONTENT


def test_exact_tag_resolution_ignores_latest_and_uses_the_named_tag(paths, monkeypatch) -> None:
    """A specific historical tag must be fetchable for rollback, even if
    a newer data-* release also exists (never silently substitutes
    'latest' behavior)."""
    warehouse_path, _ = paths
    transport = FakeTransport()
    old_tag = "data-prod-20260101T000000Z"
    release = _release(old_tag)
    transport.register_json(f"https://api.github.com/repos/{REPO}/releases/tags/{old_tag}", release)
    transport.register_bytes(
        release["assets"][0]["url"],
        json.dumps(_manifest(build_id="prod-20260101T000000Z")).encode(),
    )
    transport.register_bytes(release["assets"][1]["url"], WAREHOUSE_CONTENT)
    monkeypatch.setattr(fda, "_open_url", transport)

    message = fda.fetch_artifact(old_tag, "tok", REPO)

    assert "prod-20260101T000000Z" in message
    assert warehouse_path.read_bytes() == WAREHOUSE_CONTENT
    # Must never have requested the releases-list ("latest") endpoint.
    assert not any("releases?per_page" in c.url for c in transport.calls)


def test_missing_asset_fails_loudly_with_asset_name(paths, monkeypatch) -> None:
    transport = FakeTransport()
    tag = "data-prod-20260101T000000Z"
    release = {"tag_name": tag, "draft": False, "prerelease": False, "assets": []}
    transport.register_json(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}", release)
    monkeypatch.setattr(fda, "_open_url", transport)

    with pytest.raises(fda.ArtifactFetchError, match=fda.MANIFEST_ASSET_NAME):
        fda.fetch_artifact(tag, "tok", REPO)


def test_missing_tag_fails_loudly(paths, monkeypatch) -> None:
    transport = FakeTransport()
    tag = "data-does-not-exist"
    transport.register_error(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}", 404)
    monkeypatch.setattr(fda, "_open_url", transport)

    with pytest.raises(fda.ArtifactFetchError, match="404"):
        fda.fetch_artifact(tag, "tok", REPO)


def test_authentication_failure_fails_loudly_and_never_leaks_the_token(paths, monkeypatch) -> None:
    transport = FakeTransport()
    tag = "data-prod-20260101T000000Z"
    transport.register_error(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}", 401)
    monkeypatch.setattr(fda, "_open_url", transport)

    secret_token = "ghp_super_secret_value_do_not_leak"
    with pytest.raises(fda.ArtifactFetchError) as exc_info:
        fda.fetch_artifact(tag, secret_token, REPO)

    assert "401" in str(exc_info.value)
    assert secret_token not in str(exc_info.value)


def test_forbidden_gives_an_actionable_permission_message(paths, monkeypatch) -> None:
    transport = FakeTransport()
    tag = "data-prod-20260101T000000Z"
    transport.register_error(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}", 403)
    monkeypatch.setattr(fda, "_open_url", transport)

    with pytest.raises(fda.ArtifactFetchError, match="403"):
        fda.fetch_artifact(tag, "tok", REPO)


def test_corrupted_warehouse_download_is_rejected_and_never_installed(paths, monkeypatch) -> None:
    """A SHA-256 mismatch must raise, and must NEVER replace whatever
    warehouse file (if any) was already at WAREHOUSE_PATH."""
    warehouse_path, manifest_path = paths
    warehouse_path.parent.mkdir(parents=True)
    warehouse_path.write_bytes(b"the previous, known-good warehouse")
    manifest_path.write_text(json.dumps(_manifest(build_id="prod-OLD")))

    transport = FakeTransport()
    tag = "data-prod-20260101T000000Z"
    release = _release(tag)
    transport.register_json(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}", release)
    transport.register_bytes(release["assets"][0]["url"], json.dumps(_manifest()).encode())
    # Corrupted: body doesn't match the manifest's declared SHA-256.
    transport.register_bytes(
        release["assets"][1]["url"], b"corrupted garbage, not the real warehouse"
    )
    monkeypatch.setattr(fda, "_open_url", transport)

    with pytest.raises(fda.ArtifactFetchError, match="SHA-256 mismatch"):
        fda.fetch_artifact(tag, "tok", REPO)

    # The old, known-good warehouse and manifest must be completely untouched.
    assert warehouse_path.read_bytes() == b"the previous, known-good warehouse"
    assert json.loads(manifest_path.read_text())["build_id"] == "prod-OLD"
    # No .partial file left lying around either.
    assert not warehouse_path.with_suffix(warehouse_path.suffix + ".partial").exists()


def test_atomic_preservation_when_manifest_ok_but_warehouse_download_fails(
    paths, monkeypatch
) -> None:
    """If the manifest downloads fine but the warehouse asset itself
    errors out, the previously-installed warehouse+manifest pair must
    remain exactly as they were -- never a mismatched pair."""
    warehouse_path, manifest_path = paths
    warehouse_path.parent.mkdir(parents=True)
    warehouse_path.write_bytes(b"known-good warehouse bytes")
    manifest_path.write_text(json.dumps(_manifest(build_id="prod-OLD")))

    transport = FakeTransport()
    tag = "data-prod-20260101T000000Z"
    release = _release(tag)
    transport.register_json(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}", release)
    transport.register_bytes(release["assets"][0]["url"], json.dumps(_manifest()).encode())
    transport.register_error(release["assets"][1]["url"], 500)
    monkeypatch.setattr(fda, "_open_url", transport)

    with pytest.raises(fda.ArtifactFetchError):
        fda.fetch_artifact(tag, "tok", REPO)

    assert warehouse_path.read_bytes() == b"known-good warehouse bytes"
    assert json.loads(manifest_path.read_text())["build_id"] == "prod-OLD"


def test_already_up_to_date_skips_the_large_warehouse_download(paths, monkeypatch) -> None:
    """If the locally-installed warehouse's real SHA-256 already matches
    the release's manifest, the (large) warehouse asset must never be
    re-downloaded -- only the small manifest is re-fetched."""
    warehouse_path, manifest_path = paths
    warehouse_path.parent.mkdir(parents=True)
    warehouse_path.write_bytes(WAREHOUSE_CONTENT)  # already the correct content

    transport = FakeTransport()
    tag = "data-prod-20260101T000000Z"
    release = _release(tag)
    transport.register_json(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}", release)
    transport.register_bytes(release["assets"][0]["url"], json.dumps(_manifest()).encode())
    # Deliberately do NOT register the warehouse asset URL -- if the code
    # tries to download it, the fake transport raises immediately.
    monkeypatch.setattr(fda, "_open_url", transport)

    message = fda.fetch_artifact(tag, "tok", REPO)

    assert "skipped re-downloading" in message
    assert warehouse_path.read_bytes() == WAREHOUSE_CONTENT
    assert json.loads(manifest_path.read_text())["build_id"] == "prod-20260101T000000Z"


def test_malformed_manifest_json_fails_loudly(paths, monkeypatch) -> None:
    transport = FakeTransport()
    tag = "data-prod-20260101T000000Z"
    release = _release(tag)
    transport.register_json(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}", release)
    transport.register_bytes(release["assets"][0]["url"], b"{not valid json")
    monkeypatch.setattr(fda, "_open_url", transport)

    with pytest.raises(fda.ArtifactFetchError, match="not valid JSON"):
        fda.fetch_artifact(tag, "tok", REPO)


def test_manifest_missing_required_fields_fails_loudly(paths, monkeypatch) -> None:
    transport = FakeTransport()
    tag = "data-prod-20260101T000000Z"
    release = _release(tag)
    transport.register_json(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}", release)
    transport.register_bytes(release["assets"][0]["url"], json.dumps({"total_rows": 5}).encode())
    monkeypatch.setattr(fda, "_open_url", transport)

    with pytest.raises(fda.ArtifactFetchError, match="missing"):
        fda.fetch_artifact(tag, "tok", REPO)


def test_no_published_data_release_for_latest_fails_loudly(paths, monkeypatch) -> None:
    transport = FakeTransport()
    transport.register_json(
        f"https://api.github.com/repos/{REPO}/releases?per_page=100",
        [{"tag_name": "v1.0.0", "draft": False, "prerelease": False, "assets": []}],
    )
    monkeypatch.setattr(fda, "_open_url", transport)

    with pytest.raises(fda.ArtifactFetchError, match="No published"):
        fda.fetch_artifact("latest", "tok", REPO)


def test_main_requires_release_tag_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATA_ARTIFACT_RELEASE_TAG", raising=False)
    assert fda.main() == 1


def test_main_returns_zero_on_success_and_never_prints_the_token(
    paths, monkeypatch, capsys
) -> None:
    transport = FakeTransport()
    tag = "data-prod-20260101T000000Z"
    release = _release(tag)
    transport.register_json(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}", release)
    transport.register_bytes(release["assets"][0]["url"], json.dumps(_manifest()).encode())
    transport.register_bytes(release["assets"][1]["url"], WAREHOUSE_CONTENT)
    monkeypatch.setattr(fda, "_open_url", transport)

    secret_token = "ghp_should_never_appear_in_output"
    monkeypatch.setenv("DATA_ARTIFACT_RELEASE_TAG", tag)
    monkeypatch.setenv("DATA_ARTIFACT_GITHUB_TOKEN", secret_token)

    assert fda.main() == 0
    captured = capsys.readouterr()
    assert secret_token not in captured.out
    assert secret_token not in captured.err


# --- Redirect / Authorization-header-stripping behavior ---


def test_redirect_handler_strips_authorization_on_cross_host_redirect() -> None:
    """The core security property: GitHub's authenticated asset endpoint
    redirects to a different host (e.g. an S3 pre-signed URL) -- the
    GitHub token must never be forwarded there."""
    handler = fda._AuthStrippingRedirectHandler()
    req = urllib.request.Request(
        "https://api.github.com/repos/owner/repo/releases/assets/1",
        headers={"Authorization": "Bearer secret-token", "Accept": "application/octet-stream"},
    )
    new_url = "https://objects.githubusercontent.com/some/presigned/path?sig=abc"
    new_req = handler.redirect_request(req, None, 302, "Found", {}, new_url)

    assert new_req is not None
    assert new_req.get_header("Authorization") is None
    assert urlparse(new_req.full_url).netloc == "objects.githubusercontent.com"


def test_redirect_handler_keeps_authorization_on_same_host_redirect() -> None:
    """A same-host redirect (e.g. api.github.com -> api.github.com) is
    safe to forward the token to -- only a *different* host is stripped."""
    handler = fda._AuthStrippingRedirectHandler()
    req = urllib.request.Request(
        "https://api.github.com/repos/owner/repo/releases/assets/1",
        headers={"Authorization": "Bearer secret-token"},
    )
    new_url = "https://api.github.com/repos/owner/repo/releases/assets/1?redirected=1"
    new_req = handler.redirect_request(req, None, 302, "Found", {}, new_url)

    assert new_req is not None
    assert new_req.get_header("Authorization") == "Bearer secret-token"
