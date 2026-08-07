import { visibleDrawOperations, type DrawOp, type TextKind } from "./drawing-model.ts";

type Point = { x: number; y: number };

const CANDIDATES: Record<TextKind, Point[]> = {
  title: [
    { x: 0.5, y: 0.12 }, { x: 0.5, y: 0.88 }, { x: 0.5, y: 0.25 }, { x: 0.5, y: 0.75 }, { x: 0.5, y: 0.5 },
  ],
  label: [
    { x: 0.30, y: 0.18 }, { x: 0.70, y: 0.18 }, { x: 0.30, y: 0.82 }, { x: 0.70, y: 0.82 },
    { x: 0.5, y: 0.12 }, { x: 0.5, y: 0.88 }, { x: 0.5, y: 0.5 },
  ],
  speech: [
    { x: 0.65, y: 0.22 }, { x: 0.35, y: 0.22 }, { x: 0.65, y: 0.72 }, { x: 0.35, y: 0.72 },
    { x: 0.5, y: 0.18 }, { x: 0.5, y: 0.78 }, { x: 0.5, y: 0.5 },
  ],
};

export function clampTextPlacement(point: Point, kind: TextKind) {
  const marginX = kind === "title" ? 0.42 : kind === "speech" ? 0.31 : 0.29;
  const marginY = kind === "speech" ? 0.13 : 0.09;
  return {
    x: Math.max(marginX, Math.min(1 - marginX, point.x)),
    y: Math.max(marginY, Math.min(1 - marginY, point.y)),
  };
}

function occupiedPoints(ops: readonly DrawOp[]) {
  const points: Point[] = [];
  for (const op of visibleDrawOperations(ops)) {
    if (op.type === "fill" || (op.type === "stroke" && op.tool === "eraser")) continue;
    const source = op.points ?? [];
    const stride = Math.max(1, Math.ceil(source.length / 48));
    for (let index = 0; index < source.length; index += stride) points.push(source[index]);
    if (op.type === "shape" && source.length === 2) {
      points.push({ x: (source[0].x + source[1].x) / 2, y: (source[0].y + source[1].y) / 2 });
    }
  }
  return points;
}

// 외부 AI 호출 없이 현재 문서의 빈 공간만 계산한다. 아이가 버튼을 눌렀을 때만 제안하고,
// 결과가 마음에 들지 않으면 테두리를 끌어 즉시 옮길 수 있다.
export function suggestTextPlacement(ops: readonly DrawOp[], kind: TextKind) {
  const occupied = occupiedPoints(ops);
  if (!occupied.length) return CANDIDATES[kind][0];
  return CANDIDATES[kind].reduce((best, candidate) => {
    const score = Math.min(...occupied.map((point) => Math.hypot(candidate.x - point.x, candidate.y - point.y)));
    const bestScore = Math.min(...occupied.map((point) => Math.hypot(best.x - point.x, best.y - point.y)));
    return score > bestScore ? candidate : best;
  });
}
