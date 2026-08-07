import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  activeTextObjects,
  drawingTextGraphemes,
  estimateDocumentBytes,
  MAX_TEXT_GRAPHEMES,
  normalizeDrawingText,
  validateDrawDocument,
  visibleDrawOperations,
} from "../lib/drawing-model.ts";
import { clampTextPlacement, suggestTextPlacement } from "../lib/text-placement.ts";

function documentWith(ops) {
  return { schemaVersion: 1, rendererVersion: 1, size: 1024, ops };
}

function textOp(seed, overrides = {}) {
  const suffix = seed.padEnd(8, "x");
  return {
    opId: `op_${suffix}`,
    clientOpId: `client_${suffix}`,
    type: "text",
    at: "2026-08-08T00:00:00.000Z",
    textObjectId: `text_${suffix}`,
    text: "우리 집",
    textKind: "label",
    fontSize: 64,
    color: "#1B3A57",
    points: [{ x: 0.5, y: 0.5 }],
    ...overrides,
  };
}

test("짧은 글씨 종류별 한도와 한글·이모지 grapheme을 검증한다", () => {
  assert.equal(drawingTextGraphemes("가족👨‍👩‍👧").length, 3);
  for (const [kind, maximum] of Object.entries(MAX_TEXT_GRAPHEMES)) {
    const exact = textOp(kind, { textKind: kind, text: "가".repeat(maximum) });
    const overflow = textOp(`${kind}o`, { textKind: kind, text: "가".repeat(maximum + 1) });
    assert.ok(validateDrawDocument(documentWith([exact])), `${kind} 최대 길이는 허용`);
    assert.equal(validateDrawDocument(documentWith([overflow])), null, `${kind} 초과 길이는 거부`);
  }
  assert.equal(normalizeDrawingText("  안녕\n  친구  "), "안녕 친구");
});

test("한 작품에는 활성 글씨 5개만 허용하고 삭제 뒤 새 글씨는 허용한다", () => {
  const five = Array.from({ length: 5 }, (_, index) => textOp(`item${index}`));
  assert.ok(validateDrawDocument(documentWith(five)));
  assert.equal(validateDrawDocument(documentWith([...five, textOp("item5")])), null);
  const deleted = textOp("delete0", { ...five[0], opId: "op_delete0", clientOpId: "client_delete0", deleted: true });
  assert.ok(validateDrawDocument(documentWith([...five, deleted, textOp("item5")])));
});

test("같은 글씨의 마지막 편집만 보이고 삭제·되돌리기용 이전 상태는 남는다", () => {
  const first = textOp("moving0");
  const moved = textOp("moving1", {
    textObjectId: first.textObjectId,
    text: "옮긴 글씨",
    points: [{ x: 0.7, y: 0.2 }],
  });
  const visible = visibleDrawOperations([first, moved]);
  assert.deepEqual(visible, [moved]);
  assert.deepEqual(activeTextObjects([first, moved]), [moved]);
  const removed = textOp("moving2", { ...moved, opId: "op_moving2", clientOpId: "client_moving2", deleted: true });
  assert.deepEqual(activeTextObjects([first, moved, removed]), []);
  assert.deepEqual(activeTextObjects([first, moved]), [moved], "삭제 op를 되돌리면 직전 상태가 복구된다");
});

test("텍스트 필드를 포함한 문서 크기 추정은 실제 JSON보다 작지 않다", () => {
  const document = validateDrawDocument(documentWith([textOp("bytes000", { textKind: "speech", text: "무지개를 타고 달까지 가자!" })]));
  assert.ok(document);
  assert.ok(estimateDocumentBytes(document) >= Buffer.byteLength(JSON.stringify(document), "utf8"));
});

test("빈 곳 추천은 그림이 몰린 곳을 피하고 외부 AI 없이 결정적으로 동작한다", () => {
  const crowdedTop = {
    opId: "op_crowded0",
    clientOpId: "client_crowded0",
    type: "stroke",
    at: "2026-08-08T00:00:00.000Z",
    tool: "pencil",
    color: "#1B3A57",
    width: 16,
    points: [{ x: 0.2, y: 0.1 }, { x: 0.5, y: 0.12 }, { x: 0.8, y: 0.1 }],
  };
  assert.deepEqual(suggestTextPlacement([crowdedTop], "title"), { x: 0.5, y: 0.88 });
  assert.deepEqual(suggestTextPlacement([], "label"), suggestTextPlacement([], "label"));
  assert.deepEqual(clampTextPlacement({ x: 0.01, y: 0.99 }, "speech"), { x: 0.31, y: 0.87 });
});

test("캔버스·썸네일·타임랩스와 어린이용 편집 UI가 같은 텍스트 모델을 사용한다", () => {
  const studio = readFileSync(new URL("../app/components/DrawingStudio.tsx", import.meta.url), "utf8");
  const renderer = readFileSync(new URL("../lib/draw-renderer.ts", import.meta.url), "utf8");
  const timelapse = readFileSync(new URL("../app/components/TimelapsePlayer.tsx", import.meta.url), "utf8");
  const family = readFileSync(new URL("../app/api/family/session/route.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(studio, /renderDrawDocument\(context, document\.ops, size\)/);
  assert.match(studio, /글씨를 놓을 곳을 도화지에서 콕 눌러 주세요/);
  assert.match(studio, /끌어서 옮기기/);
  assert.match(studio, /Aa−/);
  assert.match(studio, /Aa＋/);
  assert.match(studio, /키보드의 마이크로 말해도 돼요/);
  assert.match(studio, /✨ 빈 곳 추천/);
  assert.match(renderer, /function drawText/);
  assert.match(renderer, /visibleDrawOperations\(ops, limit\)/);
  assert.match(timelapse, /renderDrawDocument\(context, document\.ops, size, frame\)/);
  assert.match(family, /textObjectId: operation\.textObjectId/);
  assert.match(css, /\.text-object-selection/);
  assert.match(css, /\.text-composer-modal/);
});
