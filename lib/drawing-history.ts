import type { DrawDocument, DrawOp } from "./drawing-model";
import { undoGroupSize } from "./symmetry.ts";

export type DrawingHistory = { document: DrawDocument; redo: DrawOp[][] };

export function undoDrawing(history: DrawingHistory): DrawingHistory {
  const groupSize = undoGroupSize(history.document.ops);
  if (!groupSize) return history;
  const group = history.document.ops.slice(-groupSize);
  return {
    document: { ...history.document, ops: history.document.ops.slice(0, -groupSize) },
    redo: [...history.redo, group],
  };
}

export function redoDrawing(history: DrawingHistory): DrawingHistory {
  const group = history.redo.at(-1);
  if (!group) return history;
  return {
    document: { ...history.document, ops: [...history.document.ops, ...group] },
    redo: history.redo.slice(0, -1),
  };
}

export function clearRedoAfterEdit(history: DrawingHistory, ops: DrawOp[]): DrawingHistory {
  return { document: { ...history.document, ops: [...history.document.ops, ...ops] }, redo: [] };
}
