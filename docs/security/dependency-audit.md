# Dependency and supply-chain audit (Phase 9)

Live-run this session against the actual lockfiles (`uv.lock`, `pnpm-lock.yaml`), not a generic template.

## Python (`pip-audit`)

```
uv export --no-hashes --all-packages | grep -v '^-e ' > /tmp/requirements-for-audit.txt
uvx pip-audit --strict -r /tmp/requirements-for-audit.txt
```

**Result: no known vulnerabilities found**, across all 87 resolved packages (both `scc-health-api` and `scc-health-pipeline` workspace members' full dependency trees). The two local editable workspace packages themselves are filtered out before the check, since they aren't published to PyPI and can't be looked up there — this is expected and not a gap in coverage (their own dependencies are still fully audited).

This check runs in CI on every PR (`.github/workflows/ci.yml`'s `security-audit` job) and blocks merge on any finding.

## JavaScript (`pnpm audit`)

```
pnpm audit --audit-level=high
```

**One moderate-severity finding, fixed this session:** [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) — PostCSS XSS via unescaped `</style>` in its CSS stringify output, affecting `postcss < 8.5.10`. The vulnerable version was pinned transitively by Next.js 16.2.10's own dependency declaration (`next > postcss@8.4.31`), not by anything this project depends on directly, and both a fresh install and the full test/build suite were re-verified green after the fix.

**Fix applied:** a `pnpm-workspace.yaml` `overrides` entry forcing `postcss` to `>=8.5.10` everywhere in the dependency tree (`pnpm-workspace.yaml`, see its inline comment). This is the standard pnpm mechanism for patching a transitive dependency without waiting on an upstream package's own version bump, and does not affect any package's own declared dependency ranges. Re-audited clean after the fix (`pnpm audit` → "No known vulnerabilities found").

The `security-audit` CI job uses `--audit-level=high` deliberately — a required PR check should catch real, actionable vulnerabilities, not block every contributor's PR on a low/moderate-severity advisory with no available fix. The one moderate finding above was fixed anyway because a safe override was available; a future moderate/low finding with no available fix would be recorded here as an accepted risk with reasoning, not silently ignored.

## Outdated (non-vulnerable) dependencies

`pnpm outdated` reports **zero** outdated top-level JS dependencies (lockfile is current).

`uv pip list --outdated` reports 6 minor/patch-level lags, none security-relevant (confirmed via the clean `pip-audit` run above): `anyio` 4.14.1→4.14.2, `coverage` 7.15.0→7.15.1, `mypy` 2.2.0→2.3.0, `narwhals` 2.23.0→2.24.0, `pydantic-core` 2.46.4→2.47.0, and `protobuf` 6.33.6→7.35.1 (a major version bump, deliberately **not** taken in this pass — a major-version dependency bump needs its own dedicated testing pass, not a drive-by change bundled into a production-hardening phase). These are recorded here as a known, low-priority Phase 10+ maintenance item, not a Phase 9 blocker.

## GitHub Actions supply chain

Every `uses:` step in `.github/workflows/*.yml` is pinned to a full commit SHA (not just a version tag), with the human-readable version in a trailing comment — verified against the real, current tag→commit mapping via the GitHub API at the time each workflow was written, not guessed:

| Action | Pinned version | Commit SHA |
| --- | --- | --- |
| `actions/checkout` | v7.0.0 | `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` |
| `actions/setup-node` | v7.0.0 | `820762786026740c76f36085b0efc47a31fe5020` |
| `astral-sh/setup-uv` | v8.3.2 | `11f9893b081a58869d3b5fccaea48c9e9e46f990` |
| `actions/upload-artifact` | v7.0.1 | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |

Every workflow declares an explicit, minimal `permissions:` block (`contents: read` by default; `contents: write` only on the scheduled-refresh workflow, which needs it to publish a GitHub Release) and a `concurrency:` group to prevent overlapping runs. Secrets (`CENSUS_API_KEY`, `HUD_USER_TOKEN`, deploy-hook URLs) are only ever referenced inside job steps that need them, never exposed to a fork's pull-request run (the `pull_request` trigger on `ci.yml` doesn't reference any secret at all).

## SBOM

Not generated this phase. `pip-audit` and `pnpm audit` already provide dependency-vulnerability coverage; a full SBOM (e.g. CycloneDX/SPDX export) would add real value for a compliance/procurement audience but no additional security signal beyond what's already covered here, and adding a new tool/dependency for that alone wasn't judged worth the marginal cost this phase. Recorded as a reasonable Phase 10+ item if a specific consumer (e.g. a county procurement requirement) needs it.

## Summary

| Check | Result |
| --- | --- |
| Python vulnerabilities (`pip-audit`) | 0 found |
| JS vulnerabilities (`pnpm audit --audit-level=high`) | 0 found (1 moderate found and fixed) |
| Lockfile currency | Both lockfiles current; `--frozen-lockfile`/no unexpected resolution changes in CI |
| GitHub Actions pinning | All 4 distinct actions pinned to verified commit SHAs |
| SBOM | Not generated; documented as a Phase 10+ option |
