# Build Pack Manifest

## Entry points

- `START_HERE.txt` — minimal execution sequence.
- `README_FIRST.md` — detailed local and Claude Desktop workflow.
- `BOOTSTRAP_PROMPT.txt` — first prompt to paste into Claude Code.
- `CONTINUATION_PROMPT.txt` — prompt for every later session.
- `FINAL_VERIFICATION_PROMPT.txt` — adversarial final audit.
- `UX_REVIEW_PROMPT.txt` — independent UI/UX/accessibility review.
- `METHODS_REVIEW_PROMPT.txt` — independent data/methods review.
- `MASTER_BUILD_PROMPT.md` — consolidated product and technical directive.
- `CLAUDE.md` — persistent repository-level instructions.

## Detailed specifications

- `docs/00_PRODUCT_CHARTER.md` — mission, users, outcomes, non-goals, product standards.
- `docs/01_UX_UI_SPEC.md` — information architecture, workflows, visual system, accessibility, responsive behavior, states, and usability tests.
- `docs/02_DATA_SOURCE_REGISTRY.md` — official sources, geography, provenance, refresh, and fallback rules.
- `docs/03_ANALYTICS_METHODS.md` — domains, uncertainty, sensitivity, access, optimization, validation, and interpretation.
- `docs/04_ARCHITECTURE_IMPLEMENTATION.md` — monorepo, frontend/backend, storage, API, tooling, deployment, and commands.
- `docs/05_AI_COPILOT.md` — deterministic mode, optional LLM, tools, document intelligence, citations, and safety.
- `docs/06_ACCEPTANCE_TESTS.md` — hard release criteria and test requirements.
- `docs/07_BUILD_PHASES.md` — gated phase execution and final adversarial review.
- `docs/08_CONTENT_REPORTING.md` — content rules, report structures, claims/evidence, citations, and exports.
- `docs/09_SECURITY_PRIVACY_GOVERNANCE.md` — privacy, security, prompt injection, governance, fairness, and operations.

## How the pieces work together

`CLAUDE.md` is the persistent policy. The focused specifications preserve details across long builds. `BOOTSTRAP_PROMPT.txt` directs Claude to read them and plan first. `CONTINUATION_PROMPT.txt` prevents context resets from causing rework. The three review prompts force independent verification rather than accepting the builder’s own confidence.
