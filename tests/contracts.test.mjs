import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const compactSource = (text) => text.replace(/\s+/g, " ");

test("binds DB and ARTWORKS through host-neutral adapters and ships a migration", async () => {
  const files = await readdir(new URL("../drizzle/", import.meta.url)); const migrationName = files.find((name) => name.endsWith(".sql")); assert.ok(migrationName);
  const [runtime, tursoAdapter, storeAdapter, migration, snapshot] = await Promise.all([read("../db/runtime.ts"), read("../db/adapters/turso-d1.ts"), read("../db/adapters/artworks-store.ts"), read(`../drizzle/${migrationName}`), read("../drizzle/meta/0002_snapshot.json")]);
  // 관문은 db/runtime.ts 하나다. 호출부는 D1Database/R2Bucket 표면만 알고, 실제 구현은 어댑터가 갈아 끼운다.
  assert.match(runtime, /DB: createTursoD1\(\)/); assert.match(runtime, /ARTWORKS: createArtworksStore\(\)/);
  assert.doesNotMatch(runtime, /cloudflare:workers/);
  // 운영에서 자격증명이 비면 조용히 로컬 폴백으로 굴러가지 않고 죽어야 한다.
  assert.match(tursoAdapter, /TURSO_DATABASE_URL이 설정되지 않았어요/); assert.match(storeAdapter, /R2 S3 자격증명\(R2_S3_\*\)이 설정되지 않았어요/);
  // D1이 보장하던 계약: batch는 한 트랜잭션, meta.changes는 문장별 영향 행 수.
  assert.match(tursoAdapter, /client\.batch\([\s\S]*"write"/); assert.match(tursoAdapter, /changes: resultSet\.rowsAffected/);
  for (const table of ["teachers", "classrooms", "student_profiles", "device_sessions", "recovery_credentials", "artworks", "artwork_mutations", "reflections", "teacher_messages", "rate_limits"]) assert.match(migration, new RegExp(`CREATE TABLE .${table}.`));
  assert.match(snapshot, /coaching_event_details/); assert.match(snapshot, /teacher_coaching_drafts/);
});

test("enforces ownership, hashing, expiry, rate limits and idempotent revisions", async () => {
  const [security, rateLimitModule, artwork, artworkImage, teacher, student, archive] = await Promise.all([read("../lib/security.ts"), read("../lib/rate-limit.ts"), read("../app/api/artworks/[id]/route.ts"), read("../app/api/artworks/[id]/image/route.ts"), read("../app/api/teacher/route.ts"), read("../app/api/student/route.ts"), read("../app/components/Archive.tsx")]);
  assert.match(security, /PBKDF2/); assert.match(security, /PBKDF2_ITERATIONS = 100_000/); assert.doesNotMatch(security, /PBKDF2_ITERATIONS = 1[0-9]{2}_001|PBKDF2_ITERATIONS = 120_000/); assert.match(security, /from "node:crypto"/); assert.doesNotMatch(security, /crypto\.subtle|deriveBits/); assert.match(security, /expires_at >/); assert.match(security, /sameOrigin/); assert.match(security, /rateLimit/);
  // 시도 계수는 한 문장 안에서 검사와 증가를 함께 해야 동시 요청이 상한을 넘지 못한다.
  assert.match(rateLimitModule, /rate_limits/); assert.match(rateLimitModule, /ON CONFLICT\(key\) DO UPDATE[\s\S]*RETURNING count/);
  assert.doesNotMatch(rateLimitModule, /SELECT count[\s\S]*prepare\(`UPDATE rate_limits SET count = count \+ 1/);
  assert.match(artwork, /student_id = \?/); assert.match(artwork, /REVISION_CONFLICT/); assert.match(artwork, /artwork_mutations/); assert.match(artwork, /ARTWORKS\.put/); assert.match(artwork, /last_mutation_id/);
  assert.match(artworkImage, /studentFromRequest/); assert.match(artworkImage, /WHERE id = \? AND student_id = \?/); assert.match(artworkImage, /ARTWORKS\.get/); assert.match(artworkImage, /private, no-store/);
  assert.match(student, /AS hasImage/); assert.match(archive, /studentFetch\(`\/api\/artworks\/\$\{encodeURIComponent\(artwork\.id\)\}\/image`/); assert.match(archive, /URL\.revokeObjectURL/);
  assert.match(teacher, /teacher_id = \?/); assert.match(teacher, /student_profiles WHERE id = \? AND classroom_id = \?/); assert.match(student, /picture_hash/); assert.match(student, /personal_qr_hash/);
});

test("keeps canvas contracts and guide data separate", async () => {
  const [model, studioRaw, lessons, css, catalog] = await Promise.all([read("../lib/drawing-model.ts"), read("../app/components/DrawingStudio.tsx"), read("../lib/lesson-content.ts"), read("../app/globals.css"), import("../lib/lesson-content.ts")]);
  const studio = compactSource(studioRaw);
  assert.match(model, /DOCUMENT_SIZE = 1024/); assert.match(model, /schemaVersion/); assert.match(model, /rendererVersion/); assert.match(model, /clientOpId/); assert.match(model, /STICKER_ALLOWLIST/);
  // 썸네일·완성 PNG는 문서 기반(documentImage), 그리미 전송 이미지는 화면 기반(imageData 1024).
  assert.match(studio, />= 2\.5/); assert.match(studio, /guideRef/); assert.match(studio, /documentImage\([^)]+, 256\)/); assert.match(studio, /imageData\(canvasRef\.current, 1024\)/);
  assert.match(studio, /strokeStyle = "#087EA8"[\s\S]*globalAlpha = 0\.92[\s\S]*lineWidth = 9[\s\S]*setLineDash\(\[20, 14\]\)/);
  assert.match(studio, /item\.step === lessonStep \+ 1/); assert.doesNotMatch(studio, /item\.step <= lessonStep \+ 1/);
  assert.match(studio, /<canvas\s+ref=\{guideRef\}[\s\S]*<canvas\s+ref=\{canvasRef\}/);
  assert.match(css, /\.draw-canvas \{ z-index:2; touch-action:none; \}\.guide-canvas \{ z-index:3; pointer-events:none; \}/);
  assert.ok(catalog.LESSONS.length >= 5); assert.ok(catalog.LESSONS.every((lesson) => lesson.steps.length >= 6 && lesson.steps.length <= 15));
  for (const mode of ["practice", "guided", "observe"]) {
    const modeLessons = catalog.LESSONS.filter((lesson) => lesson.mode === mode);
    assert.equal(modeLessons.length, 10, mode);
    assert.ok(modeLessons.every((lesson) => lesson.guide.some((mark) => mark.step === 1)), `${mode} first-step guides`);
    assert.ok(modeLessons.every((lesson) => !lesson.guide.some((mark) => mark.step === lesson.steps.length)), `${mode} final free steps have no guide`);
  }
  assert.match(studio, /function guideControls\(\) \{[\s\S]*if \(!lessonGuideAvailable\) return null;[\s\S]*className="guide-demo-button"/);
  assert.match(studio, /function advanceOrCompleteLessonStep\(skip = false\)[\s\S]*!skip && !currentLessonStepStatus\.ready[\s\S]*setReflectionOpen\(true\)/);
  // 고학년 전환에서 마지막 단계 라벨을 "그림 다 그렸어요"→"완성하기"로 중립화했다.
  assert.match(studio, /step === lesson\.steps\.length - 1 \? "완성하기" : "다음"/);
  assert.ok(catalog.LESSONS.every((lesson) => lesson.steps.filter((step) => step.choices?.length >= 2).length >= 2)); assert.match(lessons, /내 마음대로/);
});

test("offline queue uses IndexedDB and keeps starter files out", async () => {
  const [session, page, layout, pkg] = await Promise.all([read("../lib/client-session.ts"), read("../app/page.tsx"), read("../app/layout.tsx"), read("../package.json")]);
  assert.match(session, /indexedDB\.open/); assert.match(session, /studentId/); assert.match(session, /requestId/); assert.match(session, /status === 409/);
  assert.doesNotMatch(page + layout + pkg, /codex-preview|SkeletonPreview|react-loading-skeleton|Starter Project/);
});
