"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useState } from "react";

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  caption: string;
  emptyMessage?: string;
  initialSorting?: SortingState;
  onRowSelect?: (row: T) => void;
  getRowId?: (row: T) => string;
  selectedRowId?: string;
}

/** A fully keyboard-accessible, sortable table -- the required
 * "everything visible on the map/chart must be available in a sortable,
 * filterable, keyboard-accessible table" equivalent (docs/01 §5.9,
 * acceptance §13). Column headers are real <button> elements so sort
 * state is keyboard- and screen-reader-operable, not click-only. */
export function DataTable<T>({
  data,
  columns,
  caption,
  emptyMessage = "No rows match the current filters.",
  initialSorting = [],
  onRowSelect,
  getRowId,
  selectedRowId,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: getRowId as ((row: T) => string) | undefined,
  });

  if (data.length === 0) {
    return (
      <p role="status" className="py-6 text-center text-sm text-[var(--color-text-secondary)]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-[var(--color-surface-sunken)]">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sortDirection = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      sortDirection === "asc"
                        ? "ascending"
                        : sortDirection === "desc"
                          ? "descending"
                          : canSort
                            ? "none"
                            : undefined
                    }
                    className="whitespace-nowrap px-3 py-2 font-semibold text-[var(--color-text-primary)]"
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex items-center gap-1 hover:text-[var(--color-interactive)]"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span aria-hidden="true" className="text-xs text-[var(--color-text-tertiary)]">
                          {sortDirection === "asc" ? "▲" : sortDirection === "desc" ? "▼" : "↕"}
                        </span>
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const rowId = getRowId ? getRowId(row.original) : row.id;
            const selected = selectedRowId === rowId;
            return (
              <tr
                key={row.id}
                aria-current={selected ? "true" : undefined}
                tabIndex={onRowSelect ? 0 : undefined}
                onClick={onRowSelect ? () => onRowSelect(row.original) : undefined}
                onKeyDown={
                  onRowSelect
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowSelect(row.original);
                        }
                      }
                    : undefined
                }
                className={`border-t border-[var(--color-border)] ${
                  onRowSelect ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)] focus-visible:-outline-offset-2" : ""
                } ${selected ? "bg-[var(--color-interactive-subtle)]" : "odd:bg-[var(--color-surface)] even:bg-[var(--color-surface-sunken)]"} hover:bg-[var(--color-interactive-subtle)]`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
