import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("declares D1 and R2 and ships a migration", async () => {
  const files = await readdir(new URL("../drizzle/", import.meta.url)); const migrationName = files.find((name) => name.endsWith(".sql")); assert.ok(migrationName);
  const [hosting, migration, snapshot] = await Promise.all([read("../.openai/hosting.json"), read(`../drizzle/${migrationName}`), read("../drizzle/meta/0002_snapshot.json")]);
  const hostingConfig = JSON.parse(hosting);
  assert.equal(hostingConfig.d1, "DB"); assert.equal(hostingConfig.r2, "ARTWORKS");
  for (const table of ["teachers", "classrooms", "student_profiles", "device_sessions", "recovery_credentials", "artworks", "artwork_mutations", "reflections", "teacher_messages", "rate_limits"]) assert.match(migration, new RegExp(`CREATE TABLE .${table}.`));
  assert.match(snapshot, /coaching_event_details/); assert.match(snapshot, /teacher_coaching_drafts/);
});

test("enforces ownership, hashing, expiry, rate limits and idempotent revisions", async () => {
  const [security, artwork, teacher, student] = await Promise.all([read("../lib/security.ts"), read("../app/api/artworks/[id]/route.ts"), read("../app/api/teacher/route.ts"), read("../app/api/student/route.ts")]);
  assert.match(security, /PBKDF2/); assert.match(security, /PBKDF2_ITERATIONS = 100_000/); assert.doesNotMatch(security, /PBKDF2_ITERATIONS = 1[0-9]{2}_001|PBKDF2_ITERATIONS = 120_000/); assert.match(security, /from "node:crypto"/); assert.doesNotMatch(security, /crypto\.subtle|deriveBits/); assert.match(security, /expires_at >/); assert.match(security, /sameOrigin/); assert.match(security, /rateLimits|rate_limits/);
  assert.match(artwork, /student_id = \?/); assert.match(artwork, /REVISION_CONFLICT/); assert.match(artwork, /artwork_mutations/); assert.match(artwork, /ARTWORKS\.put/); assert.match(artwork, /last_mutation_id/);
  assert.match(teacher, /teacher_id = \?/); assert.match(teacher, /student_profiles WHERE id = \? AND classroom_id = \?/); assert.match(student, /picture_hash/); assert.match(student, /personal_qr_hash/);
});

test("keeps canvas contracts and guide data separate", async () => {
  const [model, studio, lessons] = await Promise.all([read("../lib/drawing-model.ts"), read("../app/components/DrawingStudio.tsx"), read("../lib/lesson-content.ts")]);
  assert.match(model, /DOCUMENT_SIZE = 1024/); assert.match(model, /schemaVersion/); assert.match(model, /rendererVersion/); assert.match(model, /clientOpId/); assert.match(model, /STICKER_ALLOWLIST/);
  assert.match(studio, />= 2\.5/); assert.match(studio, /guideRef/); assert.match(studio, /imageData\(canvasRef\.current, 256\)/); assert.match(studio, /imageData\(canvasRef\.current, 1024\)/);
  const stepLists = [...lessons.matchAll(/steps: \[([^\]]+)\]/g)].map((match) => match[1].split("\",").length); assert.ok(stepLists.length >= 5); assert.ok(stepLists.every((count) => count >= 6 && count <= 15));
  assert.match(lessons, /openSteps: \[[^\]]+,\s*[^\]]+\]/); assert.match(lessons, /내 마음대로/);
});

test("offline queue uses IndexedDB and keeps starter files out", async () => {
  const [session, page, layout, pkg] = await Promise.all([read("../lib/client-session.ts"), read("../app/page.tsx"), read("../app/layout.tsx"), read("../package.json")]);
  assert.match(session, /indexedDB\.open/); assert.match(session, /studentId/); assert.match(session, /requestId/); assert.match(session, /status === 409/);
  assert.doesNotMatch(page + layout + pkg, /codex-preview|SkeletonPreview|react-loading-skeleton|Starter Project/);
});
