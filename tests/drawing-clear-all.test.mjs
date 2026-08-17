import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { clearAllDrawing, redoDrawing, undoDrawing } from "../lib/drawing-history.ts";

const compactSource = (text) => text.replace(/\s+/g, " ");

const stroke = (suffix) => ({
  opId: `op_${suffix}`.padEnd(12, "0"),
  clientOpId: `client_${suffix}`.padEnd(14, "0"),
  type: "stroke",
  at: "2026-08-17T00:00:00.000Z",
  tool: "pencil",
  color: "#1B3A57",
  width: 16,
  points: [{ x: 0.2, y: 0.3, pressure: 0.5 }, { x: 0.4, y: 0.5, pressure: 0.8 }],
});

const documentWith = (ops) => ({ schemaVersion: 1, rendererVersion: 1, size: 1024, ops });

test("clear all ops is one atomic action: a single Undo restores the exact array, a single Redo clears it again", () => {
  const first = stroke("first");
  const second = stroke("second");
  let history = { document: documentWith([first, second]), redo: [] };

  history = clearAllDrawing(history);
  assert.equal(history.document.ops.length, 0, "clearing removes every op");
  assert.equal(history.redo.length, 0, "clearing must not populate the normal redo stack (that would make Redo restore instead of Undo)");

  history = undoDrawing(history);
  assert.deepEqual(history.document.ops.map((op) => op.opId), [first.opId, second.opId], "one Undo restores the exact full op array");

  history = redoDrawing(history);
  assert.equal(history.document.ops.length, 0, "one Redo clears it again");

  // The pair stays stable across repeats, exactly like a normal undo/redo entry.
  history = undoDrawing(history);
  assert.deepEqual(history.document.ops.map((op) => op.opId), [first.opId, second.opId]);
  history = redoDrawing(history);
  assert.equal(history.document.ops.length, 0);
});

test("clearing an already-empty document is a pure no-op", () => {
  const history = { document: documentWith([]), redo: [] };
  const result = clearAllDrawing(history);
  assert.equal(result, history, "an empty document must not produce a new history action");
});

test("clearing discards any pending redo branch, matching normal edits", () => {
  const first = stroke("first");
  const second = stroke("second");
  let history = { document: documentWith([first, second]), redo: [] };
  history = undoDrawing(history);
  assert.equal(history.redo.length, 1, "sanity: the plain undo left one group on the redo stack");
  history = clearAllDrawing(history);
  assert.equal(history.redo.length, 0, "clear must invalidate the older redo branch, same as any other new edit");
  assert.equal(history.document.ops.length, 0);
});

test("undoing a clear does not resurrect a stale earlier clear once a normal edit intervenes", () => {
  const first = stroke("first");
  let history = { document: documentWith([first]), redo: [] };
  history = clearAllDrawing(history);
  assert.equal(history.clearedOps?.length, 1);
  // Undo restores, then a further plain edit happens (simulated by rebuilding history
  // the way commitOps does: append an op and drop clearedOps/clearRedoReady).
  history = undoDrawing(history);
  const second = stroke("second");
  history = {
    document: { ...history.document, ops: [...history.document.ops, second] },
    redo: [],
    clearedOps: null,
    clearRedoReady: false,
  };
  // Redo must now be a true no-op: there is nothing queued to redo any more.
  const afterRedo = redoDrawing(history);
  assert.equal(afterRedo, history, "redo must not re-clear after an intervening edit invalidated the pending clear-redo");
});

test("clear-all button in DrawingStudio requires a confirmation modal and is disabled when ops is empty or editing is locked", async () => {
  const studio = compactSource(await readFile(new URL("../app/components/DrawingStudio.tsx", import.meta.url), "utf8"));
  // The button never clears directly — it only opens the confirmation modal.
  assert.match(
    studio,
    /<button\s+type="button"\s+className="clear-all-button"\s+disabled=\{Boolean\(conflictDraft\) \|\| !documentState\.ops\.length\}\s+onClick=\{\(\) => setClearConfirmOpen\(true\)\}/,
  );
  assert.doesNotMatch(studio, /className="clear-all-button"[^>]*onClick=\{clearAllOps\}/, "the button must open the confirm modal, not clear directly");
  // The modal only clears on explicit confirmation, and can be dismissed without side effects.
  assert.match(studio, /clearConfirmOpen && \(/);
  assert.match(studio, /onClick=\{\(\) => setClearConfirmOpen\(false\)\}>아니요<\/button>/);
  assert.match(studio, /onClick=\{confirmClearAll\}>네, 다 지울래요<\/button>/);
  assert.match(studio, /function confirmClearAll\(\) \{ clearAllOps\(\); setClearConfirmOpen\(false\); \}/);
  // clearAllOps itself guards against an empty document and a locked (conflict) editing state.
  assert.match(studio, /function clearAllOps\(\) \{ if \(conflictDraftRef\.current\) return; if \(!documentStateRef\.current\.ops\.length\) return;/);
});

test("clear-all does not touch the Artwork record or server metadata, only the in-memory op array", async () => {
  const drawingHistory = compactSource(await readFile(new URL("../lib/drawing-history.ts", import.meta.url), "utf8"));
  assert.match(drawingHistory, /export function clearAllDrawing\(history: DrawingHistory\): DrawingHistory \{ if \(!history\.document\.ops\.length\) return history; return \{ document: \{ \.\.\.history\.document, ops: \[\] \}, redo: \[\], clearedOps: history\.document\.ops, clearRedoReady: false, \}; \}/);
  const studio = compactSource(await readFile(new URL("../app/components/DrawingStudio.tsx", import.meta.url), "utf8"));
  assert.match(studio, /function clearAllOps\(\) \{[\s\S]{0,20}?if \(conflictDraftRef\.current\) return;/);
});

test("every document replacement path resets clear-all history so undo/redo cannot cross into a different artwork", async () => {
  const raw = await readFile(new URL("../app/components/DrawingStudio.tsx", import.meta.url), "utf8");
  const studio = compactSource(raw);

  // The reset helper itself must clear every piece of clear-all state, not just the redo stack.
  assert.match(
    studio,
    /function resetDocumentHistory\(\) \{ redoRef\.current = \[\]; setRedo\(\[\]\); clearedOpsRef\.current = null; clearRedoReadyRef\.current = false; setHasClearToUndo\(false\); setHasClearToRedo\(false\); setClearConfirmOpen\(false\); \}/,
  );

  // Server-loaded artwork document must reset history right after the document itself is replaced.
  assert.match(studio, /setDocumentState\(loadedDocument\); resetDocumentHistory\(\);/);
  // Offline conflict draft restoration must do the same.
  assert.match(studio, /setDocumentState\(draft\.document\); resetDocumentHistory\(\);/);

  // The old inline reset (redo only, missing the clear-all refs/state) must be gone from both paths.
  assert.doesNotMatch(raw, /setDocumentState\(loadedDocument\);\s*redoRef\.current = \[\];\s*setRedo\(\[\]\);/);
  assert.doesNotMatch(raw, /setDocumentState\(draft\.document\);\s*redoRef\.current = \[\];\s*setRedo\(\[\]\);/);
});

test("without a history reset a stale clearedOps/redo stack would leak the previous artwork into a newly loaded document (pure)", () => {
  const oldFirst = stroke("old-first");
  let oldHistory = { document: documentWith([oldFirst]), redo: [] };
  oldHistory = clearAllDrawing(oldHistory);
  assert.equal(oldHistory.clearedOps?.length, 1, "sanity: the old artwork has a pending clear-all undo");

  const newSecond = stroke("new-second");

  // Bug reproduction: a document swap that only replaces `document` (like the old
  // setDocumentState(...) + redoRef.current = [] pattern) but forgets clearedOps/clearRedoReady.
  const buggyNewHistory = {
    document: documentWith([newSecond]),
    redo: [],
    clearedOps: oldHistory.clearedOps,
    clearRedoReady: oldHistory.clearRedoReady,
  };
  const buggyUndo = undoDrawing(buggyNewHistory);
  assert.deepEqual(
    buggyUndo.document.ops.map((op) => op.opId),
    [oldFirst.opId],
    "demonstrates the bug: undo on the new document restores the previous artwork's cleared stroke instead of leaving the new document alone",
  );

  // Fix: this mirrors exactly what resetDocumentHistory() produces when a new document
  // replaces the old one — clearedOps/clearRedoReady/redo are all cleared alongside the document.
  const fixedNewHistory = {
    document: documentWith([newSecond]),
    redo: [],
    clearedOps: null,
    clearRedoReady: false,
  };
  const fixedUndo = undoDrawing(fixedNewHistory);
  assert.deepEqual(
    fixedUndo.document.ops,
    [],
    "with the reset applied, undo only removes the new document's own stroke (normal undo), never resurrecting the previous artwork",
  );
  assert.deepEqual(
    fixedUndo.redo.flat().map((op) => op.opId),
    [newSecond.opId],
    "the undone stroke belongs to the new document, not the previous artwork",
  );

  // Same leak shape via the redo stack (e.g. the previous artwork had an outstanding undo).
  let oldUndone = { document: documentWith([oldFirst]), redo: [] };
  oldUndone = undoDrawing(oldUndone);
  assert.equal(oldUndone.redo.length, 1, "sanity: the old artwork has a stale redo group");
  const buggyRedoHistory = { document: documentWith([newSecond]), redo: oldUndone.redo, clearedOps: null, clearRedoReady: false };
  const buggyRedo = redoDrawing(buggyRedoHistory);
  assert.deepEqual(
    buggyRedo.document.ops.map((op) => op.opId),
    [newSecond.opId, oldFirst.opId],
    "demonstrates the bug: redo on the new document appends the previous artwork's stroke onto it",
  );
  const fixedRedoHistory = { document: documentWith([newSecond]), redo: [], clearedOps: null, clearRedoReady: false };
  const fixedRedo = redoDrawing(fixedRedoHistory);
  assert.equal(fixedRedo, fixedRedoHistory, "with the reset applied, redo on the freshly loaded document is a true no-op");
});
