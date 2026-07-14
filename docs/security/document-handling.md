# Document upload and handling (Phase 8)

This is the Phase 8 implementation record for `docs/09_SECURITY_PRIVACY_GOVERNANCE.md`'s "File upload" and "Prompt injection and AI tool safety" requirements, specific to the Advocate page's document-intelligence feature. Read `docs/09_SECURITY_PRIVACY_GOVERNANCE.md` first for the general policy; this document records exactly how it's implemented and tested.

## What a user can upload

- **Formats**: PDF, plain text (`.txt`), Markdown (`.md`), DOCX.
- **Size limit**: 15 MB.
- **PDF page limit**: 300 pages.
- **Extracted-text limit**: 2,000,000 characters (a decompression-bomb / pathological-file guard — a document that hits this is marked `truncated: true` in its result, never silently cut with no disclosure).

## Validation, in order (`document_intelligence.validate_upload`)

1. Reject empty files and files over the 15 MB limit before any parsing is attempted.
2. Reject any extension outside the allowlist (`.pdf`, `.txt`, `.md`, `.docx`) — case-insensitively, after stripping any path component from the filename.
3. For `.pdf` and `.docx`, check the file's first bytes against the real file-format magic number (`%PDF-` / the `PK\x03\x04` zip signature) — a file renamed to look like a supported type but that isn't one is rejected even if its extension passes.
4. Parse with `pypdf` (PDF) or `python-docx` (DOCX) — both are pure text-extraction libraries with no macro or embedded-content execution path. A parse failure (corrupt or malformed file) is surfaced to the user as a clear error, never a silent partial result.

## What happens to the bytes

- Uploaded content is read into request memory only. It is never written to disk, never cached, and never persisted beyond the single request that analyzes it.
- The API does not log document contents, filenames beyond what's needed for the response, or extracted text (`docs/09` "Application threat model").
- The frontend workspace stores only the **extracted findings** (detected topics, geographies, dates, agenda items, a content hash, and short excerpts capped at 400 characters per page) — never the raw uploaded bytes. This is enforced by the `UploadedDocumentMeta` type in the workspace schema, which has no field for raw file content.
- "Clear all uploaded-document data" removes these findings from the workspace immediately.

## Filename handling

`_sanitize_filename()` strips any path component (`Path(filename).name`), Unicode-normalizes the result, strips characters outside a safe set (`\w\s.\-()`), and truncates to 200 characters. The sanitized name is what's ever displayed or stored — a filename is data to show the user, never a value used to construct a filesystem path (`docs/09` "no user-controlled file paths").

## PHI and authorization

Before any upload control is enabled, the user must check an explicit acknowledgment that they are authorized to upload the document and that it should not contain protected health information. This platform has no PHI storage or handling capability by design (`CLAUDE.md`) — the acknowledgment is a real gate, not a formality: the upload button (`apps/web/app/advocate/document-entry.tsx`) is disabled until it is checked, and this is covered by an end-to-end test (`e2e/advocate-document.spec.ts`, "upload is blocked until the PHI acknowledgement is checked").

## Prompt-injection defense

Document text is scanned for instruction-like phrasing (`detect_injection_patterns()`) and, if found, surfaces a **visible warning** to the user. This is a disclosure mechanism, not the actual defense — see [Document Intelligence methodology](../methods/document-intelligence.md) §5 for why a document can never actually instruct this application or an AI provider regardless of what it contains: extracted text is always passed as clearly delimited **data**, never concatenated into a system prompt, and every AI-assisted response is validated post-generation against only the evidence it was actually given.

Tests: `apps/api/tests/test_document_intelligence.py` includes five parametrized adversarial-phrasing cases; `apps/api/tests/test_copilot_provider.py` proves a model-claimed citation to evidence it was never given is always discarded, which is the mechanism that would catch an injection attempt that somehow got prose generated regardless.

## Third-party transmission

- Deterministic-mode document analysis (extraction, structure/topic/geography detection) never leaves this platform's own server.
- Document text is only ever sent to an external AI provider if AI-assisted Copilot mode is both configured by the operator (a server-side `ANTHROPIC_API_KEY`) **and** explicitly selected by the user for that specific request. There is no automatic or background transmission of uploaded content to any third party.

## Rejected-file behavior

An oversized, wrong-type, or malformed-but-correctly-typed file produces a clear, specific error message (e.g. "File is 22.4 MB, exceeding the 15 MB limit.") — never a generic failure, a silent drop, or a partial/fabricated result. Covered by `apps/api/tests/test_documents_routes.py` (oversized → 413, unsupported extension → 400, fake-magic-bytes → 400, empty file → 400) and `e2e/advocate-document.spec.ts` ("rejects a file with an unsupported extension").
