// IndexedDB persistence for AdvocacyWorkspace (Phase 8). Entirely
// browser-local -- no server call, no account, no claim of cloud sync
// (docs/09_SECURITY_PRIVACY_GOVERNANCE.md "Default local-first behavior").
// A thin Promise wrapper around the native IndexedDB API rather than a
// new npm dependency, since the operations needed (get/put/delete/getAll
// on one object store) are simple enough not to justify one.

import { type AdvocacyWorkspace, migrateWorkspace } from "./schema";

const DB_NAME = "scc_health_advocacy";
const DB_VERSION = 1;
const STORE_NAME = "workspaces";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "workspaceId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = fn(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB operation failed."));
    tx.oncomplete = () => db.close();
  });
}

/** IndexedDB doesn't enforce the `AdvocacyWorkspace` type -- a record
 * written before a schema field existed (e.g. `titleIsUserSet`,
 * `projectGoal`, both added this pass) is read back missing that field
 * entirely, not just falsy. `migrateWorkspace` already knows how to
 * safely default every field for exactly this "old or partial shape"
 * case (docs/design/advocate-intuitive-workspace-research.md §11), but
 * was previously only ever run on the backup-*import* path -- an
 * existing project loaded the ordinary way (open the page, switch
 * projects) never got healed, so e.g. a legacy project's
 * `titleIsUserSet` stayed `undefined` (falsy) forever, silently
 * re-triggering the auto-title-suggestion logic on every edit even
 * after a user had renamed it. `migrateWorkspace` also stamps a fresh
 * `updatedAt`, which is correct for an import (that's a save) but wrong
 * for a plain read -- it would corrupt `listWorkspaces`' sort order and
 * misreport "last saved" -- so the original `updatedAt` is restored
 * after healing. This doesn't write the healed shape back to storage;
 * it's naturally persisted the next time the workspace is actually
 * edited and saved. */
function healWorkspaceShape(raw: AdvocacyWorkspace): AdvocacyWorkspace {
  return { ...migrateWorkspace(raw), updatedAt: raw.updatedAt };
}

export async function listWorkspaces(): Promise<AdvocacyWorkspace[]> {
  const all = await withStore<AdvocacyWorkspace[]>("readonly", (store) => store.getAll());
  return all.map(healWorkspaceShape).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getWorkspace(workspaceId: string): Promise<AdvocacyWorkspace | null> {
  const result = await withStore<AdvocacyWorkspace | undefined>("readonly", (store) =>
    store.get(workspaceId),
  );
  return result ? healWorkspaceShape(result) : null;
}

export async function saveWorkspace(workspace: AdvocacyWorkspace): Promise<void> {
  const updated: AdvocacyWorkspace = { ...workspace, updatedAt: new Date().toISOString() };
  await withStore("readwrite", (store) => store.put(updated));
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(workspaceId));
}

export async function duplicateWorkspace(workspaceId: string): Promise<AdvocacyWorkspace | null> {
  const original = await getWorkspace(workspaceId);
  if (!original) return null;
  const now = new Date().toISOString();
  const copy: AdvocacyWorkspace = {
    ...original,
    workspaceId: crypto.randomUUID(),
    title: `${original.title} (copy)`,
    createdAt: now,
    updatedAt: now,
  };
  await saveWorkspace(copy);
  return copy;
}

export async function renameWorkspace(workspaceId: string, title: string): Promise<void> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return;
  await saveWorkspace({ ...workspace, title });
}

export function exportWorkspaceJson(workspace: AdvocacyWorkspace): string {
  return JSON.stringify(workspace, null, 2);
}

export type BackupImportResult =
  | { ok: true; workspace: AdvocacyWorkspace }
  | { ok: false; reason: "unparseable" | "not_a_project" };

/** Parses and restores a downloaded project backup file. A file that
 * genuinely isn't a project backup (not JSON at all, or JSON that isn't
 * an object -- a bare string/number/array) is reported as a real,
 * user-visible error instead of silently recovering into a placeholder
 * project (docs/design/advocate-intuitive-workspace-research.md §11 --
 * the prior behavior showed no error at all, just a workspace *titled*
 * "Recovered workspace..."). A file that *is* a plausible object, even
 * an old or partial shape, still recovers gracefully field-by-field via
 * `migrateWorkspace` -- this is the deliberate "never silently delete
 * unsupported fields, fail safely" backward-compatibility contract, not
 * relaxed by this change. */
export function importWorkspaceBackup(json: string): BackupImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: "unparseable" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "not_a_project" };
  }
  return { ok: true, workspace: migrateWorkspace(parsed) };
}

export { createEmptyWorkspace, suggestProjectTitle } from "./schema";
export type { AdvocacyWorkspace } from "./schema";
