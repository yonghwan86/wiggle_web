import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { findOwnedCoachingEvent, recordCoachingAfter, recordCoachingBefore } from "../lib/coaching-store.ts";
import { approveTeacherDraftMessage, validateTeacherMessageTarget } from "../lib/teacher-messages.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const document = { schemaVersion: 1, rendererVersion: 1, size: 1024, ops: [] };
const image = { mimeType: "image/png", extension: "png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) };

async function fixture() {
  const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok') } }", compatibilityDate: "2026-05-22", d1Databases: { DB: "mvp2-test" }, r2Buckets: ["ARTWORKS"] });
  const DB = await mf.getD1Database("DB"); const ARTWORKS = await mf.getR2Bucket("ARTWORKS");
  await DB.exec(`
    CREATE TABLE classrooms (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE student_profiles (id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL, archived_at TEXT);
    CREATE TABLE artworks (id TEXT PRIMARY KEY, student_id TEXT NOT NULL, classroom_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'drawing', version_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE artwork_versions (id TEXT PRIMARY KEY, artwork_id TEXT NOT NULL, sequence INTEGER NOT NULL, ops_json TEXT NOT NULL, image_key TEXT, reason TEXT NOT NULL, UNIQUE(artwork_id, sequence));
    CREATE TABLE coaching_events (id TEXT PRIMARY KEY, artwork_id TEXT NOT NULL, actor TEXT NOT NULL, question TEXT NOT NULL, student_answer TEXT, applied_hint TEXT, before_version_id TEXT, after_version_id TEXT);
    CREATE TABLE coaching_event_details (event_id TEXT PRIMARY KEY, response_kind TEXT NOT NULL, choices_json TEXT NOT NULL DEFAULT '[]', guide_steps_json TEXT NOT NULL DEFAULT '[]', new_elements_json TEXT NOT NULL DEFAULT '[]', growth_event TEXT, current_step INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE teacher_messages (id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL, student_id TEXT, teacher_id TEXT NOT NULL, body TEXT NOT NULL);
    CREATE TABLE teacher_coaching_drafts (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, classroom_id TEXT NOT NULL, student_id TEXT NOT NULL, artwork_id TEXT NOT NULL, body TEXT NOT NULL, observation TEXT NOT NULL, next_action TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', approved_message_id TEXT, approved_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO classrooms(id, teacher_id, active) VALUES ('class_a', 'teacher_a', 1), ('class_b', 'teacher_b', 1);
    INSERT INTO student_profiles(id, classroom_id) VALUES ('student_a', 'class_a'), ('student_b', 'class_b');
    INSERT INTO artworks(id, student_id, classroom_id, revision, status, version_count) VALUES ('art_a', 'student_a', 'class_a', 0, 'drawing', 0), ('art_b', 'student_b', 'class_b', 0, 'drawing', 0);
    INSERT INTO coaching_events(id, artwork_id, actor, question) VALUES ('event_q', 'art_a', 'ai', '무엇을 더 그릴까?'), ('event_g1', 'art_a', 'ai', '어떤 순서로 그릴까?'), ('event_g2', 'art_a', 'ai', '어떤 순서로 그릴까?');
    INSERT INTO coaching_event_details(event_id, response_kind, status) VALUES ('event_q', 'question', 'open'), ('event_g1', 'guide', 'active'), ('event_g2', 'guide', 'active');
    INSERT INTO teacher_coaching_drafts(id, teacher_id, classroom_id, student_id, artwork_id, body, observation, next_action, model, status) VALUES ('draft_a', 'teacher_a', 'class_a', 'student_a', 'art_a', '초안', '관찰', '더 그려 봐', 'mock', 'draft');
  `);
  return { mf, DB, ARTWORKS };
}

test("coaching before atomically stores image, version, event and details without conflict pollution", async () => {
  const { mf, DB, ARTWORKS } = await fixture();
  try {
    const base = {
      DB, ARTWORKS, studentId: "student_a", artworkId: "art_a", expectedRevision: 0,
      responseKind: "question", document, image, question: "무엇을 더 그릴까?", hint: "작은 나무를 더 그려 봐.",
      choices: [{ emoji: "🌳", label: "나무", answer: "나무를 더해요" }], guideSteps: [], growthEvent: "새 대상을 고르려고 했어요.", currentStep: 1,
    };
    const saved = await recordCoachingBefore({ ...base, eventId: "coaching_before_one" });
    assert.equal(saved.ok, true);
    const stored = await DB.prepare(`SELECT e.id, e.before_version_id AS beforeVersionId, v.reason, v.image_key AS imageKey, d.response_kind AS responseKind, d.status
      FROM coaching_events e JOIN artwork_versions v ON v.id = e.before_version_id JOIN coaching_event_details d ON d.event_id = e.id WHERE e.id = 'coaching_before_one'`).first();
    assert.deepEqual({ id: stored.id, beforeVersionId: stored.beforeVersionId, reason: stored.reason, responseKind: stored.responseKind, status: stored.status }, {
      id: "coaching_before_one", beforeVersionId: saved.beforeVersionId, reason: "coaching_before", responseKind: "question", status: "open",
    });
    const firstObjects = await ARTWORKS.list(); assert.equal(firstObjects.objects.length, 1);
    assert.equal((await ARTWORKS.head(stored.imageKey)).customMetadata.phase, "before");

    const conflicted = await recordCoachingBefore({ ...base, eventId: "coaching_wrong_revision", expectedRevision: 9 });
    const idor = await recordCoachingBefore({ ...base, eventId: "coaching_idor", studentId: "student_b" });
    const collisionIdor = await recordCoachingBefore({ ...base, eventId: "coaching_before_one", artworkId: "art_b", studentId: "student_b" });
    const duplicate = await recordCoachingBefore({ ...base, eventId: "coaching_before_one" });
    assert.equal(conflicted.reason, "revision_conflict"); assert.equal(idor.reason, "not_found"); assert.equal(collisionIdor.reason, "not_found"); assert.equal(duplicate.reason, "already_recorded");
    assert.equal((await ARTWORKS.list()).objects.length, 1);

    const simultaneous = await Promise.all([
      recordCoachingBefore({ ...base, eventId: "coaching_same_request" }),
      recordCoachingBefore({ ...base, eventId: "coaching_same_request" }),
    ]);
    assert.equal(simultaneous.filter((result) => result.ok).length, 1);
    assert.equal(simultaneous.filter((result) => !result.ok && result.reason === "already_recorded").length, 1);
    assert.equal((await ARTWORKS.list()).objects.length, 2);

    await DB.prepare("DROP TABLE coaching_event_details").run();
    const beforeFailureObjects = (await ARTWORKS.list()).objects.length;
    const failed = await recordCoachingBefore({ ...base, eventId: "coaching_db_failure" });
    assert.equal(failed.reason, "save_failed"); assert.equal((await ARTWORKS.list()).objects.length, beforeFailureObjects);
    assert.equal(await DB.prepare("SELECT id FROM coaching_events WHERE id = 'coaching_db_failure'").first(), null);
  } finally { await mf.dispose(); }
});

test("coaching after versions enforce ownership and duplicate CAS for answers and guide exits", async () => {
  const { mf, DB, ARTWORKS } = await fixture();
  try {
    assert.equal(await findOwnedCoachingEvent(DB, "event_q", "art_a", "student_b"), null);
    const input = { DB, ARTWORKS, studentId: "student_a", artworkId: "art_a", eventId: "event_q", kind: "question_answer", document, image, currentStep: 2, answer: "토끼를 더했어요", newElements: ["토끼"] };
    const concurrent = await Promise.all([recordCoachingAfter(input), recordCoachingAfter(input)]);
    assert.equal(concurrent.filter((result) => result.ok).length, 1);
    assert.equal(concurrent.filter((result) => !result.ok && result.reason === "already_recorded").length, 1);
    const question = await DB.prepare("SELECT after_version_id AS afterVersionId FROM coaching_events WHERE id = 'event_q'").first();
    const questionDetail = await DB.prepare("SELECT status FROM coaching_event_details WHERE event_id = 'event_q'").first();
    assert.ok(question.afterVersionId); assert.equal(questionDetail.status, "answered");

    const completed = await recordCoachingAfter({ ...input, eventId: "event_g1", kind: "guide_completed", answer: undefined, newElements: [] });
    const exited = await recordCoachingAfter({ ...input, eventId: "event_g2", kind: "guide_free_exit", answer: undefined, newElements: [] });
    assert.equal(completed.ok, true); assert.equal(exited.ok, true);
    const guideStates = await DB.prepare("SELECT event_id AS eventId, status FROM coaching_event_details WHERE event_id IN ('event_g1','event_g2') ORDER BY event_id").all();
    assert.deepEqual(guideStates.results, [{ eventId: "event_g1", status: "completed" }, { eventId: "event_g2", status: "dismissed" }]);
    const versions = await DB.prepare("SELECT COUNT(*) AS count FROM artwork_versions WHERE artwork_id = 'art_a' AND reason = 'coaching_after'").first();
    assert.equal(versions.count, 3); assert.equal((await ARTWORKS.list()).objects.length, 3);
  } finally { await mf.dispose(); }
});

test("teacher message helper rechecks class/student ownership and approves a draft once", async () => {
  const { mf, DB } = await fixture();
  try {
    assert.equal((await validateTeacherMessageTarget(DB, { teacherId: "teacher_b", classroomId: "class_a", studentId: "student_a", body: "도움말" })).reason, "classroom_forbidden");
    assert.equal((await validateTeacherMessageTarget(DB, { teacherId: "teacher_a", classroomId: "class_a", studentId: "student_b", body: "도움말" })).reason, "student_forbidden");
    assert.equal((await approveTeacherDraftMessage(DB, { teacherId: "teacher_b", classroomId: "class_a", draftId: "draft_a", body: "나무 옆에 새 선을 더 그려 봐." })).reason, "not_found");
    const approvals = await Promise.all([
      approveTeacherDraftMessage(DB, { teacherId: "teacher_a", classroomId: "class_a", draftId: "draft_a", body: "나무 옆에 새 선을 더 그려 봐." }),
      approveTeacherDraftMessage(DB, { teacherId: "teacher_a", classroomId: "class_a", draftId: "draft_a", body: "나무 옆에 새 선을 더 그려 봐." }),
    ]);
    assert.equal(approvals.filter((result) => result.ok).length, 1);
    assert.equal(approvals.filter((result) => !result.ok && result.reason === "already_handled").length, 1);
    const messages = await DB.prepare("SELECT classroom_id AS classroomId, student_id AS studentId, teacher_id AS teacherId, body FROM teacher_messages").all();
    assert.deepEqual(messages.results, [{ classroomId: "class_a", studentId: "student_a", teacherId: "teacher_a", body: "나무 옆에 새 선을 더 그려 봐." }]);
  } finally { await mf.dispose(); }
});

test("student and teacher routes keep authentication and IDOR checks ahead of mutation", async () => {
  const [student, teacher, draft] = await Promise.all([read("../app/api/ai/coaching/route.ts"), read("../app/api/teacher/route.ts"), read("../app/api/ai/teacher-draft/route.ts")]);
  assert.match(student, /if \(!student\).*401/); assert.match(student, /ownedArtwork\(artworkId, student\.id\)/); assert.match(student, /findOwnedCoachingEvent/);
  assert.match(teacher, /if \(!teacher\).*401/); assert.match(teacher, /ownedClassroom\(teacher\.id, classroomId\)/); assert.match(teacher, /validateTeacherMessageTarget/);
  assert.match(draft, /if \(!teacher\).*401/); assert.match(draft, /ownedArtwork\(teacher\.id, classroomId, studentId, artworkId\)/); assert.match(draft, /approveTeacherDraftMessage/);
});
