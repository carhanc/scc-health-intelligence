# AI production-readiness guide (Phase 9)

## Current production status: AI-assisted mode is OFF

This release's Render deployment does not set `ANTHROPIC_API_KEY` (see `docs/deployment/production-deployment-guide.md` step 4.8, explicit "leave unset for this release"). Every user gets Copilot's **deterministic mode** — zero-configuration, always available, reuses the exact same generation functions as the Advocate page's brief builder (`DECISIONS.md` DEC-063). This is a deliberate decision (DEC-066), not an oversight or a temporary gap.

## What's already structurally safe, regardless of whether AI mode is ever enabled

These are architectural properties, not configuration toggles — they hold whether or not `ANTHROPIC_API_KEY` is ever set:

- The API key, if configured, is read server-side only (`Settings.anthropic_api_key`) and never reaches the browser bundle (verified this phase by grepping the built `.next/static/` output — zero matches).
- Every AI-assisted response is validated post-generation: a claimed citation to an evidence_id the model was never given is silently discarded, never surfaced (`_validate_citations()`, DEC-064).
- Uploaded document text is always passed as clearly delimited, labeled data ("UNTRUSTED DOCUMENT TEXT"), never concatenated into a system prompt or treated as an instruction (`docs/methods/document-intelligence.md` §5).
- The system prompt explicitly forbids causal claims, individual risk claims, and revealing its own instructions or any secret.
- A provider failure (timeout, malformed response, rate limit) returns a 502 with a clear message — it never silently falls back to fabricated content, and it never takes down the rest of the Advocate workflow (deterministic mode remains fully usable regardless of AI-provider health).

## Before enabling AI-assisted mode in a future release

1. **Run the golden-evaluation suite with a real key:**
   ```bash
   ANTHROPIC_API_KEY=sk-... uv run python scripts/copilot_golden_eval.py
   ```
   This exercises both the deterministic and AI-assisted providers against the same 5 cases (citation grounding, non-causal language, prompt-injection resistance, empty-evidence handling, missing-evidence identification) plus the platform-side citation validator, independent of any provider.

2. **Expand the golden set.** 5 cases is a real starting point, not a complete evaluation — before real users rely on AI-assisted output, add cases for: malformed/truncated provider responses, request timeout behavior, a geography/evidence mismatch (evidence for one place, a question about another), and a source-mismatch case (evidence citing one publisher, a claim attributing it to another).

3. **Run a live adversarial pass.** The golden-eval script's `prompt_injection_resistance` case uses one fixed phrasing; a real red-team pass should try variations the fixed test suite doesn't cover, since an LLM's behavior against a live model can differ from what a scripted test anticipates.

4. **Add production rate limiting and budget caps specifically for the AI path**, beyond the existing per-IP request-count limiter (`rate_limit.py`, which limits request *frequency* but not token/cost spend). Consider a per-day or per-month token budget with a hard cutoff to deterministic-only fallback if exceeded, so a traffic spike can't produce an unbounded bill.

5. **Decide and document retention.** Currently, AI-assisted requests are stateless — no conversation history, no logged request/response content. Confirm this remains true before enabling in production, and if it changes, update `docs/observability/runbook.md`'s "what must never enter telemetry" section and the Copilot user guide.

6. **Re-run this checklist after any change** to `copilot_provider.py`'s system prompt, citation-validation logic, or provider selection — a prompt change is exactly the kind of thing that can silently regress safety behavior the golden-eval suite is meant to catch before real users see it.

See `RISK_REGISTER.md` RISK-032 for this item's tracked status.
