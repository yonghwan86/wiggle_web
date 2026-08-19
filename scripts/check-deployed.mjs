// 배포된 운영 서버 실측 게이트 — 실제 수업 코드로 학생 전 과정을 검증한다.
// 학생 입장 → 작품 생성 → 3.4MB 완성 PNG 바이너리 업로드(Vercel 4.5MB 한도 실증) →
// 완성 저장(키 참조) → 완성본 회수(바이트 전수 일치) → 경계(남의 키·유령 키 413).
//
// 사용법: npm run check:deployed -- https://wiggleweb.vercel.app 1234
//   - 두 번째 인자는 입장이 열린 실제 학급의 4자리 수업 코드다.
//   - 실행하면 그 학급에 검증용 학생("검증화가…")과 작품이 생긴다.
//     끝나면 교사 화면에서 지우거나, 남겨서 시연용으로 써도 된다.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { emptyDocument } from "../lib/drawing-model.ts";

const rawBase = process.argv[2] ?? "";
const CLASS_CODE = process.argv[3] ?? "";
if (!/^https?:\/\//.test(rawBase) || !/^\d{4}$/.test(CLASS_CODE)) {
  console.error("사용법: npm run check:deployed -- <운영주소> <4자리 수업코드>");
  console.error("예:     npm run check:deployed -- https://wiggleweb.vercel.app 1234");
  process.exit(1);
}
const BASE = new URL(rawBase).origin;
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
  step = "학생 입장";
  const nickname = `검증화가${Date.now() % 100000}`;
  const join = await expectStatus(await fetch(`${BASE}/api/student`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "join", entry: CLASS_CODE, nickname, animal: "🐰", picturePassword: ["별", "달", "꽃"], allowDuplicate: true }),
  }), 201, step);
  assert.ok(join.deviceToken, "deviceToken");
  const auth = { authorization: `Bearer ${join.deviceToken}` };
  log(`${step} (${nickname}, 코드 ${CLASS_CODE})`);

  step = "작품 생성";
  const created = await readJson(await fetch(`${BASE}/api/artworks`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ learningMode: "free", title: "배포 검증 그림" }) }));
  const artworkId = created.artwork?.id ?? created.id;
  assert.ok(artworkId, `작품 ID :: ${JSON.stringify(created).slice(0, 200)}`);
  log(`${step} (${artworkId})`);

  step = "3.4MB 완성 이미지 바이너리 업로드";
  const requestId = `req_deploy_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const image = bigPng();
  const uploadStarted = Date.now();
  const uploaded = await expectStatus(await fetch(`${BASE}/api/artworks/${artworkId}/image?kind=final&requestId=${requestId}`, { method: "PUT", headers: { ...auth, "content-type": "image/png" }, body: image }), 201, step);
  assert.ok(uploaded.key?.startsWith("students/"), "후보 키");
  log(`${step}: ${image.length.toLocaleString()} bytes, ${Date.now() - uploadStarted}ms`);

  step = "완성 저장 (JSON은 키만 참조)";
  const completion = {
    requestId,
    expectedRevision: 0,
    document: emptyDocument(),
    currentStep: 0,
    complete: true,
    reflection: { favoritePart: "무지개", favoriteReason: "배포 검증이 통과해서요" },
    thumbnailDataUrl: `data:image/png;base64,${Buffer.from(PNG_MAGIC).toString("base64")}`,
    finalImageKey: uploaded.key,
  };
  const body = JSON.stringify(completion);
  await expectStatus(await fetch(`${BASE}/api/artworks/${artworkId}`, { method: "PUT", headers: { ...auth, "content-type": "application/json" }, body }), 200, step);
  log(`${step} (${body.length.toLocaleString()} bytes)`);

  step = "완성본 회수 (서버 스트리밍)";
  const downloadStarted = Date.now();
  const download = await fetch(`${BASE}/api/artworks/${artworkId}/image?variant=final`, { headers: auth });
  assert.equal(download.status, 200, "완성본 조회");
  const roundTrip = new Uint8Array(await download.arrayBuffer());
  assert.equal(roundTrip.length, FINAL_BYTES, "바이트 수 일치");
  let mismatch = -1;
  for (let i = 0; i < FINAL_BYTES; i += 1) { if (roundTrip[i] !== image[i]) { mismatch = i; break; } }
  assert.equal(mismatch, -1, `바이트 불일치 @${mismatch}`);
  log(`${step}: ${FINAL_BYTES.toLocaleString()} 바이트 전수 일치, ${Date.now() - downloadStarted}ms`);

  step = "경계 검증: 남의 키·유령 키는 413";
  const second = await readJson(await fetch(`${BASE}/api/artworks`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ learningMode: "free", title: "경계 검증" }) }));
  const secondId = second.artwork?.id ?? second.id;
  const forge = (key) => fetch(`${BASE}/api/artworks/${secondId}`, { method: "PUT", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ ...completion, requestId: `${requestId}b`, finalImageKey: key }) });
  await expectStatus(await forge(uploaded.key), 413, "남의 작품 키 참조(프리픽스 불일치)");
  await expectStatus(await forge(`students/${join.student.id}/artworks/${secondId}/objects/upload-${requestId}b-none-final.png`), 413, "존재하지 않는 키");
  log(step);

  step = "학생 홈 상태 조회";
  const home = await readJson(await fetch(`${BASE}/api/student`, { headers: auth }));
  assert.ok(Array.isArray(home.artworks), "작품 목록");
  log(`${step}: 작품 ${home.artworkTotal}개, 현재 활동 "${home.currentActivityLabel}"`);

  console.log(`\n운영 배포 검증 통과 — 검증 학생 "${nickname}"은 교사 화면에서 지워도 됩니다.`);
} catch (error) {
  console.error(`\nFAIL @ ${step}`);
  console.error(error?.message ?? error);
  process.exit(1);
}
