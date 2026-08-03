export const DRAWING_SCHEMA_VERSION = 1;
export const RENDERER_VERSION = 1;
export const DOCUMENT_SIZE = 1024;
export const STICKER_ALLOWLIST = ["star", "heart", "leaf", "cloud", "sparkle"] as const;
// 서버 validator와 클라이언트가 같은 목록을 봐야 한다. 클라이언트만 넓히면
// 새 도구로 그린 문서가 서버에서 거부돼 저장이 영구 실패한다.
// "pen"은 필압 렌더 도입 전의 기존 획이다. 기존 작품에는 실필압(0.5가 아닌 값)이 이미 기록돼
// 있으므로, pen에 필압 배율을 적용하면 저장된 썸네일·최종 PNG와 재생 렌더가 어긋난다.
// 새 연필 획은 "pencil"로 저장해 필압 렌더를 새 획에만 적용한다.
export const STROKE_TOOLS = ["pen", "pencil", "crayon", "marker", "watercolor", "eraser"] as const;
export const STROKE_WIDTHS = [3, 8, 16, 30, 48] as const;
export const SHAPE_KINDS = ["line", "circle", "triangle", "rectangle", "rounded-rectangle", "star", "heart", "arrow", "curve", "cloud"] as const;
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
// 여유분 80은 type(6)+at(24)+tool(최장 watercolor 10)+color(7)+미러 접미사를 덮는다 —
// 여유가 부족하면 estimateStrokeBytes가 실제 기여보다 작아져 상한 보증이 깨진다.
const CLIENT_OP_ID_BYTES = 40 + 40 + 80;

export function estimateStrokeBytes(pointCount: number) {
  return OP_FIXED_BYTES + CLIENT_OP_ID_BYTES + pointCount * POINT_BYTES;
}

type Point = { x: number; y: number; pressure?: number };

export type StrokeTool = (typeof STROKE_TOOLS)[number];
export type StrokeWidth = (typeof STROKE_WIDTHS)[number];
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export type DrawOp = {
  opId: string;
  clientOpId: string;
  type: "stroke" | "fill" | "shape" | "sticker";
  at: string;
  tool?: StrokeTool;
  color?: string;
  width?: StrokeWidth;
  points?: Point[];
  smoothed?: boolean;
  squareEraser?: boolean;
  shape?: ShapeKind;
  filled?: boolean;
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

// 정규식은 값을 문자열로 강제 변환한다. [["#FF0000"]] 같은 중첩 배열이 통과해
// 그대로 복사되면 DrawDocument 타입이 깨지고, 렌더러의 문자열 전제와 크기 상한도 무너진다.
function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
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
    // 문자열 여부를 먼저 본다. String(...)으로 강제하면 객체가 통과해 원본이 그대로 복사되고,
    // slice(0, 80) 뒤 검사는 81자 이상 ID를 잘린 채 통과시켜 크기 상한이 깨진다.
    if (typeof op.opId !== "string" || typeof op.clientOpId !== "string" || typeof op.at !== "string") return null;
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(op.opId) || !/^[a-zA-Z0-9_-]{8,80}$/.test(op.clientOpId) || seen.has(op.clientOpId)) return null;
    seen.add(op.clientOpId);
    // 제어문자가 섞인 날짜도 Date.parse는 통과시킨다. JSON에서 이스케이프되며 길이가 폭증하므로 길이를 먼저 막는다.
    if (!["stroke", "fill", "shape", "sticker"].includes(op.type) || op.at.length > 40 || !Number.isFinite(Date.parse(op.at))) return null;
    if (op.type === "stroke") {
      if (!op.tool || !STROKE_TOOLS.includes(op.tool) || !STROKE_WIDTHS.includes((op.width ?? 0) as StrokeWidth) || !Array.isArray(op.points) || op.points.length < 1 || op.points.length > MAX_STROKE_POINTS) return null;
      if (op.tool !== "eraser" && !isHexColor(op.color)) return null;
      if (op.smoothed !== undefined && typeof op.smoothed !== "boolean") return null;
      if (op.squareEraser !== undefined && typeof op.squareEraser !== "boolean") return null;
      if (op.points.some(invalidPoint)) return null;
    }
    if (op.type === "fill") {
      if (!isHexColor(op.color) || !Array.isArray(op.points) || op.points.length !== 1 || op.points.some(invalidPoint)) return null;
    }
    if (op.type === "shape") {
      if (!op.shape || !SHAPE_KINDS.includes(op.shape) || !isHexColor(op.color) || !STROKE_WIDTHS.includes((op.width ?? 0) as StrokeWidth) || !Array.isArray(op.points) || op.points.length !== 2 || op.points.some(invalidPoint)) return null;
      if (op.filled !== undefined && typeof op.filled !== "boolean") return null;
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

// op 종류마다 검증된 필드만 남긴다. 종류와 무관한 필드까지 복사하면,
// 그 종류에서 검사하지 않는 자리(예: stroke의 sticker)에 거대한 값을 실어
// 검증을 통과시키면서 크기 상한을 깨뜨릴 수 있다.
function normalizeOp(raw: DrawOp): DrawOp {
  // at은 검증을 통과했으므로 항상 24자 ISO로 정규화된다.
  const op: DrawOp = { opId: raw.opId, clientOpId: raw.clientOpId, type: raw.type, at: new Date(raw.at).toISOString() };
  const points = Array.isArray(raw.points) ? raw.points.map(normalizePoint) : undefined;
  if (raw.type === "stroke") {
    op.tool = raw.tool;
    if (raw.tool !== "eraser") op.color = raw.color;
    op.width = raw.width;
    op.points = points;
    if (raw.smoothed !== undefined) op.smoothed = raw.smoothed;
    if (raw.squareEraser !== undefined) op.squareEraser = raw.squareEraser;
  }
  if (raw.type === "fill") { op.color = raw.color; op.points = points; }
  if (raw.type === "shape") { op.shape = raw.shape; op.color = raw.color; op.width = raw.width; op.points = points; if (raw.filled !== undefined) op.filled = raw.filled; }
  if (raw.type === "sticker") { op.sticker = raw.sticker; op.points = points; }
  return op;
}

export function emptyDocument(): DrawDocument {
  return { schemaVersion: 1, rendererVersion: 1, size: 1024, ops: [] };
}
