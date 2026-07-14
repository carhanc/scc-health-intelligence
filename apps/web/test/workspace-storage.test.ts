import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createEmptyWorkspace,
  migrateWorkspace,
  WORKSPACE_SCHEMA_VERSION,
} from "@/lib/workspace/schema";
import {
  deleteWorkspace,
  duplicateWorkspace,
  exportWorkspaceJson,
  getWorkspace,
  importWorkspaceJson,
  listWorkspaces,
  renameWorkspace,
  saveWorkspace,
} from "@/lib/workspace/storage";

describe("createEmptyWorkspace", () => {
  it("produces a workspace with the current schema version and safe defaults", () => {
    const ws = createEmptyWorkspace("My workspace");
    expect(ws.schemaVersion).toBe(WORKSPACE_SCHEMA_VERSION);
    expect(ws.title).toBe("My workspace");
    expect(ws.selectedEvidenceIds).toEqual([]);
    expect(ws.uploadedDocuments).toEqual([]);
    expect(ws.workspaceId).toBeTruthy();
  });

  it("gives every new workspace a unique id", () => {
    const a = createEmptyWorkspace();
    const b = createEmptyWorkspace();
    expect(a.workspaceId).not.toBe(b.workspaceId);
  });
});

describe("migrateWorkspace", () => {
  it("recovers a fully valid workspace unchanged in shape", () => {
    const original = createEmptyWorkspace("Test");
    const migrated = migrateWorkspace(JSON.parse(JSON.stringify(original)));
    expect(migrated.workspaceId).toBe(original.workspaceId);
    expect(migrated.title).toBe("Test");
  });

  it("recovers gracefully from a completely empty object", () => {
    const migrated = migrateWorkspace({});
    expect(migrated.schemaVersion).toBe(WORKSPACE_SCHEMA_VERSION);
    expect(migrated.selectedEvidenceIds).toEqual([]);
  });

  it("recovers gracefully from null, a string, or an array", () => {
    expect(migrateWorkspace(null).schemaVersion).toBe(WORKSPACE_SCHEMA_VERSION);
    expect(migrateWorkspace("not an object").schemaVersion).toBe(WORKSPACE_SCHEMA_VERSION);
    expect(migrateWorkspace([1, 2, 3]).schemaVersion).toBe(WORKSPACE_SCHEMA_VERSION);
  });

  it("preserves partial data from an old-shape workspace missing newer fields", () => {
    const oldShape = { workspaceId: "abc-123", title: "Old workspace", userNotes: "Some notes" };
    const migrated = migrateWorkspace(oldShape);
    expect(migrated.workspaceId).toBe("abc-123");
    expect(migrated.title).toBe("Old workspace");
    expect(migrated.userNotes).toBe("Some notes");
    expect(migrated.constraints).toEqual({ budgetProxy: null, interventionType: null, notes: "" });
  });

  it("always normalizes to the current schema version even if the input claims an old one", () => {
    const migrated = migrateWorkspace({ schemaVersion: 0 });
    expect(migrated.schemaVersion).toBe(WORKSPACE_SCHEMA_VERSION);
  });
});

describe("IndexedDB workspace storage", () => {
  beforeEach(async () => {
    const existing = await listWorkspaces();
    await Promise.all(existing.map((w) => deleteWorkspace(w.workspaceId)));
  });

  it("saves and retrieves a workspace by id", async () => {
    const ws = createEmptyWorkspace("Sunnyvale advocacy");
    await saveWorkspace(ws);
    const retrieved = await getWorkspace(ws.workspaceId);
    expect(retrieved?.title).toBe("Sunnyvale advocacy");
  });

  it("returns null for a workspace id that was never saved", async () => {
    const retrieved = await getWorkspace("nonexistent-id");
    expect(retrieved).toBeNull();
  });

  it("lists workspaces most-recently-updated first", async () => {
    const first = createEmptyWorkspace("First");
    await saveWorkspace(first);
    await new Promise((r) => setTimeout(r, 5));
    const second = createEmptyWorkspace("Second");
    await saveWorkspace(second);

    const list = await listWorkspaces();
    expect(list[0]?.title).toBe("Second");
  });

  it("deletes a workspace", async () => {
    const ws = createEmptyWorkspace("To delete");
    await saveWorkspace(ws);
    await deleteWorkspace(ws.workspaceId);
    expect(await getWorkspace(ws.workspaceId)).toBeNull();
  });

  it("duplicates a workspace with a new id and updated title", async () => {
    const ws = createEmptyWorkspace("Original");
    await saveWorkspace(ws);
    const copy = await duplicateWorkspace(ws.workspaceId);
    expect(copy?.workspaceId).not.toBe(ws.workspaceId);
    expect(copy?.title).toBe("Original (copy)");
    expect(await getWorkspace(copy!.workspaceId)).not.toBeNull();
  });

  it("duplicating a nonexistent workspace returns null rather than throwing", async () => {
    const copy = await duplicateWorkspace("nonexistent-id");
    expect(copy).toBeNull();
  });

  it("renames a workspace in place", async () => {
    const ws = createEmptyWorkspace("Old name");
    await saveWorkspace(ws);
    await renameWorkspace(ws.workspaceId, "New name");
    const retrieved = await getWorkspace(ws.workspaceId);
    expect(retrieved?.title).toBe("New name");
  });

  it("round-trips through export and import JSON", async () => {
    const ws = createEmptyWorkspace("Exportable");
    ws.userNotes = "A real note.";
    const json = exportWorkspaceJson(ws);
    const imported = importWorkspaceJson(json);
    expect(imported.title).toBe("Exportable");
    expect(imported.userNotes).toBe("A real note.");
  });

  it("importing malformed JSON recovers a usable empty workspace rather than throwing", () => {
    const imported = importWorkspaceJson("{not valid json");
    expect(imported.schemaVersion).toBe(WORKSPACE_SCHEMA_VERSION);
    expect(imported.title).toContain("Recovered");
  });
});
