import assert from "node:assert/strict";
import test from "node:test";
import { estimateDocumentBytes, estimateStrokeBytes, SHAPE_KINDS, STROKE_TOOLS, STROKE_WIDTH_MAX, STROKE_WIDTH_MIN, validateDrawDocument, MIN_POINT_GAP, strokePointGap, drawnStrokeWidth } from "../lib/drawing-model.ts";
import { isMirrorOf, mirrorOp, undoGroupSize } from "../lib/symmetry.ts";
import { clampView, coverPaper, IDENTITY_VIEW, minScaleFor, pinchView, zoomView } from "../lib/canvas-view.ts";

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

test("server validation accepts every shipped tool and every whole-pixel width, and only those", () => {
  for (const tool of STROKE_TOOLS) {
    // 1~60 픽셀 정수. 예전 5단 값(3·8·16·30·48)도 범위 안이라 옛 작품이 열린다.
    for (const width of [STROKE_WIDTH_MIN, 3, 8, 12, 16, 30, 48, STROKE_WIDTH_MAX]) {
      const op = stroke(`t${tool}${width}`, { tool, width, color: tool === "eraser" ? undefined : "#E53935" });
      assert.ok(validateDrawDocument(documentWith([op])), `${tool}/${width}는 통과해야 한다`);
    }
  }
  // 목록 밖 도구·굵기가 통과하면 구버전 클라이언트와의 계약이 깨진다.
  assert.equal(validateDrawDocument(documentWith([stroke("spray", { tool: "spray" })])), null);
  assert.equal(validateDrawDocument(documentWith([stroke("w0", { width: 0 })])), null);
  assert.equal(validateDrawDocument(documentWith([stroke("w61", { width: STROKE_WIDTH_MAX + 1 })])), null);
  assert.equal(validateDrawDocument(documentWith([stroke("w12.5", { width: 12.5 })])), null);
  assert.equal(validateDrawDocument(documentWith([stroke("wstr", { width: "12" })])), null);
  // 도형도 같은 굵기 범위를 쓴다.
  const shape = (width) => ({ ...stroke(`sh${width}`, { width }), type: "shape", shape: "circle", tool: undefined, points: [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.6 }] });
  assert.ok(validateDrawDocument(documentWith([shape(48)])));
  assert.ok(validateDrawDocument(documentWith([shape(12)])));
  assert.equal(validateDrawDocument(documentWith([shape(STROKE_WIDTH_MAX + 1)])), null);
});

test("new shape, smoothing and square eraser metadata survive validation without changing legacy strokes", () => {
  const shape = (kind) => ({
    ...stroke(`shape-${kind}`, { tool: undefined }),
    type: "shape",
    shape: kind,
    filled: true,
    points: [{ x: 0.15, y: 0.2 }, { x: 0.75, y: 0.8 }],
  });
  for (const kind of SHAPE_KINDS) {
    const validated = validateDrawDocument(documentWith([shape(kind)]));
    assert.equal(validated?.ops[0].shape, kind);
    assert.equal(validated?.ops[0].filled, true);
  }

  const enhanced = stroke("enhanced", { tool: "eraser", color: undefined, smoothed: false, squareEraser: true });
  const enhancedValidated = validateDrawDocument(documentWith([enhanced]));
  assert.equal(enhancedValidated?.ops[0].squareEraser, true);
  assert.equal(enhancedValidated?.ops[0].smoothed, false);

  const legacy = validateDrawDocument(documentWith([stroke("legacy")]));
  assert.equal(legacy?.ops[0].smoothed, undefined);
  assert.equal(legacy?.ops[0].squareEraser, undefined);
  assert.equal(validateDrawDocument(documentWith([stroke("bad-smoothing", { smoothed: "yes" })])), null);
  assert.equal(validateDrawDocument(documentWith([shape("hexagon")])), null);
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

test("zoom buttons and trackpad keep the anchor point and let a tall paper pan to its bottom", () => {
  // 세로로 긴 휴대폰 도화지(390×720): 세로 이동은 세로 길이로 가둬야 아래쪽까지 닿는다.
  const tall = clampView({ scale: 2, x: 0, y: -99999 }, 390, 720);
  assert.equal(tall.y, 720 * (1 - 2));
  assert.equal(clampView({ scale: 2, x: -99999, y: 0 }, 390, 720).x, 390 * (1 - 2));
  // 가운데를 붙잡고 1.5배: 가운데 점이 제자리에 남는다.
  const zoomed = zoomView(IDENTITY_VIEW, 1.5, { x: 195, y: 360 }, 390, 720);
  assert.equal(zoomed.scale, 1.5);
  assert.ok(Math.abs((195 - zoomed.x) / zoomed.scale - 195) < 1e-9 && Math.abs((360 - zoomed.y) / zoomed.scale - 360) < 1e-9);
  // 4배 위·1배 아래로는 가지 않는다.
  assert.equal(zoomView(zoomed, 99, { x: 0, y: 0 }, 390, 720).scale, 4);
  assert.deepEqual(zoomView(zoomed, 0.1, { x: 300, y: 600 }, 390, 720), IDENTITY_VIEW);
});

test("the paper always covers its frame, and an overflowing paper pans at 1x without showing background", () => {
  // 세로 720 그림을 1180×754 틀에: 폭에 맞추고 세로로 넘친다(양옆 여백 없음).
  const wide = coverPaper(1180, 754, 720);
  assert.equal(wide.width, 1180);
  assert.ok(wide.height > 754 && Math.abs(wide.height - 1180 * 720 / 1024) < 1e-9);
  // 세로로 긴 틀은 높이에 맞춘다(늘릴 수 있는 최대를 넘는 아주 긴 틀).
  const tall = coverPaper(300, 900, 1024);
  assert.equal(tall.height, 900);
  assert.ok(tall.width >= 300);
  // 1배에서도 넘친 만큼만 옮겨지고, 틀 밖 바탕이 드러나지 않는다.
  const box = [1180, 754, wide.width, wide.height];
  assert.equal(clampView({ scale: 1, x: 50, y: -99999 }, ...box).y, 754 - wide.height);
  assert.equal(clampView({ scale: 1, x: 50, y: 20 }, ...box).x, 0);
  assert.equal(clampView({ scale: 1, x: 50, y: 20 }, ...box).y, 0);
});

test("넓은 도화지는 전체가 보이는 배율보다 한 칸 더 줄어들고, 그 아래로는 내려가지 않는다", () => {
  // 100%에서 종이는 틀의 3배다(1180×754 화면 → 3540×2262 종이).
  const box = [1180, 754, 3540, 2262];
  const limits = { min: minScaleFor(3), max: 4 };
  // 1/span이면 종이 전체가 틀에 딱 맞는다.
  assert.equal(Math.round(3540 / 3), 1180);
  // 바닥은 거기서 한 칸(1.5배) 더 아래다 — 종이 끝과 그 바깥 바탕이 보인다(2026-09-23 사용자 요청).
  const out = clampView({ scale: 0.001, x: 0, y: 0 }, ...box, limits);
  assert.ok(Math.abs(out.scale - 1 / 3 / 1.5) < 1e-9, `축소 하한: ${out.scale}`);
  assert.ok(3540 * out.scale < 1180, "바닥에서는 종이가 틀보다 좁다");
  // 종이가 틀보다 작으면 왼쪽 위에 붙지 않고 가운데에 놓인다.
  assert.equal(out.x, (1180 - 3540 * out.scale) / 2);
  assert.equal(out.y, (754 - 2262 * out.scale) / 2);
  // 손으로 밀어도 가운데를 벗어나지 않는다 — 옮길 여유가 없는 상태다.
  assert.equal(clampView({ scale: out.scale, x: -900, y: 400 }, ...box, limits).x, out.x);
  // 한계를 주지 않으면 예전처럼 1배 아래로 내려가지 않는다(옛 작품 보호).
  assert.equal(clampView({ scale: 0.01, x: 0, y: 0 }, ...box).scale, 1);
  // 확대 상한은 그대로 4배, 이동은 종이 밖을 보여 주지 않는다.
  const zoomed = zoomView({ scale: 1, x: 0, y: 0 }, 99, { x: 590, y: 377 }, ...box, limits);
  assert.equal(zoomed.scale, 4);
  assert.ok(zoomed.x <= 0 && zoomed.x >= 1180 - 3540 * 4, "가로 이동이 종이 안에 머문다");
});

test("굵은 붓은 점을 성글게 담고, 가는 붓은 예전 밀도를 지킨다", () => {
  /* 2026-09-26 운영 보고: 여백이 많은데도 「종이가 가득 찼다」가 떴다. 넓이가 아니라 저장 용량
     (1.25MB)이 먼저 찬 것이고, 그걸 채우는 건 점 개수다. 렌더러는 점을 찍지 않고 이어 그리므로
     굵은 붓에 촘촘한 점은 낭비다. 간격을 보이는 굵기의 1/4로 잡되 바닥은 2.5를 지킨다. */
  assert.equal(MIN_POINT_GAP, 2.5);
  // 가는 연필: 바닥값이 걸려 예전과 같다 — 세밀한 그림의 밀도를 떨어뜨리지 않는다.
  assert.equal(strokePointGap("pencil", 4), 2.5);
  assert.equal(strokePointGap("pencil", 10), 2.5);
  // 수채붓은 저장 굵기의 두 배로 그어진다 — 그 실제 굵기를 기준으로 성글어진다.
  assert.equal(strokePointGap("watercolor", 16), 8);
  assert.equal(strokePointGap("marker", 20), 8);
  // 도구를 모르면 배율 1로 본다(옛 "pen" 획 등).
  assert.equal(strokePointGap(undefined, 40), 10);
  // 렌더러와 같은 배율을 써야 "보이는 굵기"가 어긋나지 않는다.
  assert.equal(drawnStrokeWidth("watercolor", 16), 32);
  assert.equal(drawnStrokeWidth("crayon", 16), 16);
});

test("성글게 담아도 한도까지 그릴 수 있는 양이 실제로 늘어난다", () => {
  // 간격이 넓어지면 같은 길이를 긋는 데 쓰는 점이 줄고, 그만큼 더 오래 칠할 수 있다.
  const path = 100_000; // 도화지 단위로 잰 붓이 지나간 총 거리
  const before = path / MIN_POINT_GAP;
  const after = path / strokePointGap("watercolor", 16);
  assert.equal(Math.round(before / after * 10) / 10, 3.2, "굵은 수채붓은 점이 3.2배 적게 쌓인다");
});
