# Incident response (Phase 9)

This is a single, anonymous-user, no-PHI, browser-local-workspace platform (`DECISIONS.md` DEC-066) — the incident surface is smaller than a multi-tenant SaaS product, and this document is scoped to what's actually possible given that architecture, not a generic template.

## Severity levels

- **Critical:** secret exposure, unauthorized write access to the repository or hosting accounts, or a live deployment serving fabricated/incorrect data as if it were real.
- **High:** a malicious upload succeeding at something it shouldn't (e.g. escaping the in-memory-only processing boundary), a dependency vulnerability with a known exploit, or the deployed backend/frontend down for an extended period.
- **Medium:** an AI-assisted response (if that mode is ever enabled) containing an unsupported claim that reached a user, or a scheduled refresh silently failing repeatedly without anyone noticing.
- **Low:** anything caught and contained before reaching a real user (e.g. an audit check correctly blocking a bad data build).

## Suspected secret exposure

1. Immediately rotate the exposed credential at its source (Anthropic console, Census/HUD portal, Sentry project settings, Render/Vercel dashboard, GitHub token settings).
2. If it was committed to git history: rotate first, then decide whether history rewriting is worth the disruption — a rotated secret is safe even if the old value remains visible in history.
3. Check `docs/security/dependency-audit.md`'s "GitHub Actions supply chain" section and this repo's Actions secrets — confirm no workflow logged the value (our workflows never `echo` a secret; verify this held).
4. Document what happened and the fix in `RISK_REGISTER.md`.

## Malicious upload

Document Intelligence (`docs/security/document-handling.md`) already enforces: extension allowlist, magic-byte validation, size/page/character caps, in-memory-only processing (never written to disk), and prompt-injection detection. If a malicious upload is suspected to have done something unexpected:

1. Confirm from the request logs (structured JSON, `docs/observability/runbook.md`) whether the request was rejected (4xx) or processed (2xx) — content itself is never logged, so this confirms scope without exposing the file.
2. If processed: check whether `apps/api/tests/test_document_intelligence.py`'s existing adversarial-phrasing tests cover the pattern; if not, add a new regression test reproducing it (using a redacted/synthetic version of the trigger, never the real uploaded content) before considering this closed.
3. Because uploads are never persisted, there is no "delete the malicious file" step — it was already gone the moment the request completed.

## Source poisoning or corrupted refresh

Covered structurally by `docs/data/refresh-runbook.md`'s build-validate-publish sequence — `make audit` is the primary defense, and a failed audit means nothing gets published. If a bad data artifact is somehow published anyway (an audit-coverage gap):

1. Roll back immediately via `docs/deployment/rollback-guide.md`'s data-artifact rollback steps.
2. Identify what the audit suite should have caught but didn't, and add that check to `pipelines/src/scc_health_pipeline/validation/` (or the relevant audit module) before the next scheduled refresh runs.
3. Record the gap and fix in `RISK_REGISTER.md`.

## Incorrect high-impact analysis

If a metric, score, or correlation is found to be computed incorrectly:

1. Determine whether it's a code bug (fix + add a regression test) or a methodology issue (needs a `DECISIONS.md` entry and possibly a metric-registry version bump per `docs/09_SECURITY_PRIVACY_GOVERNANCE.md` "Governance for scores and models" — never a silent in-place correction of a versioned metric).
2. If already deployed: this is the one case that may need `docs/deployment/rollback-guide.md`'s code rollback (if the bug is in scoring logic) in addition to a data rollback.
3. Document in `RISK_REGISTER.md` and, if the platform was actively relied upon for a real decision during the affected window, consider what user-notification is appropriate (there is no account system to email — a dated notice on the Data/Validate page is the realistic mechanism).

## Unauthorized access

There is no authentication system in this release (anonymous, browser-local workspaces by design) — "unauthorized access" here means unauthorized access to the **hosting/repository infrastructure itself** (Render, Vercel, GitHub), not a user account system.

1. Rotate all credentials for the affected service immediately.
2. Review Render/Vercel/GitHub's own access logs for the account.
3. Check recent deploys and commits for anything unexpected; roll back if needed.

## Dependency vulnerability

Handled routinely by the CI `security-audit` job (`pip-audit` + `pnpm audit`, both required checks on every PR — `docs/security/dependency-audit.md`). For an urgent out-of-band finding (e.g. a zero-day announced for a dependency already in use):

1. Check if a patched version is available; bump and re-run the full test suite.
2. If no patch exists yet: assess actual exposure (is the vulnerable code path even reachable in this application's usage?) and document the interim risk acceptance in `docs/security/dependency-audit.md`.

## AI output containing unsupported claims

Only relevant if AI-assisted Copilot mode is ever enabled (off by default this release, DEC-066/RISK-032).

1. Confirm whether `_validate_citations()` (`copilot_provider.py`) should have caught it — if a claim was stated without ever appearing in the "Evidence used" list, that's the citation-grounding mechanism itself failing and needs an urgent fix + regression test in `apps/api/tests/test_copilot_provider.py`.
2. If the claim cited real evidence but drew an unsupported conclusion from it (a subtler failure the mechanical citation check can't catch), add the case to `scripts/copilot_golden_eval.py` and consider whether the system prompt needs tightening.
3. Given this mode is off in production for this release, any such finding blocks turning it on until resolved and re-evaluated (`scripts/copilot_golden_eval.py`).

## Postmortem requirements

For any Critical or High severity incident: a brief written postmortem (what happened, timeline, root cause, fix, and what regression test/audit check now prevents recurrence) appended to `RISK_REGISTER.md` or `DECISIONS.md` as appropriate — never just fixed silently with no record.
