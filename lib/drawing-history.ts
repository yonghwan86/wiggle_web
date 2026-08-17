import type { DrawDocument, DrawOp } from "./drawing-model";
import { undoGroupSize } from "./symmetry.ts";

// clearedOps/clearRedoReady hold the state of a pending "clear all" action so it
// can round-trip through the same Undo/Redo buttons as a normal edit: clearAllDrawing
// snapshots the full op array into clearedOps; Undo restores it in one step and flips
// clearRedoReady so the next Redo clears the exact same array again.
export type DrawingHistory = {
  document: DrawDocument;
  redo: DrawOp[][];
  clearedOps?: DrawOp[] | null;
  clearRedoReady?: boolean;
};

export function undoDrawing(history: DrawingHistory): DrawingHistory {
  if (history.clearedOps) {
    return {
      document: { ...history.document, ops: history.clearedOps },
      redo: history.redo,
      clearedOps: null,
      clearRedoReady: true,
    };
  }
  const groupSize = undoGroupSize(history.document.ops);
  if (!groupSize) return history;
  const group = history.document.ops.slice(-groupSize);
  return {
    document: { ...history.document, ops: history.document.ops.slice(0, -groupSize) },
    redo: [...history.redo, group],
    clearedOps: null,
    clearRedoReady: false,
  };
}

export function redoDrawing(history: DrawingHistory): DrawingHistory {
  if (history.clearRedoReady) return clearAllDrawing(history);
  const group = history.redo.at(-1);
  if (!group) return history;
  return {
    document: { ...history.document, ops: [...history.document.ops, ...group] },
    redo: history.redo.slice(0, -1),
    clearedOps: null,
    clearRedoReady: false,
  };
}

export function clearRedoAfterEdit(history: DrawingHistory, ops: DrawOp[]): DrawingHistory {
  return {
    document: { ...history.document, ops: [...history.document.ops, ...ops] },
    redo: [],
    clearedOps: null,
    clearRedoReady: false,
  };
}

// Clears every current op as one atomic history action. A single Undo restores the
// exact array via the clearedOps branch above; it never touches the Artwork record
// or server metadata, only the in-memory op list.
export function clearAllDrawing(history: DrawingHistory): DrawingHistory {
  if (!history.document.ops.length) return history;
  return {
    document: { ...history.document, ops: [] },
    redo: [],
    clearedOps: history.document.ops,
    clearRedoReady: false,
  };
}
