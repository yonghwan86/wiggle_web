import assert from "node:assert/strict";
import test from "node:test";
import { estimateDocumentBytes, estimateStrokeBytes, MAX_DOCUMENT_BYTES, MAX_STROKE_POINTS, validateDrawDocument } from "../lib/drawing-model.ts";

const stroke = (suffix, pointCount) => ({
  opId: `op_${suffix}`.padEnd(12, "0"),
  clientOpId: `client_${suffix}`.padEnd(14, "0"),
  type: "stroke",
  at: "2026-07-29T01:00:00.000Z",
  tool: "pen",
  color: "#1B3A57",
  width: 16,
  points: Array.from({ length: pointCount }, (_, index) => ({ x: Number((index % 1000 / 1000).toFixed(4)), y: 0.5432, pressure: 0.5 })),
});

const documentWith = (ops) => ({ schemaVersion: 1, rendererVersion: 1, size: 1024, ops });

test("the byte estimate never under-reports the real serialized size", () => {
  // 실제보다 작게 잡으면 클라이언트가 한도를 넘긴 문서를 커밋해 저장이 영구 실패한다.
  for (const counts of [[1], [10, 10], [500], [1200, 1200, 1200], [4000]]) {
    const document = documentWith(counts.map((count, index) => stroke(`sample${index}`, count)));
    const actual = JSON.stringify(document).length;
    const estimated = estimateDocumentBytes(document);
    assert.ok(estimated >= actual, `추정 ${estimated} < 실제 ${actual} (points ${counts.join("+")})`);
    assert.ok(estimated <= actual * 2 + 512, `추정이 지나치게 커서 정상 그림을 막는다: ${estimated} vs ${actual}`);
  }
});

test("the estimate holds for the longest ids server validation accepts", () => {
  // 서버 검증을 통과하는 최대 길이 ID(80자)를 쓴 문서에서도 상한이어야 한다.
  const longId = (prefix) => (prefix + "x".repeat(80)).slice(0, 80);
  const ops = Array.from({ length: 400 }, (_, index) => ({
    ...stroke(`long${index}`, 1),
    opId: longId(`op${index}_`),
    clientOpId: longId(`client${index}_`),
  }));
  const document = documentWith(ops);
  assert.ok(validateDrawDocument(document), "최대 길이 ID 문서는 서버 검증을 통과한다");
  assert.ok(estimateDocumentBytes(document) >= JSON.stringify(document).length, "긴 ID에서도 추정이 실제 이상이어야 한다");
});

test("ids longer than the server limit are rejected instead of silently truncated", () => {
  const tooLong = "a".repeat(81);
  assert.equal(validateDrawDocument(documentWith([{ ...stroke("idcheck", 1), opId: tooLong }])), null);
  assert.equal(validateDrawDocument(documentWith([{ ...stroke("idcheck", 1), clientOpId: tooLong }])), null);
});

test("a single stroke estimate stays above its real cost", () => {
  const one = stroke("single", 900);
  assert.ok(estimateStrokeBytes(900) >= JSON.stringify(one).length);
  assert.ok(estimateStrokeBytes(1) > estimateStrokeBytes(0));
});

test("a document sized to the client budget still passes server validation", () => {
  // 클라이언트 여유분(10만 바이트) 안에서 만든 문서는 서버 한도를 통과해야 한다.
  const perStroke = MAX_STROKE_POINTS - 500;
  const ops = [];
  while (estimateDocumentBytes(documentWith(ops)) + estimateStrokeBytes(perStroke) < MAX_DOCUMENT_BYTES - 100_000) {
    ops.push(stroke(`bulk${ops.length}`, perStroke));
  }
  const document = documentWith(ops);
  assert.ok(ops.length > 0);
  assert.ok(JSON.stringify(document).length <= MAX_DOCUMENT_BYTES, "서버 413 한도를 넘으면 안 된다");
  assert.ok(validateDrawDocument(document), "서버 검증을 통과해야 한다");
});

test("malformed points are rejected instead of throwing", () => {
  for (const points of [[null], [undefined], ["x"], [[0.5, 0.5]], [{ x: 0.5 }], [{ x: 2, y: 0.5 }]]) {
    const document = documentWith([{ ...stroke("bad", 1), points }]);
    assert.equal(validateDrawDocument(document), null, `거부되어야 함: ${JSON.stringify(points)}`);
  }
});
