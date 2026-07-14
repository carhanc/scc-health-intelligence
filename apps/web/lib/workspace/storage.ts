// IndexedDB persistence for AdvocacyWorkspace (Phase 8). Entirely
// browser-local -- no server call, no account, no claim of cloud sync
// (docs/09_SECURITY_PRIVACY_GOVERNANCE.md "Default local-first behavior").
// A thin Promise wrapper around the native IndexedDB API rather than a
// new npm dependency, since the operations needed (get/put/delete/getAll
// on one object store) are simple enough not to justify one.

import { type AdvocacyWorkspace, createEmptyWorkspace, migrateWorkspace } from "./schema";

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

export async function listWorkspaces(): Promise<AdvocacyWorkspace[]> {
  const all = await withStore<AdvocacyWorkspace[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getWorkspace(workspaceId: string): Promise<AdvocacyWorkspace | null> {
  const result = await withStore<AdvocacyWorkspace | undefined>("readonly", (store) =>
    store.get(workspaceId),
  );
  return result ?? null;
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

/** Parses and migrates an imported workspace file -- never throws on a
 * malformed or old-schema file, always returns a usable workspace
 * (falling back to defaults for anything missing or invalid). */
export function importWorkspaceJson(json: string): AdvocacyWorkspace {
  try {
    const parsed: unknown = JSON.parse(json);
    return migrateWorkspace(parsed);
  } catch {
    return createEmptyWorkspace("Recovered workspace (could not parse the imported file)");
  }
}

export { createEmptyWorkspace } from "./schema";
export type { AdvocacyWorkspace } from "./schema";
