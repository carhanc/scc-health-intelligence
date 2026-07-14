.PHONY: bootstrap data demo dev dev-web dev-api test test-unit test-e2e audit \
        export-demo lint typecheck docs build clean-generated refresh \
        data-manifest publish-data smoke-test

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
	uv run --package scc-health-pipeline python -m scc_health_pipeline.run_core_sources_pipeline
	uv run --package scc-health-pipeline python -m scc_health_pipeline.run_resource_canonicalization
	uv run --package scc-health-pipeline python -m scc_health_pipeline.run_build_network_graphs
	uv run --package scc-health-pipeline python -m scc_health_pipeline.run_access_metrics_pipeline
	uv run --package scc-health-pipeline python -m scc_health_pipeline.run_analytics_pipeline
	uv run --package scc-health-pipeline python -m scc_health_pipeline.run_utilization_pipeline
	@echo "make data: geography spine (Phase 2) + core sources (Phase 3) + analytics/"
	@echo "scoring/uncertainty/optimization (Phase 4) + resource canonicalization +"
	@echo "OSM network graphs + real network/transit/E2SFCA access metrics (Phase 6) +"
	@echo "HCAI ED utilization/crosswalk allocation and criterion validity (Phase 7)"
	@echo "implemented. See TASKS.md for scope and DECISIONS.md for documented"
	@echo "scope-narrowing decisions. Note: the OSM network graph download is a live"
	@echo "multi-minute Overpass API extract on first run (~4 min total); subsequent"
	@echo "runs reuse the cached data/raw/osm_network/*.graphml files unless deleted."
	@echo "run_access_metrics_pipeline is a separate real batch computation over"
	@echo "~1,173 population origins (live-measured ~59 minutes); it is NOT cached"
	@echo "and re-runs at full cost every time, unlike the OSM graph download."

demo:
	uv run --package scc-health-pipeline python -m scc_health_pipeline.run_demo_pipeline
	@echo "make demo: geography demo snapshot implemented (Phase 2), offline, no network access."
	@echo "Health/social/resource/utilization demo data (Phase 3 sources) is not yet frozen"
	@echo "into an offline demo snapshot -- 'demo' mode currently covers geography only;"
	@echo "'live' mode (make data) covers all Phase 3 sources. See TASKS.md and STATE.md."

dev:
	@echo "Starting API and web dev servers. Ctrl-C stops both."
	@$(MAKE) -j2 dev-api dev-web

dev-web:
	pnpm --filter @scc-health/web dev

dev-api:
	uv run --package scc-health-api uvicorn scc_health_api.main:app --reload --port $${SCC_HEALTH_API_PORT:-8000}

test: test-unit
	@echo "make test: unit/component tests only. Run 'make test-e2e' for the"
	@echo "Playwright browser suite (search/selection/comparison/accessibility/"
	@echo "responsive) -- kept separate since it needs live API+web servers."

test-unit:
	uv run pytest apps/api/tests pipelines/tests
	pnpm -r test

test-e2e:
	pnpm --filter @scc-health/web e2e

audit:
	uv run python scripts/check_clean_room.py
	uv run --package scc-health-pipeline python -m scc_health_pipeline.run_audits
	@echo "make audit: geography, core-source data-quality, freshness/vintage, and"
	@echo "analytics-output audits (score bounds, coverage suppression, uncertainty"
	@echo "presence, tautology guard, contribution-sum identity) all implemented"
	@echo "(Phases 2-4). See TASKS.md."

export-demo:
	uv run python scripts/export_demo.py
	@echo "make export-demo: packages the real, frozen offline demo geography snapshot"
	@echo "(data/demo/geography/) as exports/scc_health_demo_geography.zip. Health/social/"
	@echo "analytics/utilization data has no offline snapshot yet (RISK-019/RISK-029) --"
	@echo "the zip's own README says so honestly, it does not claim a full data export."

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

# --- Phase 9: production data artifact ---

data-manifest:
	uv run python scripts/build_production_manifest.py

publish-data: data-manifest
	uv run python scripts/publish_data_artifact.py
	@echo "Built the local artifact and printed the 'gh release create' command."
	@echo "Re-run with 'uv run python scripts/publish_data_artifact.py --publish' to"
	@echo "actually publish (requires 'gh auth login' first)."

smoke-test:
	uv run python scripts/smoke_test.py --frontend-url $${FRONTEND_URL:-http://localhost:3000} --backend-url $${BACKEND_URL:-http://localhost:8000}
