import assert from "node:assert/strict";
import test from "node:test";
import { base64ToBytes, finalImageUploadUrl, splitCompletionBody } from "../lib/save-transmit.ts";

// Vercel 4.5MB 본문 한도 대응: 완성 저장 전송 분리의 순수 규칙을 고정한다.
// 큐 본문 자체는 바꾸지 않고 전송 시점에만 이미지를 떼어낸다는 계약이 핵심이다.

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString("base64");

function completionBody(extra = {}) {
  return JSON.stringify({
    requestId: "req_123456789012",
    expectedRevision: 3,
    document: { ops: [] },
    currentStep: 2,
    complete: true,
    reflection: { favoritePart: "귀", favoriteReason: "커서" },
    thumbnailDataUrl: "data:image/png;base64,AAAA",
    finalDataUrl: `data:image/png;base64,${PNG_B64}`,
    ...extra,
  });
}

test("완성 본문만 분리되고, 키를 받은 본문은 이미지 없이 완성 정보를 유지한다", () => {
  const split = splitCompletionBody(completionBody());
  assert.ok(split);
  assert.equal(split.imageBase64, PNG_B64);

  const sent = JSON.parse(split.bodyWithKey("students/s1/artworks/a1/objects/upload-x-final.png"));
  assert.equal(sent.finalImageKey, "students/s1/artworks/a1/objects/upload-x-final.png");
  assert.equal(sent.finalDataUrl, undefined, "base64 이미지는 전송 본문에서 빠져야 4.5MB 한도를 지킨다");
  assert.equal(sent.complete, true);
  assert.equal(sent.thumbnailDataUrl, "data:image/png;base64,AAAA", "썸네일은 인라인 유지");
  assert.deepEqual(sent.reflection, { favoritePart: "귀", favoriteReason: "커서" });
});

test("중간 저장·이미지 없는 본문·손상 본문은 분리하지 않고 원문 그대로 보낸다", () => {
  assert.equal(splitCompletionBody(completionBody({ complete: false })), null);
  assert.equal(splitCompletionBody(JSON.stringify({ complete: true })), null);
  assert.equal(splitCompletionBody(JSON.stringify({ complete: true, finalDataUrl: "data:image/jpeg;base64,AAAA" })), null, "PNG 데이터 URL만 분리 대상");
  assert.equal(splitCompletionBody("not-json"), null);
});

test("base64 디코딩은 서버 decodeImage와 같은 규칙으로 잘못된 입력을 거른다", () => {
  const bytes = base64ToBytes(PNG_B64);
  assert.ok(bytes);
  assert.deepEqual([...bytes.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(base64ToBytes("A"), null, "길이 4의 배수가 아니면 거부");
  assert.equal(base64ToBytes("===="), null);
  assert.equal(base64ToBytes("!!!!"), null);
});

test("업로드 주소는 저장 주소·요청 번호에서 유도되고 인코딩된다", () => {
  assert.equal(
    finalImageUploadUrl("/api/artworks/art_1", "req_123456789012"),
    "/api/artworks/art_1/image?kind=final&requestId=req_123456789012",
  );
  assert.ok(finalImageUploadUrl("/api/artworks/a", "x y").includes("x%20y"));
});
