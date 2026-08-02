import assert from "node:assert/strict";
import test from "node:test";
import { estimateDocumentBytes, estimateStrokeBytes, STROKE_TOOLS, STROKE_WIDTHS, validateDrawDocument } from "../lib/drawing-model.ts";
import { isMirrorOf, mirrorOp, undoGroupSize } from "../lib/symmetry.ts";
import { clampView, IDENTITY_VIEW, pinchView } from "../lib/canvas-view.ts";

const stroke = (suffix, overrides = {}) => ({
  opId: `op_${suffix}`.padEnd(12, "0"),
  clientOpId: `client_${suffix}`.padEnd(14, "0"),
  type: "stroke",
  at: "2026-08-02T01:00:00.000Z",
  tool: "pen",
  color: "#1B3A57",
  width: 16,
  points: [{ x: 0.2, y: 0.3, pressure: 0.5 }, { x: 0.4, y: 0.5, pressure: 0.9 }],
  ...overrides,
});

const documentWith = (ops) => ({ schemaVersion: 1, rendererVersion: 1, size: 1024, ops });

test("server validation accepts every shipped tool and width, and only those", () => {
  for (const tool of STROKE_TOOLS) {
    for (const width of STROKE_WIDTHS) {
      const op = stroke(`t${tool}${width}`, { tool, width, color: tool === "eraser" ? undefined : "#E53935" });
      assert.ok(validateDrawDocument(documentWith([op])), `${tool}/${width}는 통과해야 한다`);
    }
  }
  // 목록 밖 도구·굵기가 통과하면 구버전 클라이언트와의 계약이 깨진다.
  assert.equal(validateDrawDocument(documentWith([stroke("spray", { tool: "spray" })])), null);
  assert.equal(validateDrawDocument(documentWith([stroke("w12", { width: 12 })])), null);
  assert.equal(validateDrawDocument(documentWith([stroke("w0", { width: 0 })])), null);
  // 도형도 굵기 목록을 공유한다.
  const shape = (width) => ({ ...stroke(`sh${width}`, { width }), type: "shape", shape: "circle", tool: undefined, points: [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.6 }] });
  assert.ok(validateDrawDocument(documentWith([shape(48)])));
  assert.equal(validateDrawDocument(documentWith([shape(12)])), null);
});

test("mirror ops survive server validation and pair up for undo", () => {
  const base = stroke("mirrorbase");
  const mirrored = mirrorOp(base);
  assert.equal(mirrored.clientOpId, `${base.clientOpId}m`);
  assert.equal(mirrored.points[0].x, 0.8);
  assert.equal(mirrored.points[0].y, 0.3, "y는 그대로여야 한다");
  // 미러 접미사가 붙은 id도 서버 검증(문자셋·중복)을 통과해야 저장이 산다.
  const validated = validateDrawDocument(documentWith([base, mirrored]));
  assert.ok(validated);
  assert.ok(isMirrorOf(validated.ops[0], validated.ops[1]));
  // 되돌리기: 쌍이면 2개, 아니면 1개, 빈 문서면 0개.
  assert.equal(undoGroupSize([base, mirrored]), 2);
  assert.equal(undoGroupSize([base]), 1);
  assert.equal(undoGroupSize([mirrored, base]), 1, "순서가 다르면 쌍이 아니다");
  assert.equal(undoGroupSize([]), 0);
  // UUID hex는 m으로 끝나지 않으므로 일반 op끼리 쌍으로 오인되지 않는다.
  assert.equal(undoGroupSize([stroke("a1"), stroke("b2")]), 1);
});

test("estimateStrokeBytes is an upper bound even for the heaviest tool with mirror suffix", () => {
  // 상한이 실제 기여보다 작으면 클라이언트가 한도 초과 문서를 커밋해 저장이 영구 실패한다.
  const points = Array.from({ length: 50 }, () => ({ x: 0.1234, y: 0.5678, pressure: 0.4321 }));
  const base = { opId: `op_${"a".repeat(32)}`, clientOpId: `client_${"b".repeat(32)}`, type: "stroke", at: "2026-08-02T01:00:00.000Z", tool: "watercolor", color: "#E53935", width: 48, points };
  for (const op of [base, mirrorOp(base)]) {
    const contribution = estimateDocumentBytes(documentWith([op])) - estimateDocumentBytes(documentWith([]));
    assert.ok(contribution >= JSON.stringify(op).length + 1, `opBytes 기여(${contribution})가 실제 직렬화(${JSON.stringify(op).length}) 이상이어야 한다`);
    assert.ok(estimateStrokeBytes(points.length) >= contribution, `estimateStrokeBytes(${estimateStrokeBytes(points.length)})가 기여(${contribution})의 상한이어야 한다`);
  }
});

test("pinch view stays clamped so the paper never leaves the frame", () => {
  const wrap = 400;
  // 확대: 두 손가락이 벌어지면 배율이 오르고 4배를 넘지 않는다.
  let view = IDENTITY_VIEW;
  for (let step = 0; step < 40; step += 1) {
    view = pinchView(view, [{ x: 190, y: 200 }, { x: 210, y: 200 }], [{ x: 150, y: 200 }, { x: 250, y: 200 }], wrap);
  }
  assert.ok(view.scale <= 4.000001, `배율 상한: ${view.scale}`);
  assert.ok(view.x <= 0 && view.x >= wrap * (1 - view.scale), "가로 이동이 종이 밖으로 나가지 않는다");
  assert.ok(view.y <= 0 && view.y >= wrap * (1 - view.scale), "세로 이동이 종이 밖으로 나가지 않는다");
  // 축소: 손가락을 모으면 1배 밑으로 내려가지 않고 원점 정렬로 돌아온다.
  for (let step = 0; step < 60; step += 1) {
    view = pinchView(view, [{ x: 100, y: 200 }, { x: 300, y: 200 }], [{ x: 195, y: 200 }, { x: 205, y: 200 }], wrap);
  }
  assert.equal(view.scale, 1);
  assert.equal(view.x, 0); assert.equal(view.y, 0);
  // 같은 자리 유지 이동(핀치 없는 두 손가락 드래그)은 배율을 바꾸지 않는다.
  const panned = pinchView({ scale: 2, x: -100, y: -100 }, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 130, y: 100 }, { x: 230, y: 100 }], wrap);
  assert.ok(Math.abs(panned.scale - 2) < 1e-9);
  assert.equal(panned.x, -70);
  // clampView 단독: 임의의 밖 좌표를 안으로 되돌린다.
  const clamped = clampView({ scale: 9, x: 50, y: -99999 }, wrap);
  assert.equal(clamped.scale, 4);
  assert.equal(clamped.x, 0);
  assert.equal(clamped.y, wrap * (1 - 4));
});
