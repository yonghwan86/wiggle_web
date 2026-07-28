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

test("validation normalizes coordinates and drops unknown fields so the estimate stays an upper bound", () => {
  // 검증기가 정밀도와 추가 속성을 제한하지 않으면 추정이 실제보다 작아져,
  // 클라이언트가 한도를 넘긴 문서를 커밋하고 이후 저장이 계속 413으로 거부된다.
  const messy = documentWith([{
    ...stroke("messy", 0),
    at: "2026-07-29T01:00:00.000Z",
    points: Array.from({ length: 300 }, () => ({ x: 0.12345678901234568, y: 0.98765432109876543, pressure: 0.3333333333333333 })),
    나쁜속성: "x".repeat(5000),
    extra: { deep: "y".repeat(5000) },
  }]);
  const validated = validateDrawDocument(messy);
  assert.ok(validated, "고정밀 좌표 문서는 여전히 통과해야 한다");
  assert.equal(JSON.stringify(validated).includes("나쁜속성"), false, "알 수 없는 속성은 저장되지 않는다");
  assert.equal(JSON.stringify(validated).includes("extra"), false);
  assert.equal(validated.ops[0].points[0].x, 0.1235, "좌표는 소수 4자리로 정규화된다");
  assert.ok(
    estimateDocumentBytes(validated) >= JSON.stringify(validated).length,
    `추정 ${estimateDocumentBytes(validated)} < 실제 ${JSON.stringify(validated).length}`,
  );
});

test("every document validation accepts is bounded by the estimate", () => {
  const shapes = [
    { pointCount: 1, precision: "full" },
    { pointCount: 250, precision: "full" },
    { pointCount: 250, precision: "round" },
    { pointCount: 4000, precision: "full" },
  ];
  for (const shape of shapes) {
    const points = Array.from({ length: shape.pointCount }, (_, index) => shape.precision === "full"
      ? { x: index / 7919, y: index / 6997, pressure: index / 4001 }
      : { x: 0.1234, y: 0.5678, pressure: 0.5 });
    const document = documentWith([{ ...stroke("bounded", 0), points }]);
    const validated = validateDrawDocument(document);
    assert.ok(validated, `통과해야 함: ${JSON.stringify(shape)}`);
    const actual = JSON.stringify(validated).length;
    assert.ok(estimateDocumentBytes(validated) >= actual, `${JSON.stringify(shape)}: 추정 ${estimateDocumentBytes(validated)} < 실제 ${actual}`);
  }
});

test("fields irrelevant to the op type cannot smuggle bulk past the estimate", () => {
  // stroke는 sticker를 검증하지 않는다. 그 자리에 거대한 값을 실어 상한을 깨뜨릴 수 없어야 한다.
  const smuggled = documentWith([{ ...stroke("smuggle", 5), sticker: { blob: "z".repeat(200_000) } }]);
  const validated = validateDrawDocument(smuggled);
  assert.ok(validated, "stroke 자체는 정상이므로 통과한다");
  assert.equal(validated.ops[0].sticker, undefined, "종류와 무관한 필드는 남지 않는다");
  assert.ok(estimateDocumentBytes(validated) >= JSON.stringify(validated).length);

  const eraser = validateDrawDocument(documentWith([{ ...stroke("eraserop", 3), tool: "eraser", color: undefined }]));
  assert.ok(eraser);
  assert.equal(eraser.ops[0].color, undefined, "지우개에는 색을 남기지 않는다");
});

test("non-string or padded timestamps are rejected and survivors normalize to ISO", () => {
  const controlChars = `2026-07-29T01:00:00.000Z${"".repeat(200_000)}`;
  assert.equal(validateDrawDocument(documentWith([{ ...stroke("ctrl", 2), at: controlChars }])), null, "제어문자로 부풀린 날짜는 거부한다");
  assert.equal(validateDrawDocument(documentWith([{ ...stroke("objat", 2), at: { toString: () => "2026-07-29T01:00:00.000Z" } }])), null, "문자열이 아닌 at은 거부한다");
  assert.equal(validateDrawDocument(documentWith([{ ...stroke("objid", 2), opId: { toString: () => "op_abcdefgh" } }])), null, "문자열이 아닌 id는 거부한다");

  const loose = validateDrawDocument(documentWith([{ ...stroke("loose", 2), at: "2026-07-29T01:00:00+09:00" }]));
  assert.ok(loose);
  assert.equal(loose.ops[0].at, new Date("2026-07-29T01:00:00+09:00").toISOString(), "통과한 날짜는 ISO로 정규화된다");
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
