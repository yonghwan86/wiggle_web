// 3.4MB 완성 PNG 실저장 게이트 — Vercel 4.5MB 본문 한도 대응(바이너리 분리 업로드)을
// 실제 API 흐름(교사 생성 → 학생 입장 → 작품 생성 → 이미지 업로드 → 완성 저장 → 회수)으로
// dev 서버에 대고 검증한다. 사용법: node scripts/check-large-save.mjs http://localhost:3000
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { emptyDocument } from "../lib/drawing-model.ts";

const BASE = new URL(process.argv[2] ?? "http://localhost:3000").origin;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FINAL_BYTES = 3_400_000;

let step = "시작";
const log = (message) => console.log(`  OK   ${message}`);

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200) }; }
}

async function expectStatus(response, status, label) {
  if (response.status !== status) {
    const body = await readJson(response);
    assert.fail(`${label}: ${response.status} (기대 ${status}) :: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return readJson(response);
}

function bigPng() {
  const bytes = new Uint8Array(FINAL_BYTES);
  for (let offset = 0; offset < bytes.length; offset += 65536) {
    webcrypto.getRandomValues(bytes.subarray(offset, Math.min(offset + 65536, bytes.length)));
  }
  bytes.set(PNG_MAGIC, 0);
  return bytes;
}

try {
  step = "교사 로컬 로그인";
  const login = await fetch(`${BASE}/api/teacher`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ action: "login", email: "large-save@local.dev", pin: "large-save-pin-1" }) });
  await expectStatus(login, 200, step);
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  assert.ok(cookie.startsWith("wiggle_teacher="), "교사 세션 쿠키");
  log(step);

  step = "학급 준비";
  let rooms = await readJson(await fetch(`${BASE}/api/teacher`, { headers: { cookie } }));
  if (!rooms.classrooms?.length) {
    await expectStatus(await fetch(`${BASE}/api/teacher`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, cookie }, body: JSON.stringify({ action: "createClassroom", displayName: "대용량 저장 점검반" }) }), 201, "학급 생성");
    rooms = await readJson(await fetch(`${BASE}/api/teacher`, { headers: { cookie } }));
  }
  const classCode = rooms.classrooms[0].classCode;
  assert.match(String(classCode), /^\d{4}$/);
  log(`${step} (코드 ${classCode})`);

  step = "학생 입장";
  const join = await expectStatus(await fetch(`${BASE}/api/student`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ action: "join", entry: String(classCode), nickname: `대용량${Date.now() % 100000}`, animal: "🐰", picturePassword: ["별", "달", "꽃"], allowDuplicate: true }) }), 201, step);
  const token = join.deviceToken;
  assert.ok(token, "deviceToken");
  log(step);

  const auth = { authorization: `Bearer ${token}`, origin: BASE };

  step = "작품 생성";
  const created = await readJson(await fetch(`${BASE}/api/artworks`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ learningMode: "free", title: "큰 완성 그림" }) }));
  const artworkId = created.artwork?.id ?? created.id;
  assert.ok(artworkId, `작품 ID :: ${JSON.stringify(created).slice(0, 200)}`);
  log(`${step} (${artworkId})`);

  step = "3.4MB 완성 이미지 바이너리 업로드";
  const requestId = `req_large_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const image = bigPng();
  const uploaded = await expectStatus(await fetch(`${BASE}/api/artworks/${artworkId}/image?kind=final&requestId=${requestId}`, { method: "PUT", headers: { ...auth, "content-type": "image/png" }, body: image }), 201, step);
  assert.ok(uploaded.key?.startsWith("students/"), "후보 키");
  log(`${step} (${image.length.toLocaleString()} bytes)`);

  step = "완성 저장(JSON은 키만 참조)";
  const completion = {
    requestId,
    expectedRevision: 0,
    document: emptyDocument(),
    currentStep: 0,
    complete: true,
    reflection: { favoritePart: "하늘", favoriteReason: "파란색이 마음에 들어요" },
    thumbnailDataUrl: `data:image/png;base64,${Buffer.from(PNG_MAGIC).toString("base64")}`,
    finalImageKey: uploaded.key,
  };
  const body = JSON.stringify(completion);
  assert.ok(body.length < 4_500_000, `완성 JSON이 한도 안 (${body.length} bytes)`);
  await expectStatus(await fetch(`${BASE}/api/artworks/${artworkId}`, { method: "PUT", headers: { ...auth, "content-type": "application/json" }, body }), 200, step);
  log(`${step} (${body.length.toLocaleString()} bytes)`);

  step = "완성본 회수(서버 스트리밍)";
  const download = await fetch(`${BASE}/api/artworks/${artworkId}/image?variant=final`, { headers: auth });
  assert.equal(download.status, 200, "완성본 조회");
  const roundTrip = new Uint8Array(await download.arrayBuffer());
  assert.equal(roundTrip.length, FINAL_BYTES, "바이트 수 일치");
  assert.deepEqual([...roundTrip.slice(0, 8)], PNG_MAGIC, "PNG 시그니처 일치");
  log(step);

  step = "경계 검증: 남의 키·유령 키는 413";
  const second = await readJson(await fetch(`${BASE}/api/artworks`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ learningMode: "free", title: "경계 검증" }) }));
  const secondId = second.artwork?.id ?? second.id;
  const forge = (key) => fetch(`${BASE}/api/artworks/${secondId}`, { method: "PUT", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ ...completion, requestId: `${requestId}b`, finalImageKey: key }) });
  await expectStatus(await forge(uploaded.key), 413, "남의 작품 키 참조(프리픽스 불일치)");
  await expectStatus(await forge(`students/${join.student.id}/artworks/${secondId}/objects/upload-${requestId}b-none-final.png`), 413, "존재하지 않는 키");
  log(step);

  console.log("\n대용량 저장 검증 통과");
} catch (error) {
  console.error(`\nFAIL @ ${step}`);
  console.error(error);
  process.exit(1);
}
