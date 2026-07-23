import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("hosted teachers require SIWC and fixed demo credentials are absent", async () => {
  const [security, api, page, classPage, ui, readme] = await Promise.all([read("../lib/security.ts"), read("../app/api/teacher/route.ts"), read("../app/teacher/page.tsx"), read("../app/teacher/class/[id]/page.tsx"), read("../app/components/TeacherApp.tsx"), read("../README.md")]);
  assert.match(security, /getChatGPTUser/); assert.match(security, /process\.env\.NODE_ENV === "production"/); assert.match(security, /localhost/); assert.match(api, /isLocalDemoRequest\(request\)/);
  assert.match(page + classPage, /requireChatGPTUser/); assert.match(page + classPage, /NODE_ENV === "production"/);
  assert.doesNotMatch(api + ui + readme, /teacher@wiggle\.local|\/ 2841|DEMO_TEACHER|ensureDemoSeed/);
});

test("shared tablet profiles never reactivate a stored raw token", async () => {
  const [session, join, studentApi] = await Promise.all([read("../lib/client-session.ts"), read("../app/components/JoinClient.tsx"), read("../app/api/student/route.ts")]);
  assert.match(session, /sessionStorage\.setItem\(ACTIVE_SESSION_KEY/); assert.match(session, /LEGACY_PROFILES_KEY/); assert.doesNotMatch(session, /function activateProfile/);
  assert.match(join, /switchProfile/); assert.match(join, /picturePassword/); assert.doesNotMatch(join, /activateProfile/);
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
  assert.match(route, /requestId.*nonce.*thumb\.png/s); assert.match(route, /state: "candidate"/); assert.match(route, /state: "committed"/); assert.match(route, /removeCandidates/);
  assert.match(runtime, /PRIMARY KEY\(artwork_id, student_id, request_id\)/);
});

test("duplicate recovery, logout and protected response regressions stay fixed", async () => {
  const [student, teacher, security] = await Promise.all([read("../app/api/student/route.ts"), read("../app/api/teacher/route.ts"), read("../lib/security.ts")]);
  assert.match(student, /\.all<RecoveredStudent>/); assert.match(student, /Promise\.all\(candidates\.results\.map/); assert.match(student, /matches\.length > 1/);
  assert.match(teacher, /revokeTeacherSession/); assert.match(security, /DELETE FROM teacher_sessions/); assert.match(security, /cache-control", "no-store/);
  assert.match(student, /ORDER BY m\.created_at DESC, m\.id DESC LIMIT 50/); assert.match(student, /ORDER BY createdAt ASC, id ASC/); assert.match(student, /INSERT OR IGNORE INTO message_receipts/);
});

test("P1 operational safeguards are wired", async () => {
  const [init, schema, teacherApi, teacherUi, studio] = await Promise.all([read("../scripts/init-local-db.mjs"), read("../db/schema.ts"), read("../app/api/teacher/route.ts"), read("../app/components/TeacherApp.tsx"), read("../app/components/DrawingStudio.tsx")]);
  assert.match(init, /CREATE TABLE IF NOT EXISTS/); assert.match(init, /readdirSync/);
  assert.match(schema, /primaryKey\(\{ columns: \[table\.messageId, table\.studentId\]/); assert.match(schema, /teacherViews/);
  assert.match(teacherApi, /action === "viewStudent"/); assert.match(teacherApi, /action === "resetStudentRecovery"/); assert.match(teacherUi, /복구 카드 재발급/);
  assert.match(studio, /new Map<number/); assert.match(studio, /event\.pointerId/);
});

test("legacy mutation storage upgrades in place and offline saves contain no bearer token", async () => {
  const [runtime, init, incremental, session, studio] = await Promise.all([
    read("../db/runtime.ts"), read("../scripts/init-local-db.mjs"), read("../drizzle/0001_artwork_mutations_composite_pk.sql"), read("../lib/client-session.ts"), read("../app/components/DrawingStudio.tsx"),
  ]);
  assert.match(runtime, /PRAGMA table_info/); assert.match(runtime, /sqlite_master/); assert.match(runtime, /DB\.batch/); assert.match(runtime, /artwork_mutations__composite_pk/);
  assert.match(incremental, /INSERT OR IGNORE INTO `artwork_mutations__composite_pk`/); assert.match(incremental, /PRIMARY KEY\(`artwork_id`, `student_id`, `request_id`\)/);
  assert.match(init, /resolve\(wranglerRoot, "state"\)/); assert.doesNotMatch(init, /state-v2/);
  assert.match(session, /indexedDB\.open\("wiggle-offline-v1", 2\)/); assert.match(session, /delete value\.token/); assert.match(session, /profile\.deviceToken/);
  assert.doesNotMatch(session, /QueuedSave[^\n]+token:/); assert.doesNotMatch(studio, /queueSave\(\{[^}]*token:/s);
});
