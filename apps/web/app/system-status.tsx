"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Phase-1 vertical-slice component: proves the frontend can make one typed
 * request to the FastAPI backend and that the backend can reach the DuckDB
 * warehouse. This is a developer/status view, not the final Overview page
 * design (built in Phase 5) — it exists to satisfy the Gate 1 requirement
 * of "one typed API request" end to end.
 */
export function SystemStatus() {
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: api.getHealth,
    retry: 1,
  });
  const warehouseQuery = useQuery({
    queryKey: ["warehouse-status"],
    queryFn: api.getWarehouseStatus,
    retry: 1,
  });

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        System status (developer view)
      </h2>
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-[var(--color-text-secondary)]">
            API health
          </dt>
          <dd className="font-medium">
            {healthQuery.isLoading && "Checking…"}
            {healthQuery.isError && (
              <span className="text-[var(--color-alert)]">
                Unavailable — is the API dev server running?
              </span>
            )}
            {healthQuery.data && (
              <span className="text-[var(--color-interactive)]">
                {healthQuery.data.status} ({healthQuery.data.service})
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--color-text-secondary)]">
            DuckDB warehouse
          </dt>
          <dd className="font-medium">
            {warehouseQuery.isLoading && "Checking…"}
            {warehouseQuery.isError && (
              <span className="text-[var(--color-alert)]">Unavailable</span>
            )}
            {warehouseQuery.data && (
              <span
                className={
                  warehouseQuery.data.connected
                    ? "text-[var(--color-interactive)]"
                    : "text-[var(--color-caution)]"
                }
              >
                {warehouseQuery.data.connected ? "connected" : "not connected"}{" "}
                · spatial extension{" "}
                {warehouseQuery.data.spatial_extension_loaded
                  ? "loaded"
                  : "not loaded"}
              </span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
