.PHONY: bootstrap data demo dev dev-web dev-api test test-unit test-e2e audit \
        export-demo lint typecheck docs build clean-generated refresh

# --- Required top-level commands (CLAUDE.md, docs/04 §21, docs/07 Phase 1) ---

bootstrap:
	./scripts/bootstrap_macos.sh

data:
	@echo "make data: source ingestion pipeline — implemented starting Phase 3."
	@echo "No adapters exist yet (Phase 1 scaffold only). See TASKS.md Phase 3."

demo:
	@echo "make demo: deterministic offline demo snapshot — implemented starting Phase 2."
	@echo "No demo snapshot exists yet (Phase 1 scaffold only). See TASKS.md Phase 2."

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
	@echo "make audit: data/analytics/output audits are added starting Phase 2-4. See TASKS.md."

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
