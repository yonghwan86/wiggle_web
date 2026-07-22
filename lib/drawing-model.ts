export const DRAWING_SCHEMA_VERSION = 1;
export const RENDERER_VERSION = 1;
export const DOCUMENT_SIZE = 1024;
export const STICKER_ALLOWLIST = ["star", "heart", "leaf", "cloud", "sparkle"] as const;

type Point = { x: number; y: number; pressure?: number };

export type DrawOp = {
  opId: string;
  clientOpId: string;
  type: "stroke" | "fill" | "shape" | "sticker";
  at: string;
  tool?: "pen" | "crayon" | "eraser";
  color?: string;
  width?: 8 | 16 | 30;
  points?: Point[];
  shape?: "circle" | "triangle" | "rectangle" | "line";
  sticker?: (typeof STICKER_ALLOWLIST)[number];
};

export type DrawDocument = {
  schemaVersion: 1;
  rendererVersion: 1;
  size: 1024;
  ops: DrawOp[];
};

function finiteUnit(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateDrawDocument(value: unknown): DrawDocument | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as Partial<DrawDocument>;
  if (doc.schemaVersion !== DRAWING_SCHEMA_VERSION || doc.rendererVersion !== RENDERER_VERSION || doc.size !== DOCUMENT_SIZE || !Array.isArray(doc.ops) || doc.ops.length > 5000) return null;
  const seen = new Set<string>();
  for (const raw of doc.ops) {
    if (!raw || typeof raw !== "object") return null;
    const op = raw as DrawOp;
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(String(op.opId ?? "").slice(0, 80)) || !/^[a-zA-Z0-9_-]{8,80}$/.test(String(op.clientOpId ?? "").slice(0, 80)) || seen.has(op.clientOpId)) return null;
    seen.add(op.clientOpId);
    if (!["stroke", "fill", "shape", "sticker"].includes(op.type) || !Number.isFinite(Date.parse(op.at))) return null;
    if (op.type === "stroke") {
      if (!op.tool || !["pen", "crayon", "eraser"].includes(op.tool) || ![8, 16, 30].includes(op.width ?? 0) || !Array.isArray(op.points) || op.points.length < 1 || op.points.length > 12000) return null;
      if (op.tool !== "eraser" && !/^#[0-9A-Fa-f]{6}$/.test(op.color ?? "")) return null;
      if (op.points.some((point) => !finiteUnit(point.x) || !finiteUnit(point.y) || (point.pressure !== undefined && !finiteUnit(point.pressure)))) return null;
    }
    if (op.type === "fill") {
      if (!/^#[0-9A-Fa-f]{6}$/.test(op.color ?? "") || !Array.isArray(op.points) || op.points.length !== 1 || op.points.some((point) => !finiteUnit(point.x) || !finiteUnit(point.y))) return null;
    }
    if (op.type === "shape") {
      if (!op.shape || !["circle", "triangle", "rectangle", "line"].includes(op.shape) || !/^#[0-9A-Fa-f]{6}$/.test(op.color ?? "") || ![8, 16, 30].includes(op.width ?? 0) || !Array.isArray(op.points) || op.points.length !== 2 || op.points.some((point) => !finiteUnit(point.x) || !finiteUnit(point.y))) return null;
    }
    if (op.type === "sticker" && (!STICKER_ALLOWLIST.includes(op.sticker as (typeof STICKER_ALLOWLIST)[number]) || !Array.isArray(op.points) || op.points.length !== 1 || op.points.some((point) => !finiteUnit(point.x) || !finiteUnit(point.y)))) return null;
  }
  return value as DrawDocument;
}

export function emptyDocument(): DrawDocument {
  return { schemaVersion: 1, rendererVersion: 1, size: 1024, ops: [] };
}
