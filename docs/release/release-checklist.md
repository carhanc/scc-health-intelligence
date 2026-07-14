# Phase 9 release checklist

Evidence-based, matching `docs/09_SECURITY_PRIVACY_GOVERNANCE.md`'s release governance checklist. Each item states what was actually run/verified this phase, not an assertion.

- [x] **Threat model reviewed.** `docs/09_SECURITY_PRIVACY_GOVERNANCE.md` "Application threat model" (Phases 1-8) + this phase's hardening pass (CORS allowlist, TrustedHost, security headers, rate limiting, structured logging) — see `DECISIONS.md` DEC-066 and this file's own commit for what changed.
- [x] **No high-severity unresolved security findings.** `docs/security/dependency-audit.md`: 0 findings in `pip-audit`, 0 in `pnpm audit --audit-level=high` (1 moderate found and fixed).
- [x] **Secrets scan clean.** `git status`/`git diff` reviewed before commit; no `.env.local` or key material staged; client-bundle grep confirmed zero server-side secret names leak into `.next/static/`.
- [x] **Dependency audit reviewed.** `docs/security/dependency-audit.md`, live-run this session.
- [x] **Upload limits and safe parsing tested.** Unchanged from Phase 8 (`apps/api/tests/test_document_intelligence.py`, `test_documents_routes.py`), re-verified passing this phase; document-analysis route now additionally rate-limited (`apps/api/tests/test_rate_limit.py`).
- [x] **Prompt-injection tests pass.** `test_document_intelligence.py`'s 5 adversarial-phrasing cases + `scripts/copilot_golden_eval.py`'s `prompt_injection_resistance` case, both passing.
- [x] **Copilot tools are read-only and typed.** Unchanged architectural property (DEC-030) — the API layer never performs a write from a Copilot/Advocate request; `EvidenceItem`/`GroundedRequest`/`GroundedResponse` are fully typed Pydantic/dataclass models.
- [x] **PHI warning and acknowledgement are present.** Unchanged from Phase 8, re-verified in this phase's Playwright regression run (`e2e/advocate-document.spec.ts`).
- [x] **Data retention and deletion behavior are documented.** `docs/security/document-handling.md` (Phase 8) + `docs/user-guide/advocate.md`'s "Saving and reopening your work" section.
- [x] **Source licenses and attribution are documented.** `DATA_MANIFEST.json` (per-source `license_or_terms` field, unchanged); homepage footer attribution (`apps/web/app/page.tsx`).
- [x] **Model card lists intended and prohibited uses.** `MODEL_CARD.md` "Intended uses"/"Prohibited / unsupported uses" sections, unchanged, plus this phase's "Advocacy evidence and Copilot capabilities" addition.
- [x] **Score/version changes are traceable.** No metric/scenario scoring logic changed this phase (Phase 9 is production hardening, not analytics work) — `DATA_DICTIONARY.md`'s versioning policy unchanged.
- [x] **Suppression and uncertainty are preserved.** No analytics code touched this phase; unchanged from Phase 4-7's audited behavior (`make audit`, live-run, all passing).
- [ ] **Accessibility and equity reviews are complete.** Accessibility: yes, live axe-core + keyboard + responsive suites all passing this phase (see final gates). **Equity review specifically remains the disclosed, not-yet-populated `MODEL_CARD.md` "Fairness considerations" section** — unchanged gap from Phase 4, not addressed this phase (out of Phase 9's production-hardening scope; still an open item for a future phase).
- [x] **Last-known-good source rollback works.** `docs/deployment/rollback-guide.md`'s data-artifact rollback mechanism, verified by design (each `publish_data_artifact.py` run creates a new, non-destructive tagged release) though not exercised against a real second deployment this session (no live Render/Vercel deployment exists yet to roll back on).
- [x] **Exports contain methods and limitation statements.** Unchanged from Phase 7/8 (decision memo, Advocate outputs) — every export includes a non-causal disclaimer, sources, and limitations.
- [x] **Hosted deployment has secure headers, rate limits, and no browser-exposed secrets.** This phase's core work: `apps/api/src/scc_health_api/middleware.py` (security headers), `rate_limit.py` (document/Copilot rate limiting), environment-driven CORS/TrustedHost, and a live-verified client-bundle grep confirming zero secret leakage.

## Additional Phase 9-specific items

- [x] `make lint` / `make typecheck` / `make test` / `make audit` / `make build` all pass.
- [x] Full Playwright suite (desktop + mobile) passes, including new `production-smoke.spec.ts`.
- [x] `scripts/smoke_test.py` passes against local dev servers (11/11 checks).
- [x] `scripts/copilot_golden_eval.py` passes in deterministic mode (5/5 cases + citation validator).
- [x] `scripts/build_production_manifest.py` runs successfully against the real local warehouse (59 tables, 670,291 rows).
- [x] CI workflow YAML syntax validated; all `uses:` actions pinned to verified commit SHAs.
- [ ] **Deploy workflow (`deploy.yml`) exercised against a real Render/Vercel deployment.** Not possible this session — no cloud accounts/credentials available to this assistant. See `docs/deployment/production-deployment-guide.md` for the exact steps the repository owner must run.
- [ ] **Scheduled-refresh workflow (`scheduled-refresh.yml`) exercised on a real GitHub Actions runner.** Not possible this session (would require repo secrets and a real `gh` release). YAML-validated and each constituent command (`make data`, `make audit`, `make data-manifest`, `publish_data_artifact.py`) independently verified locally.
