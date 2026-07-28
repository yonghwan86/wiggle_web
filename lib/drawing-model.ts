export const DRAWING_SCHEMA_VERSION = 1;
export const RENDERER_VERSION = 1;
export const DOCUMENT_SIZE = 1024;
export const STICKER_ALLOWLIST = ["star", "heart", "leaf", "cloud", "sparkle"] as const;
// 서버가 거부하는 한도. 클라이언트가 같은 값을 미리 지켜야 저장이 영구 실패하지 않는다.
export const MAX_DOCUMENT_OPS = 5000;
export const MAX_STROKE_POINTS = 12000;
export const MAX_DOCUMENT_BYTES = 1_250_000;
// 좌표를 소수 4자리로 줄이면 1024px 캔버스에서 0.1px 미만 오차로 직렬화 크기를 크게 줄인다.
export const POINT_PRECISION = 4;

export function roundUnit(value: number) {
  return Number(value.toFixed(POINT_PRECISION));
}

// 직렬화 크기의 보수적 상한. 스트로크마다 문서 전체를 JSON.stringify 하면
// 큰 작품에서 손을 뗄 때마다 1MB를 문자열로 만든다. 실제보다 작게 잡으면
// 클라이언트가 한도를 넘긴 문서를 커밋해 저장이 영구 실패하므로,
// 고정값이 아니라 op의 실제 문자열 길이를 더해 상한을 보장한다.
const OP_FIXED_BYTES = 120;
// 정규화된 점 하나의 최악 직렬화: {"x":0.1234,"y":0.1234,"pressure":0.1234}, = 42자.
const POINT_BYTES = 44;

function opBytes(op: DrawOp) {
  return OP_FIXED_BYTES
    + (op.opId?.length ?? 0) + (op.clientOpId?.length ?? 0) + (op.type?.length ?? 0)
    + (op.at?.length ?? 0) + (op.tool?.length ?? 0) + (op.color?.length ?? 0)
    + (op.shape?.length ?? 0) + (op.sticker?.length ?? 0)
    + (op.points?.length ?? 0) * POINT_BYTES;
}

export function estimateDocumentBytes(document: DrawDocument) {
  let bytes = 64;
  for (const op of document.ops) bytes += opBytes(op);
  return bytes;
}

// 이 클라이언트가 만드는 스트로크(op_ + 32자 hex, client_ + 32자 hex)의 상한.
const CLIENT_OP_ID_BYTES = 40 + 40 + 32;

export function estimateStrokeBytes(pointCount: number) {
  return OP_FIXED_BYTES + CLIENT_OP_ID_BYTES + pointCount * POINT_BYTES;
}

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

// points:[null] 같은 입력에서 point.x를 바로 읽으면 TypeError가 나 검증이 거부 대신 500이 된다.
function invalidPoint(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const point = value as { x?: unknown; y?: unknown; pressure?: unknown };
  return !finiteUnit(point.x) || !finiteUnit(point.y) || (point.pressure !== undefined && !finiteUnit(point.pressure));
}

export function validateDrawDocument(value: unknown): DrawDocument | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as Partial<DrawDocument>;
  if (doc.schemaVersion !== DRAWING_SCHEMA_VERSION || doc.rendererVersion !== RENDERER_VERSION || doc.size !== DOCUMENT_SIZE || !Array.isArray(doc.ops) || doc.ops.length > MAX_DOCUMENT_OPS) return null;
  const seen = new Set<string>();
  for (const raw of doc.ops) {
    if (!raw || typeof raw !== "object") return null;
    const op = raw as DrawOp;
    // slice(0, 80) 뒤에 검사하면 81자 이상 ID가 잘린 채 통과해 크기 상한이 깨진다.
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(String(op.opId ?? "")) || !/^[a-zA-Z0-9_-]{8,80}$/.test(String(op.clientOpId ?? "")) || seen.has(op.clientOpId)) return null;
    seen.add(op.clientOpId);
    if (!["stroke", "fill", "shape", "sticker"].includes(op.type) || !Number.isFinite(Date.parse(op.at))) return null;
    if (op.type === "stroke") {
      if (!op.tool || !["pen", "crayon", "eraser"].includes(op.tool) || ![8, 16, 30].includes(op.width ?? 0) || !Array.isArray(op.points) || op.points.length < 1 || op.points.length > MAX_STROKE_POINTS) return null;
      if (op.tool !== "eraser" && !/^#[0-9A-Fa-f]{6}$/.test(op.color ?? "")) return null;
      if (op.points.some(invalidPoint)) return null;
    }
    if (op.type === "fill") {
      if (!/^#[0-9A-Fa-f]{6}$/.test(op.color ?? "") || !Array.isArray(op.points) || op.points.length !== 1 || op.points.some(invalidPoint)) return null;
    }
    if (op.type === "shape") {
      if (!op.shape || !["circle", "triangle", "rectangle", "line"].includes(op.shape) || !/^#[0-9A-Fa-f]{6}$/.test(op.color ?? "") || ![8, 16, 30].includes(op.width ?? 0) || !Array.isArray(op.points) || op.points.length !== 2 || op.points.some(invalidPoint)) return null;
    }
    if (op.type === "sticker" && (!STICKER_ALLOWLIST.includes(op.sticker as (typeof STICKER_ALLOWLIST)[number]) || !Array.isArray(op.points) || op.points.length !== 1 || op.points.some(invalidPoint))) return null;
  }
  // 알려진 필드만 남기고 좌표를 정규화한 사본을 돌려준다. 원본을 그대로 통과시키면
  // 전체 정밀도 좌표(0.12345678901234568)와 미지의 속성이 함께 저장돼,
  // 크기 추정이 실제 직렬화 길이의 상한이 아니게 되고 저장이 한도에 걸린다.
  return { schemaVersion: 1, rendererVersion: 1, size: 1024, ops: doc.ops.map(normalizeOp) };
}

function normalizePoint(point: Point): Point {
  const normalized: Point = { x: roundUnit(point.x), y: roundUnit(point.y) };
  if (point.pressure !== undefined) normalized.pressure = roundUnit(point.pressure);
  return normalized;
}

function normalizeOp(raw: DrawOp): DrawOp {
  const op: DrawOp = { opId: raw.opId, clientOpId: raw.clientOpId, type: raw.type, at: raw.at };
  if (raw.tool !== undefined) op.tool = raw.tool;
  if (raw.color !== undefined) op.color = raw.color;
  if (raw.width !== undefined) op.width = raw.width;
  if (raw.shape !== undefined) op.shape = raw.shape;
  if (raw.sticker !== undefined) op.sticker = raw.sticker;
  if (Array.isArray(raw.points)) op.points = raw.points.map(normalizePoint);
  return op;
}

export function emptyDocument(): DrawDocument {
  return { schemaVersion: 1, rendererVersion: 1, size: 1024, ops: [] };
}
