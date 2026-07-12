"""California Healthy Places Index (HPI) 3.0 -- BLOCKED, documented per
DECISIONS.md DEC-018.

Verified live 2026-07-12: the Public Health Alliance of Southern
California (HPI's official publisher) offers no keyless, no-registration
bulk/API download for statewide tract-level HPI 3.0 data:

- The "Complete HPI Data File" is a manual email/form request
  (healthyplacesindex.org/request-hpi-data-file), not an automatable
  download -- confirmed reachable (HTTP 200) but is a web form, not a
  data endpoint.
- `api.healthyplacesindex.org` requires account registration for an API
  key AND only supports 2010 Census tract boundaries, incompatible with
  this platform's 2020-tract canonical geography (DECISIONS.md DEC-004).
- Only unofficial third-party ArcGIS mirrors exist (LA County Public
  Health, Riverside County, SACOG, FEMA Region 9) -- none from the
  Alliance itself, so vintage/completeness cannot be authoritatively
  verified against them, and docs/02_DATA_SOURCE_REGISTRY.md's source
  hierarchy places an unverified third-party mirror below what this
  platform requires for a benchmark index used in product decisions.

This adapter therefore intentionally does NOT fetch a proxy/mirror source.
It exists to produce a truthful, typed "unavailable" manifest entry rather
than silently omitting HPI from the source catalog, and to give a future
session (with a HPI_API_KEY or a completed manual data-request) a concrete
place to implement the real fetch.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from scc_health_pipeline.sources.base import (
    FetchContext,
    RawArtifact,
    RemoteResource,
    ValidationReport,
)

ADAPTER_VERSION = "1.0.0"

BLOCKED_REASON = (
    "California Healthy Places Index 3.0 has no keyless, no-registration bulk/API "
    "download from its official publisher (Public Health Alliance of Southern "
    "California). The 'Complete HPI Data File' requires a manual email/form "
    "request; the HPI API requires account registration and only supports 2010 "
    "Census tract boundaries (incompatible with this platform's 2020-tract "
    "canonical geography). See DECISIONS.md DEC-018 and "
    "docs/data/source-verification.md §6 for full detail."
)


class CaHpiAdapter:
    source_id = "ca_hpi_3_0"

    def discover(self) -> list[RemoteResource]:
        # No resource to discover -- there is no automatable endpoint.
        return []

    def fetch(self, resource: RemoteResource, context: FetchContext) -> RawArtifact:
        raise NotImplementedError(
            "ca_hpi_3_0 has no fetchable resource; discover() returns an empty "
            "list specifically so no fetch is ever attempted. " + BLOCKED_REASON
        )

    def validate_raw(self, artifact: RawArtifact) -> ValidationReport:
        report = ValidationReport()
        report.add_error(BLOCKED_REASON)
        return report

    def normalize(self, artifact: RawArtifact) -> list[Path]:
        return []

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport:
        report = ValidationReport()
        report.add_error(
            "ca_hpi_3_0 has no normalized output -- source is blocked, not "
            "silently empty. " + BLOCKED_REASON
        )
        return report


def blocked_manifest_entry() -> dict[str, object]:
    """A typed 'unavailable' manifest record for DATA_MANIFEST.json, used
    in place of a real fetch since no automatable source exists."""
    return {
        "source_id": CaHpiAdapter.source_id,
        "resource_id": "n/a",
        "publisher": "Public Health Alliance of Southern California",
        "landing_page": "https://www.healthyplacesindex.org/",
        "resource_url": None,
        "retrieved_at": datetime.now(UTC).isoformat(),
        "source_vintage": "HPI 3.0 (2022)",
        "release_date": "2022",
        "sha256": None,
        "bytes": 0,
        "native_geography": "census tract (2010 boundaries via API; unknown for manual file)",
        "license_or_terms": (
            "Free for noncommercial use with attribution; "
            "see https://www.healthyplacesindex.org/terms-and-conditions"
        ),
        "adapter_version": ADAPTER_VERSION,
        "status": "unavailable",
        "notes": BLOCKED_REASON,
    }
