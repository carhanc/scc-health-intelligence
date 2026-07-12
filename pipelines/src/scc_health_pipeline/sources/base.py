"""Source-adapter protocol shared by every data source.

Implements the interface specified in docs/04_ARCHITECTURE_IMPLEMENTATION.md
§7: discover -> fetch -> validate_raw -> normalize -> quality_checks. Each
concrete adapter (pipelines/src/scc_health_pipeline/sources/*.py) implements
this Protocol. Raw artifacts are immutable and checksummed; a source failure
must never produce an empty "successful" table (CLAUDE.md failure rules).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Protocol

AdapterStatus = Literal["success", "cached", "unavailable", "partial"]


@dataclass(frozen=True)
class RemoteResource:
    """A single fetchable file/endpoint discovered by an adapter."""

    resource_id: str
    url: str
    expected_content_type: str
    description: str = ""


@dataclass(frozen=True)
class FetchContext:
    """Shared fetch configuration passed to every adapter."""

    raw_dir: Path
    timeout_seconds: float = 60.0
    max_retries: int = 3
    backoff_seconds: float = 1.5


@dataclass(frozen=True)
class RawArtifact:
    """An immutable, checksummed raw download (or a truthful failure record)."""

    resource_id: str
    source_id: str
    local_path: Path | None
    url: str
    sha256: str | None
    bytes: int
    content_type: str | None
    retrieved_at: str
    status: AdapterStatus
    notes: str = ""


@dataclass
class ValidationIssue:
    severity: Literal["error", "warning"]
    message: str


@dataclass
class ValidationReport:
    passed: bool = True
    issues: list[ValidationIssue] = field(default_factory=list)

    def add_error(self, message: str) -> None:
        self.issues.append(ValidationIssue("error", message))
        self.passed = False

    def add_warning(self, message: str) -> None:
        self.issues.append(ValidationIssue("warning", message))

    def merge(self, other: ValidationReport) -> None:
        self.issues.extend(other.issues)
        if not other.passed:
            self.passed = False


class SourceAdapter(Protocol):
    """Protocol every source adapter implements (docs/04 §7)."""

    source_id: str

    def discover(self) -> list[RemoteResource]: ...

    def fetch(self, resource: RemoteResource, context: FetchContext) -> RawArtifact: ...

    def validate_raw(self, artifact: RawArtifact) -> ValidationReport: ...

    def normalize(self, artifact: RawArtifact) -> list[Path]: ...

    def quality_checks(self, normalized_paths: list[Path]) -> ValidationReport: ...
