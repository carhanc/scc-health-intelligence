"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { FreshnessBadge } from "@scc-health/ui";
import {
  api,
  ApiError,
  type DataExplorerTable,
  type FreshnessState,
  type SourceStatusEntry,
} from "@/lib/api";

const AVAILABLE_STATES: FreshnessState[] = ["newest_verified", "intentional_older"];
const NEEDS_ATTENTION_STATES: FreshnessState[] = ["lagged", "stale"];
const UNAVAILABLE_STATES: FreshnessState[] = ["draft", "unavailable"];

type StatusFilter = "all" | "available" | "needs_attention" | "unavailable";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "available", label: "Available and current" },
  { id: "needs_attention", label: "Needs attention" },
  { id: "unavailable", label: "Unavailable" },
];

function matchesStatusFilter(entry: SourceStatusEntry, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "available") return AVAILABLE_STATES.includes(entry.freshness_state);
  if (filter === "needs_attention") return NEEDS_ATTENTION_STATES.includes(entry.freshness_state);
  return UNAVAILABLE_STATES.includes(entry.freshness_state);
}

/**
 * Phase 3 functional transparency tool: every manifest source (publisher,
 * vintage, retrieval time, freshness state, license) plus a live preview of
 * every warehouse table. Not the final Data module design from
 * docs/01_UX_UI_SPEC.md -- built to satisfy Phase 3's "internal
 * data-explorer/status page" requirement with real data, not a mockup.
 */
export function DataExplorer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedSchema = searchParams.get("schema");
  const selectedTable = searchParams.get("table");

  function selectTable(schemaName: string, tableName: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("schema", schemaName);
    params.set("table", tableName);
    router.push(`/data?${params.toString()}`);
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Sources
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Every source this platform attempts to load. A source with no table listed below is either an
          intermediate step used to build other tables, or a source we could not use for a documented reason.
        </p>
        <div className="mt-4">
          <SourcesTable />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Data tables
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Select a table to preview its columns and up to 50 rows, read live from the database.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
          <TablesList
            selectedSchema={selectedSchema}
            selectedTable={selectedTable}
            onSelect={selectTable}
          />
          <div>
            {selectedSchema && selectedTable ? (
              <TablePreview schemaName={selectedSchema} tableName={selectedTable} />
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-sm text-[var(--color-text-secondary)]">
                Select a table to see a preview.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SourcesTable() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const query = useQuery({
    queryKey: ["sources"],
    queryFn: api.getSources,
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <p role="status" className="text-sm text-[var(--color-text-secondary)]">
        Loading sources…
      </p>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-alert)]">
        {query.error instanceof ApiError
          ? `Couldn't load sources: ${query.error.message}`
          : "Couldn't load sources. Is the API running?"}
      </p>
    );
  }
  if (!query.data || query.data.sources.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)]">
        No sources recorded yet. Run <code>make data</code> first.
      </p>
    );
  }

  const searchLower = search.trim().toLowerCase();
  const filtered = query.data.sources
    .filter((s) => matchesStatusFilter(s, statusFilter))
    .filter(
      (s) =>
        searchLower.length === 0 ||
        s.publisher.toLowerCase().includes(searchLower) ||
        s.source_id.toLowerCase().includes(searchLower),
    )
    .sort((a, b) => a.publisher.localeCompare(b.publisher) || a.source_id.localeCompare(b.source_id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-1 min-w-[200px]">
          <span className="sr-only">Search sources by publisher or name</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by publisher or name…"
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              aria-pressed={statusFilter === f.id}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                statusFilter === f.id
                  ? "border-[var(--color-interactive)] bg-[var(--color-interactive-subtle)] text-[var(--color-interactive-hover)]"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-[var(--color-text-tertiary)]" role="status">
        {filtered.length} of {query.data.sources.length} sources
      </p>

      <div className="scroll-shadow-x overflow-x-auto rounded-lg border border-[var(--color-border)]">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <caption className="sr-only">
            Data sources with publisher, vintage, freshness, and license
          </caption>
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)] text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
              <th scope="col" className="px-3 py-2">
                Publisher
              </th>
              <th scope="col" className="px-3 py-2">
                Vintage
              </th>
              <th scope="col" className="px-3 py-2">
                Freshness
              </th>
              <th scope="col" className="px-3 py-2">
                Rows
              </th>
              <th scope="col" className="px-3 py-2">
                License
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry, i) => (
              // A real, confirmed duplicate exists in the manifest today
              // (two sources share source_id "osm_overpass_network"),
              // which previously produced a live React duplicate-key
              // console error -- the array index disambiguates without
              // masking that underlying data issue (tracked separately,
              // not silently hidden here).
              <SourceRow key={`${entry.source_id}-${i}`} entry={entry} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourceRow({ entry }: { entry: SourceStatusEntry }) {
  return (
    <tr className="border-b border-[var(--color-border)] last:border-0 odd:bg-[var(--color-surface)] even:bg-[var(--color-background)]">
      <td className="px-3 py-2 align-top">
        <a
          href={entry.landing_page}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-[var(--color-interactive)] underline underline-offset-2"
        >
          {entry.publisher}
        </a>
        <div className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
          <code>{entry.source_id}</code>
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <div>{entry.source_vintage}</div>
        <div className="text-xs text-[var(--color-text-secondary)]">
          retrieved {formatDate(entry.retrieved_at)}
          {entry.release_date && <> · released {entry.release_date}</>}
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <FreshnessBadge state={entry.freshness_state} />
      </td>
      <td className="px-3 py-2 align-top tabular-nums">
        {entry.row_count === null ? "—" : entry.row_count.toLocaleString()}
      </td>
      <td className="px-3 py-2 align-top text-[var(--color-text-secondary)]">
        {entry.license_or_terms}
      </td>
    </tr>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function TablesList({
  selectedSchema,
  selectedTable,
  onSelect,
}: {
  selectedSchema: string | null;
  selectedTable: string | null;
  onSelect: (schemaName: string, tableName: string) => void;
}) {
  const query = useQuery({
    queryKey: ["data-explorer"],
    queryFn: api.getDataExplorer,
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <p role="status" className="text-sm text-[var(--color-text-secondary)]">
        Loading tables…
      </p>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-alert)]">
        {query.error instanceof ApiError
          ? `Couldn't load tables: ${query.error.message}`
          : "Couldn't load tables. Is the API running?"}
      </p>
    );
  }
  if (!query.data) return null;

  const bySchema = groupBySchema(query.data.tables);

  return (
    <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
      {Object.entries(bySchema).map(([schemaName, tables]) => (
        <li key={schemaName}>
          <div className="bg-[var(--color-background)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {schemaName}
          </div>
          <ul>
            {tables.map((t) => (
              <li key={`${t.schema_name}.${t.table_name}`}>
                <button
                  type="button"
                  onClick={() => onSelect(t.schema_name, t.table_name)}
                  disabled={!t.available}
                  aria-current={
                    selectedSchema === t.schema_name && selectedTable === t.table_name
                      ? "true"
                      : undefined
                  }
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-background)] focus-visible:bg-[var(--color-background)] aria-[current=true]:bg-[var(--color-background)] aria-[current=true]:font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{t.table_name}</span>
                    <span className="text-xs tabular-nums text-[var(--color-text-secondary)]">
                      {t.available
                        ? `${t.row_count?.toLocaleString() ?? "0"} rows`
                        : "not built"}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    {t.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function groupBySchema(
  tables: DataExplorerTable[],
): Record<string, DataExplorerTable[]> {
  const out: Record<string, DataExplorerTable[]> = {};
  for (const t of tables) {
    const existing = out[t.schema_name] ?? [];
    existing.push(t);
    out[t.schema_name] = existing;
  }
  return out;
}

function TablePreview({
  schemaName,
  tableName,
}: {
  schemaName: string;
  tableName: string;
}) {
  const query = useQuery({
    queryKey: ["data-explorer-preview", schemaName, tableName],
    queryFn: () => api.getDataExplorerTablePreview(schemaName, tableName),
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <p role="status" className="text-sm text-[var(--color-text-secondary)]">
        Loading preview…
      </p>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-[var(--color-alert)]">
        {query.error instanceof ApiError
          ? `Couldn't load ${schemaName}.${tableName}: ${query.error.message}`
          : "Couldn't load this table preview."}
      </p>
    );
  }
  if (!query.data) return null;

  const { columns, rows, row_count, data_mode } = query.data;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
        <h3 className="text-sm font-semibold">
          {schemaName}.{tableName}
        </h3>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Showing {rows.length.toLocaleString()} of {row_count.toLocaleString()} rows ·{" "}
          {data_mode}
        </p>
      </div>
      <div className="scroll-shadow-x max-h-[480px] overflow-auto">
        <table className="w-full min-w-max border-collapse text-left text-xs">
          <caption className="sr-only">
            Preview of {schemaName}.{tableName}
          </caption>
          <thead className="sticky top-0 bg-[var(--color-background)]">
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col" className="whitespace-nowrap px-2 py-1.5 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-[var(--color-border)]">
                {columns.map((c) => (
                  <td key={c} className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                    {formatCell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
