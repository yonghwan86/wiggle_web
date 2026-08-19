import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { clientIp } from "../lib/client-ip.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// Cloudflare가 앞단에 있을 때만 cf-connecting-ip를 믿을 수 있었다. Vercel에는 그 대리인이
// 없으므로 요청자가 헤더를 지어내면 그만이고, 그러면 요청마다 새 IP를 쓰는 것만으로
// 그림 비밀번호 추측 방어(IP·학급 단위 상한)를 통째로 우회한다.
test("rate-limit buckets ignore the spoofable Cloudflare IP header", async () => {
  const headers = (values) => new Request("http://localhost/api/student", { headers: values });

  assert.equal(clientIp(headers({ "cf-connecting-ip": "203.0.113.9" })), "local", "위조 가능한 헤더는 버킷을 가르지 못한다");
  assert.equal(clientIp(headers({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.4" })), "198.51.100.4", "플랫폼이 채우는 헤더가 이긴다");
  assert.equal(clientIp(headers({ "x-real-ip": "198.51.100.5" })), "198.51.100.5");
  assert.equal(clientIp(headers({ "x-vercel-forwarded-for": "198.51.100.6", "x-real-ip": "198.51.100.7" })), "198.51.100.6", "Vercel이 검증한 헤더가 최우선");
  assert.equal(clientIp(headers({ "x-forwarded-for": "198.51.100.8, 10.0.0.1" })), "198.51.100.8");
  assert.equal(clientIp(headers({})), "local");

  const sources = await Promise.all([
    read("../app/api/student/route.ts"),
    read("../app/api/teacher/route.ts"),
    read("../app/api/family/invite/route.ts"),
    read("../app/api/family/session/route.ts"),
    read("../app/family/[token]/route.ts"),
  ]);
  for (const source of sources) assert.doesNotMatch(source, /cf-connecting-ip/, "IP 판정은 lib/client-ip.ts의 clientIp 한 곳에서만 한다");
});

test("hosted teachers use verified Google OAuth and fixed demo credentials are absent", async () => {
  const [security, googleAuth, start, callback, api, demoSeed, page, classPage, ui, readme] = await Promise.all([read("../lib/security.ts"), read("../lib/google-auth.ts"), read("../app/api/auth/google/start/route.ts"), read("../app/api/auth/google/callback/route.ts"), read("../app/api/teacher/route.ts"), read("../lib/demo-seed.ts"), read("../app/teacher/page.tsx"), read("../app/teacher/class/[id]/page.tsx"), read("../app/components/TeacherApp.tsx"), read("../README.md")]);
  // Sites 프록시 밖에서는 oai-* 헤더를 클라이언트가 위조할 수 있다 — 헤더 신뢰 경로가 부활하면 안 된다.
  assert.doesNotMatch(security, /oai-authenticated|getChatGPTUser|chatgpt-auth|siwc/);
  assert.match(security, /upsertGoogleTeacher/); assert.match(security, /wiggle_teacher/); assert.match(security, /localhost/); assert.match(api, /isLocalDemoRequest\(request\)/);
  // 코드 플로우 방어선: PKCE S256, state 상수시간 비교, 미검증 이메일 거부, 상태 쿠키는 httpOnly.
  assert.match(googleAuth, /code_challenge_method: "S256"/); assert.match(googleAuth, /code_verifier/); assert.match(googleAuth, /emailVerified !== true/);
  assert.match(start, /httpOnly: true/); assert.match(start, /sameSite: "lax"/);
  // 세션 쿠키는 lax여야 한다 — 콜백의 /teacher 리디렉션은 구글발 교차 사이트 연쇄라
  // strict 쿠키가 실리지 않아 로그인 성공 직후 무한 루프가 된다(2026-08-19 운영 실측).
  assert.match(callback, /timingSafeEqualText\(state, stored\.state\)/); assert.match(callback, /validateGoogleTeacher/); assert.match(callback, /sameSite: "lax"/); assert.doesNotMatch(callback, /sameSite: "strict"/);
  assert.match(page + classPage, /\/api\/auth\/google\/start/); assert.match(page + classPage, /NODE_ENV === "production"/);
  assert.match(ui, /\/api\/auth\/google\/start\?return_to=%2Fteacher/);
  assert.doesNotMatch(api + ui + readme, /teacher@wiggle\.local|\/ 2841|DEMO_TEACHER|ensureDemoSeed/);
  assert.equal((api.match(/await requireTeacher\(\) \?\? await localAutoTeacher\(request\)/g) ?? []).length, 2);
  assert.match(api, /async function localAutoTeacher\(request: Request\) \{\s*if \(!isLocalDemoRequest\(request\)\) return null;/);
  const autoTeacher = demoSeed.slice(demoSeed.indexOf("export async function ensureLocalAutoTeacher"), demoSeed.indexOf("export async function ensureLocalTeacher"));
  assert.match(autoTeacher, /@localhost\.invalid/);
  assert.doesNotMatch(autoTeacher, /pin|deriveSecret|verifySecret/);
});

test("shared tablet profiles never reactivate a stored raw token", async () => {
  const [session, join, studentApi] = await Promise.all([read("../lib/client-session.ts"), read("../app/components/JoinClient.tsx"), read("../app/api/student/route.ts")]);
  assert.match(session, /sessionStorage\.setItem\(ACTIVE_SESSION_KEY/); assert.match(session, /LEGACY_PROFILES_KEY/); assert.doesNotMatch(session, /function activateProfile/);
  assert.match(join, /picturePassword/); assert.doesNotMatch(join, /switchProfile|deviceProfiles|activeProfile|activateProfile/);
  assert.match(studentApi, /action === "switchProfile"/); assert.match(studentApi, /verifySecret\(picture/); assert.match(studentApi, /2 \* 60 \* 60 \* 1000/);
});

test("save conflicts remain queued and require an explicit copy", async () => {
  const [session, studio] = await Promise.all([read("../lib/client-session.ts"), read("../app/components/DrawingStudio.tsx")]);
  assert.match(session, /flushResponseDisposition\(response\.status\)/); assert.match(session, /disposition === "conflict"/); assert.match(session, /conflict: true/); assert.match(session, /conflicts\.push/); assert.doesNotMatch(session, /retried\.expectedRevision|serverRevision;\s*response = await fetch/);
  assert.match(studio, /새 사본으로 저장/); assert.match(studio, /saveAsCopy/); assert.doesNotMatch(studio, /revisionRef\.current = data\.serverRevision; return save/);
  assert.match(studio, /response\.status >= 400 && response\.status < 500/);
});

test("artwork CAS, idempotency, completion and R2 keys are race safe", async () => {
  const files = await readdir(new URL("../drizzle/", import.meta.url)); const migration = await read(`../drizzle/${files.find((name) => name.endsWith(".sql"))}`);
  const [route, runtime] = await Promise.all([read("../app/api/artworks/[id]/route.ts"), read("../db/runtime.ts")]);
  assert.match(migration, /PRIMARY KEY\(`artwork_id`, `student_id`, `request_id`\)/); assert.match(migration, /`last_mutation_id` text/);
  assert.match(route, /db\.batch\(statements\)/); assert.match(route, /last_mutation_id = \?/); assert.match(route, /INSERT OR IGNORE INTO artwork_mutations/); assert.match(route, /status <> 'complete'/);
  assert.match(route, /if \(artwork\.status === "complete"\)/); assert.match(route, /!favoritePart \|\| !favoriteReason/);
  assert.match(route, /requestId.*nonce.*thumb\.png/s); assert.doesNotMatch(route, /state: "candidate"/); assert.match(route, /state: "committed"/); assert.match(route, /removeCandidates/);
  assert.equal((route.match(/ARTWORKS\.put\(thumbnailKey/g) ?? []).length, 1);
  assert.equal((route.match(/ARTWORKS\.put\(finalKey/g) ?? []).length, 1);
  assert.match(runtime, /PRIMARY KEY\(artwork_id, student_id, request_id\)/);
});

test("duplicate recovery, logout and protected response regressions stay fixed", async () => {
  const [student, teacher, security] = await Promise.all([read("../app/api/student/route.ts"), read("../app/api/teacher/route.ts"), read("../lib/security.ts")]);
  assert.match(student, /\.all<RecoveredStudent>/); assert.match(student, /Promise\.all\(candidates\.results\.map/); assert.match(student, /matches\.length > 1/);
  assert.match(teacher, /revokeTeacherSession/); assert.match(security, /DELETE FROM teacher_sessions/); assert.match(security, /cache-control", "no-store/);
  assert.match(student, /ORDER BY m\.created_at DESC, m\.id DESC LIMIT 50/); assert.match(student, /ORDER BY createdAt ASC, id ASC/);
  assert.match(student, /LEFT JOIN message_receipts r ON r\.message_id = m\.id AND r\.student_id = \?/);
  assert.doesNotMatch(student, /if \(messages\.results\.length\).*message_receipts/);
  assert.match(student, /action === "ackTeacherMessage"/); assert.match(student, /INSERT OR IGNORE INTO message_receipts/);
  assert.match(student, /action === "ackTeacherMessages"/); assert.match(student, /rawMessageIds[\s\S]*slice\(0, 50\)/); assert.match(student, /db\.batch\(messageIds\.map/);
});

test("P1 operational safeguards are wired", async () => {
  const [init, schema, teacherApi, teacherUi, studio] = await Promise.all([read("../scripts/init-local-db.mjs"), read("../db/schema.ts"), read("../app/api/teacher/route.ts"), read("../app/components/TeacherApp.tsx"), read("../app/components/DrawingStudio.tsx")]);
  // 로컬 초기화는 앱과 같은 정본 스키마 경로를 쓴다 — 따로 관리되는 DDL 사본이 생기면 안 된다.
  assert.match(init, /provisionSchema/); assert.doesNotMatch(init, /CREATE TABLE/);
  assert.match(schema, /primaryKey\(\{ columns: \[table\.messageId, table\.studentId\]/); assert.match(schema, /teacherViews/);
  assert.match(teacherApi, /action === "viewStudent"/); assert.match(teacherApi, /action === "resetStudentRecovery"/); assert.doesNotMatch(teacherUi, /복구 카드 재발급/);
  assert.match(studio, /new Map<number/); assert.match(studio, /event\.pointerId/);
});

test("legacy mutation storage upgrades in place and offline saves contain no bearer token", async () => {
  const [runtime, init, incremental, session, studio] = await Promise.all([
    read("../db/runtime.ts"), read("../scripts/init-local-db.mjs"), read("../drizzle/0001_artwork_mutations_composite_pk.sql"), read("../lib/client-session.ts"), read("../app/components/DrawingStudio.tsx"),
  ]);
  assert.match(runtime, /PRAGMA table_info/); assert.match(runtime, /sqlite_master/); assert.match(runtime, /DB\.batch/); assert.match(runtime, /artwork_mutations__composite_pk/);
  assert.match(incremental, /INSERT OR IGNORE INTO `artwork_mutations__composite_pk`/); assert.match(incremental, /PRIMARY KEY\(`artwork_id`, `student_id`, `request_id`\)/);
  // 초기화 스크립트와 dev 서버가 같은 파일 DB를 봐야 한다. 경로가 갈리면 "초기화했는데 비어 있다"가 된다.
  assert.match(init, /file:\.data\/wiggle-local\.db/); assert.match(runtime, /provisionSchema/);
  // 운영 자격증명이 켜진 채로 로컬 초기화를 돌려 원격 DB를 건드리는 사고를 막는다.
  assert.match(init, /process\.env\.TURSO_DATABASE_URL/);
  assert.match(session, /indexedDB\.open\("wiggle-offline-v1", 2\)/); assert.match(session, /delete value\.token/); assert.match(session, /profile\.deviceToken/);
  assert.doesNotMatch(session, /QueuedSave[^\n]+token:/); assert.doesNotMatch(studio, /queueSave\(\{[^}]*token:/s);
});
