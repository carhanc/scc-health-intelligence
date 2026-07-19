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
  importWorkspaceBackup,
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

  it("defaults titleIsUserSet to true and projectGoal to empty for a pre-existing saved project missing these newer fields", () => {
    const oldShape = { workspaceId: "abc-123", title: "Old project" };
    const migrated = migrateWorkspace(oldShape);
    // A pre-existing project's title is treated as user-set so the
    // redesigned auto-suggestion logic never silently overwrites it.
    expect(migrated.titleIsUserSet).toBe(true);
    expect(migrated.projectGoal).toBe("");
  });

  // The flow-simplification pass added two more additive fields
  // (sourcePage, includedPassages) -- a real project saved by any prior
  // pass, or even the score/map pass before Advocate existed in its
  // current form, must still load cleanly with safe defaults for both.
  it("defaults sourcePage to null and includedPassages to an empty array for a project saved before this pass", () => {
    const oldShape = {
      workspaceId: "legacy-1",
      title: "A project saved before the flow-simplification pass",
      selectedGeography: { geographyType: "place", geoid: "0677000", displayName: "Sunnyvale city" },
      selectedEvidenceIds: ["metric:test:1"],
      titleIsUserSet: true,
      projectGoal: "Request a meeting",
    };
    const migrated = migrateWorkspace(oldShape);
    expect(migrated.sourcePage).toBeNull();
    expect(migrated.includedPassages).toEqual([]);
    // Everything the older pass already had must survive untouched.
    expect(migrated.selectedGeography).toEqual(oldShape.selectedGeography);
    expect(migrated.selectedEvidenceIds).toEqual(["metric:test:1"]);
    expect(migrated.projectGoal).toBe("Request a meeting");
  });

  it("preserves a real sourcePage and includedPassages value when already present", () => {
    const shape = {
      workspaceId: "abc-2",
      sourcePage: "Explore",
      includedPassages: [{ docFilename: "memo.txt", topicId: "t1", topicLabel: "Diabetes prevention", excerpt: "..." }],
    };
    const migrated = migrateWorkspace(shape);
    expect(migrated.sourcePage).toBe("Explore");
    expect(migrated.includedPassages).toEqual(shape.includedPassages);
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

  it("round-trips through a downloaded backup and restore", async () => {
    const ws = createEmptyWorkspace("Exportable");
    ws.userNotes = "A real note.";
    const json = exportWorkspaceJson(ws);
    const result = importWorkspaceBackup(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workspace.title).toBe("Exportable");
      expect(result.workspace.userNotes).toBe("A real note.");
    }
  });

  it("restoring a backup that isn't valid JSON at all reports a real error, not a silent placeholder project", () => {
    const result = importWorkspaceBackup("{not valid json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unparseable");
  });

  it("restoring a backup that parses but isn't an object (a bare array/string/number) also reports a real error", () => {
    expect(importWorkspaceBackup("[1,2,3]")).toEqual({ ok: false, reason: "not_a_project" });
    expect(importWorkspaceBackup('"just a string"')).toEqual({ ok: false, reason: "not_a_project" });
    expect(importWorkspaceBackup("42")).toEqual({ ok: false, reason: "not_a_project" });
  });

  it("restoring a backup that is a plausible-but-old-shape object still recovers gracefully (backward compatibility preserved)", () => {
    const result = importWorkspaceBackup(JSON.stringify({ workspaceId: "abc-123", title: "Old backup" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workspace.workspaceId).toBe("abc-123");
      expect(result.workspace.title).toBe("Old backup");
      expect(result.workspace.schemaVersion).toBe(WORKSPACE_SCHEMA_VERSION);
    }
  });

  // A record already sitting in IndexedDB from before a schema field
  // existed is missing that field entirely, not just falsy -- IndexedDB
  // doesn't enforce the AdvocacyWorkspace type at runtime. getWorkspace/
  // listWorkspaces must heal this on every ordinary read (not only on
  // backup import), or a pre-existing project's titleIsUserSet stays
  // undefined forever and its custom name gets silently overwritten by
  // the auto-title-suggestion logic on the next edit.
  it("heals a pre-existing IndexedDB record that predates a newer schema field, on an ordinary getWorkspace read", async () => {
    const legacyRecord = {
      workspaceId: "legacy-1",
      title: "Legacy project",
      updatedAt: "2020-01-01T00:00:00.000Z",
      // titleIsUserSet and projectGoal deliberately absent, as they would
      // be for a record written before those fields existed.
    };
    await saveWorkspace(legacyRecord as unknown as Parameters<typeof saveWorkspace>[0]);
    const retrieved = await getWorkspace("legacy-1");
    expect(retrieved?.titleIsUserSet).toBe(true);
    expect(retrieved?.projectGoal).toBe("");
    expect(retrieved?.selectedEvidenceIds).toEqual([]);
  });

  it("heals a legacy record without re-stamping updatedAt at read time (only saveWorkspace should ever change it)", async () => {
    // Bypasses saveWorkspace (which always stamps a fresh updatedAt) to
    // write a raw record the way an old IndexedDB entry would actually
    // look: a real historical updatedAt, no titleIsUserSet/projectGoal.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("scc_health_advocacy", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("workspaces", "readwrite");
      tx.objectStore("workspaces").put({
        workspaceId: "legacy-3",
        title: "Legacy project 3",
        updatedAt: "2020-01-01T00:00:00.000Z",
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const retrieved = await getWorkspace("legacy-3");
    expect(retrieved?.titleIsUserSet).toBe(true);
    expect(retrieved?.updatedAt).toBe("2020-01-01T00:00:00.000Z");

    const list = await listWorkspaces();
    expect(list.find((w) => w.workspaceId === "legacy-3")?.updatedAt).toBe("2020-01-01T00:00:00.000Z");
  });
});
