.PHONY: bootstrap data demo dev dev-web dev-api test test-unit test-e2e audit \
        export-demo lint typecheck docs build clean-generated refresh

# Polars' native-CPU-feature check misfires on this project's reference dev
# machine (x86_64 Homebrew running under Rosetta on Apple Silicon -- see
# DECISIONS.md DEC-011); skip it rather than requiring every session to
# remember to export this manually.
export POLARS_SKIP_CPU_CHECK := 1

# --- Required top-level commands (CLAUDE.md, docs/04 §21, docs/07 Phase 1) ---

bootstrap:
	./scripts/bootstrap_macos.sh

data:
	uv run --package scc-health-pipeline python -m scc_health_pipeline.run_geography_pipeline
	@echo "make data: geography spine implemented (Phase 2). Health/social/utilization"
	@echo "sources are added starting Phase 3. See TASKS.md."

demo:
	uv run --package scc-health-pipeline python -m scc_health_pipeline.run_demo_pipeline
	@echo "make demo: geography demo snapshot implemented (Phase 2), offline, no network access."
	@echo "Health/social/utilization demo data added starting Phase 3. See TASKS.md."

dev:
	@echo "Starting API and web dev servers. Ctrl-C stops both."
	@$(MAKE) -j2 dev-api dev-web

dev-web:
	pnpm --filter @scc-health/web dev

dev-api:
	uv run --package scc-health-api uvicorn scc_health_api.main:app --reload --port $${SCC_HEALTH_API_PORT:-8000}

test: test-unit
	@echo "make test: e2e/accessibility suites are added starting Phase 5. See TASKS.md."

test-unit:
	uv run pytest apps/api/tests pipelines/tests
	pnpm -r test

test-e2e:
	@echo "make test-e2e: Playwright suite added starting Phase 5. See TASKS.md."

audit:
	uv run python scripts/check_clean_room.py
	uv run --package scc-health-pipeline python -m scc_health_pipeline.run_audits
	@echo "make audit: analytics/output audits beyond geography are added starting Phase 4. See TASKS.md."

export-demo:
	@echo "make export-demo: sample advocacy brief/evidence packet generation — implemented starting Phase 9."
	@echo "Not available yet (Phase 1 scaffold only). See TASKS.md Phase 9."

lint:
	uv run ruff check .
	pnpm -r lint

typecheck:
	uv run mypy apps/api/src pipelines/src
	pnpm -r typecheck

docs:
	@echo "Governance docs live at repo root and docs/. No generated-docs build step yet."

build:
	pnpm --filter @scc-health/web build

clean-generated:
	rm -rf apps/web/.next data/raw/* data/staged/* data/curated/* warehouse/*.duckdb warehouse/*.duckdb.wal
	find data/raw data/staged data/curated -mindepth 1 -not -name '.gitkeep' -delete 2>/dev/null || true

refresh:
	@if [ -z "$(SOURCE)" ]; then echo "Usage: make refresh SOURCE=<source_id>"; exit 1; fi
	@echo "make refresh SOURCE=$(SOURCE): per-source refresh jobs are added starting Phase 3."
