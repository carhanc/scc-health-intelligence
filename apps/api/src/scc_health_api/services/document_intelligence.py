"""Document Intelligence (Phase 8): validated, in-memory-only extraction
and structure detection for user-uploaded public meeting documents.

Security posture (docs/09_SECURITY_PRIVACY_GOVERNANCE.md "File upload"):
uploaded bytes are validated (extension, MIME, magic bytes, size), parsed
with safe, macro-free libraries (pypdf/python-docx, both pure text
extractors with no embedded-content execution), and never written to
disk or persisted beyond the request -- the caller discards the raw
bytes once this module returns its structured result. Uploaded content
is always treated as untrusted **data** to analyze, never as
instructions to this application or to any LLM (CLAUDE.md, docs/05 §14).
"""

from __future__ import annotations

import io
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import yaml
from docx import Document as DocxDocument
from pypdf import PdfReader
from pypdf.errors import PdfReadError

REPO_ROOT = Path(__file__).resolve().parents[5]
TOPIC_ONTOLOGY_PATH = REPO_ROOT / "config" / "topic_ontology.yml"

MAX_FILE_BYTES = 15 * 1024 * 1024  # 15 MB
MAX_PDF_PAGES = 300
MAX_EXTRACTED_CHARS = 2_000_000  # decompression-bomb / pathological-file guard

_ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".docx"}
_PDF_MAGIC = b"%PDF-"
_DOCX_MAGIC = b"PK\x03\x04"  # DOCX is a zip archive


class UnsupportedFileError(ValueError):
    pass


class FileTooLargeError(ValueError):
    pass


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str


@dataclass(frozen=True)
class ExtractedDocument:
    filename: str
    extraction_method: str
    page_count: int
    pages: list[ExtractedPage]
    full_text: str
    truncated: bool


@dataclass(frozen=True)
class DetectedFinancialAmount:
    raw_text: str
    approximate_value: float


@dataclass(frozen=True)
class DetectedStructure:
    title: str | None
    dates: list[str]
    organizations: list[str]
    agenda_item_headers: list[str]
    financial_amounts: list[DetectedFinancialAmount]


@dataclass(frozen=True)
class TopicMatch:
    topic_id: str
    label: str
    matched_keywords: list[str]
    metrics: list[str]
    scenarios: list[str]
    resource_categories: list[str]
    unavailable_reason: str | None = None


@dataclass
class DocumentAnalysisResult:
    filename: str
    file_hash: str
    extraction_method: str
    page_count: int
    truncated: bool
    structure: DetectedStructure
    detected_geographies: list[str]
    detected_topics: list[TopicMatch]
    injection_warnings: list[str]
    excerpt_by_page: dict[int, str]


def _sanitize_filename(filename: str) -> str:
    """Strips any path component and non-printable characters -- a
    filename is displayed to the user, never used to construct a
    filesystem path (docs/09 "no user-controlled file paths")."""
    name = Path(filename).name
    name = unicodedata.normalize("NFKC", name)
    name = re.sub(r"[^\w\s.\-()]", "", name)
    return name[:200] or "uploaded_document"


def validate_upload(filename: str, content: bytes) -> str:
    """Returns the validated lowercase extension, or raises."""
    if len(content) > MAX_FILE_BYTES:
        raise FileTooLargeError(
            f"File is {len(content) / 1_048_576:.1f} MB, exceeding the "
            f"{MAX_FILE_BYTES / 1_048_576:.0f} MB limit."
        )
    if len(content) == 0:
        raise UnsupportedFileError("File is empty.")

    ext = Path(_sanitize_filename(filename)).suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise UnsupportedFileError(
            f"Unsupported file type '{ext or 'unknown'}'. Supported: {sorted(_ALLOWED_EXTENSIONS)}."
        )

    if ext == ".pdf" and not content.startswith(_PDF_MAGIC):
        raise UnsupportedFileError(
            "File has a .pdf extension but does not look like a real PDF (magic-byte check failed)."
        )
    if ext == ".docx" and not content.startswith(_DOCX_MAGIC):
        raise UnsupportedFileError(
            "File has a .docx extension but does not look like a real DOCX "
            "(magic-byte check failed)."
        )

    return ext


def extract_text(filename: str, content: bytes, ext: str) -> ExtractedDocument:
    safe_name = _sanitize_filename(filename)

    if ext == ".pdf":
        try:
            reader = PdfReader(io.BytesIO(content))
        except PdfReadError as exc:
            raise UnsupportedFileError(f"Could not parse PDF: {exc}") from exc
        if len(reader.pages) > MAX_PDF_PAGES:
            raise FileTooLargeError(
                f"PDF has {len(reader.pages)} pages, exceeding the {MAX_PDF_PAGES}-page limit."
            )
        pages = []
        total_chars = 0
        for i, page in enumerate(reader.pages, start=1):
            text = (page.extract_text() or "").strip()
            total_chars += len(text)
            pages.append(ExtractedPage(page_number=i, text=text))
            if total_chars > MAX_EXTRACTED_CHARS:
                break
        full_text = "\n\n".join(p.text for p in pages)[:MAX_EXTRACTED_CHARS]
        return ExtractedDocument(
            filename=safe_name,
            extraction_method="pypdf_direct_text",
            page_count=len(reader.pages),
            pages=pages,
            full_text=full_text,
            truncated=total_chars > MAX_EXTRACTED_CHARS,
        )

    if ext == ".docx":
        try:
            doc = DocxDocument(io.BytesIO(content))
        except Exception as exc:  # noqa: BLE001 -- any python-docx failure is a real extraction failure
            raise UnsupportedFileError(f"Could not parse DOCX: {exc}") from exc
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        full_text = "\n".join(paragraphs)[:MAX_EXTRACTED_CHARS]
        return ExtractedDocument(
            filename=safe_name,
            extraction_method="python_docx_paragraphs",
            page_count=1,
            pages=[ExtractedPage(page_number=1, text=full_text)],
            full_text=full_text,
            truncated=len("\n".join(paragraphs)) > MAX_EXTRACTED_CHARS,
        )

    # .txt / .md
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1", errors="replace")
    truncated = len(text) > MAX_EXTRACTED_CHARS
    text = text[:MAX_EXTRACTED_CHARS]
    return ExtractedDocument(
        filename=safe_name,
        extraction_method="plain_text_decode",
        page_count=1,
        pages=[ExtractedPage(page_number=1, text=text)],
        full_text=text,
        truncated=truncated,
    )


_DATE_PATTERN = re.compile(
    r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b"
    r"|\b\d{1,2}/\d{1,2}/\d{2,4}\b"
)
_ORG_KEYWORDS = [
    "Board of Supervisors",
    "Health Advisory Commission",
    "Public Health Department",
    "County of Santa Clara",
    "Santa Clara Valley Health",
    "Behavioral Health Services",
    "HCAI",
    "Health and Hospital System",
]
_AGENDA_ITEM_PATTERN = re.compile(
    r"^\s*(?:Item|Agenda Item)?\s*#?\s*(\d{1,2}(?:\.\d{1,2})?)[.):]\s+(.{5,150})$", re.MULTILINE
)
_MONEY_PATTERN = re.compile(
    r"\$\s?\d[\d,]*(?:\.\d+)?\s?(?:million|thousand|M\b|K\b)?", re.IGNORECASE
)

_INJECTION_PATTERNS = [
    re.compile(r"ignore (?:all |any )?(?:previous|prior|above) instructions", re.IGNORECASE),
    re.compile(r"disregard (?:all |any )?(?:previous|prior|above)", re.IGNORECASE),
    re.compile(r"system prompt", re.IGNORECASE),
    re.compile(r"you are now", re.IGNORECASE),
    re.compile(r"reveal (?:your|the) (?:api key|credentials|secret)", re.IGNORECASE),
    re.compile(r"send (?:the |your )?api key", re.IGNORECASE),
    re.compile(r"delete (?:all )?files", re.IGNORECASE),
    re.compile(r"execute the following", re.IGNORECASE),
    re.compile(r"open (?:this|the following) (?:external )?url", re.IGNORECASE),
]


def _parse_money(raw: str) -> float | None:
    cleaned = raw.replace("$", "").replace(",", "").strip()
    multiplier = 1.0
    lowered = cleaned.lower()
    if "million" in lowered or lowered.endswith("m"):
        multiplier = 1_000_000
        cleaned = re.sub(r"(?i)million|m$", "", cleaned).strip()
    elif "thousand" in lowered or lowered.endswith("k"):
        multiplier = 1_000
        cleaned = re.sub(r"(?i)thousand|k$", "", cleaned).strip()
    try:
        return float(cleaned) * multiplier
    except ValueError:
        return None


def detect_structure(text: str) -> DetectedStructure:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    title = lines[0][:200] if lines else None

    dates = list(dict.fromkeys(_DATE_PATTERN.findall(text)))[:10]
    organizations = [org for org in _ORG_KEYWORDS if org.lower() in text.lower()]
    agenda_items = [
        f"{num}. {desc.strip()}" for num, desc in _AGENDA_ITEM_PATTERN.findall(text)
    ][:30]

    amounts = []
    for match in _MONEY_PATTERN.finditer(text):
        value = _parse_money(match.group())
        if value is not None:
            amounts.append(DetectedFinancialAmount(raw_text=match.group(), approximate_value=value))
    amounts = amounts[:20]

    return DetectedStructure(
        title=title,
        dates=dates,
        organizations=organizations,
        agenda_item_headers=agenda_items,
        financial_amounts=amounts,
    )


def detect_geographies(text: str, known_place_names: list[str]) -> list[str]:
    lowered = text.lower()
    return [
        name for name in known_place_names if re.search(rf"\b{re.escape(name.lower())}\b", lowered)
    ]


@dataclass(frozen=True)
class _TopicDefinition:
    topic_id: str
    label: str
    keywords: list[str]
    metrics: list[str]
    scenarios: list[str]
    resource_categories: list[str]
    unavailable_reason: str | None


def load_topic_ontology() -> list[_TopicDefinition]:
    if not TOPIC_ONTOLOGY_PATH.exists():
        return []
    with TOPIC_ONTOLOGY_PATH.open(encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    return [
        _TopicDefinition(
            topic_id=t["topic_id"],
            label=t["label"],
            keywords=list(t.get("keywords", [])),
            metrics=list(t.get("metrics", [])),
            scenarios=list(t.get("scenarios", [])),
            resource_categories=list(t.get("resource_categories", [])),
            unavailable_reason=t.get("unavailable_reason"),
        )
        for t in (raw.get("topics", []) if raw else [])
    ]


def detect_topics(text: str, ontology: list[_TopicDefinition]) -> list[TopicMatch]:
    lowered = text.lower()
    matches = []
    for topic in ontology:
        matched_keywords = [kw for kw in topic.keywords if kw.lower() in lowered]
        if matched_keywords:
            matches.append(
                TopicMatch(
                    topic_id=topic.topic_id,
                    label=topic.label,
                    matched_keywords=matched_keywords,
                    metrics=topic.metrics,
                    scenarios=topic.scenarios,
                    resource_categories=topic.resource_categories,
                    unavailable_reason=topic.unavailable_reason,
                )
            )
    return matches


def detect_injection_patterns(text: str) -> list[str]:
    """Flags suspicious instruction-like phrasing for a UI warning banner
    -- never blocks legitimate analysis, and never causes the application
    or an LLM to actually follow anything found here (docs/05 §14,
    docs/09 "Prompt injection and AI tool safety")."""
    found = []
    for pattern in _INJECTION_PATTERNS:
        match = pattern.search(text)
        if match:
            found.append(match.group())
    return found


def hash_content(content: bytes) -> str:
    import hashlib

    return hashlib.sha256(content).hexdigest()[:16]


def analyze_document(
    filename: str, content: bytes, known_place_names: list[str]
) -> DocumentAnalysisResult:
    ext = validate_upload(filename, content)
    extracted = extract_text(filename, content, ext)
    structure = detect_structure(extracted.full_text)
    geographies = detect_geographies(extracted.full_text, known_place_names)
    ontology = load_topic_ontology()
    topics = detect_topics(extracted.full_text, ontology)
    injection_warnings = detect_injection_patterns(extracted.full_text)

    excerpt_by_page = {
        p.page_number: (p.text[:400] + ("…" if len(p.text) > 400 else ""))
        for p in extracted.pages[:20]
    }

    return DocumentAnalysisResult(
        filename=extracted.filename,
        file_hash=hash_content(content),
        extraction_method=extracted.extraction_method,
        page_count=extracted.page_count,
        truncated=extracted.truncated,
        structure=structure,
        detected_geographies=geographies,
        detected_topics=topics,
        injection_warnings=injection_warnings,
        excerpt_by_page=excerpt_by_page,
    )
