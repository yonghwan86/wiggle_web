import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { resetActiveStudentRecovery, rotateClassroomEntry, updateClassroomActivity, updateClassroomAdmission, upsertTeacherView } from "../lib/teacher-classroom-mutations.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("teacher classroom cards separate navigation from the accessible delete action", async () => {
  const [teacher, css] = await Promise.all([read("../app/components/TeacherApp.tsx"), read("../app/globals.css")]);
  const start = teacher.indexOf("function ClassroomCard");
  const end = teacher.indexOf("function TeacherActivitySelect");
  const card = teacher.slice(start, end);
  const link = card.match(/<a className="class-card-link"[\s\S]*?<\/a>/)?.[0] ?? "";

  assert.ok(start >= 0 && end > start);
  assert.match(card, /<article className="class-card">/);
  assert.match(link, /학급 자세히 보기/);
  assert.doesNotMatch(link, /<button/);
  assert.match(card, /<button type="button" className="class-delete-button"/);
  assert.match(card, /aria-label=\{`\$\{item\.displayName\} 학급 삭제`\}/);
  assert.match(teacher, /item\.displayName/);
  assert.match(teacher, /학생 \$\{item\.studentCount\}명/);
  assert.match(teacher, /목록에서 삭제되고 학생 입장과 기존 로그인, 가족 공유가 즉시 종료됩니다/);
  assert.match(teacher, /내부 데이터는 복구를 위해 안전하게 보관됩니다/);
  assert.match(teacher, /await teacherPost\(\{ action: "deleteClassroom", classroomId: item\.id \}\); await load\(\)/);
  assert.match(css, /\.class-delete-button \{[^}]*min-height:44px;[^}]*white-space:normal;[^}]*overflow-wrap:break-word;/);
});

test("deleteClassroom is owner-guarded and soft-deactivates every access surface without deleting data", async () => {
  const [route, security] = await Promise.all([read("../app/api/teacher/route.ts"), read("../lib/security.ts")]);
  const deleteStart = route.indexOf('if (action === "deleteClassroom")');
  const deleteEnd = route.indexOf('if (action === "createFamilyShare")', deleteStart);
  const block = route.slice(deleteStart, deleteEnd);

  assert.ok(route.indexOf("if (!sameOrigin(request))") < deleteStart);
  assert.ok(route.indexOf("const teacher = await requireTeacher()") < deleteStart);
  assert.ok(route.indexOf("const classroom = await ownedClassroom(teacher.id, classroomId)") < deleteStart);
  assert.match(route, /FROM classrooms WHERE id = \? AND teacher_id = \? AND active = 1/);
  assert.match(block, /await db\.batch\(\[/);
  assert.match(block, /UPDATE classrooms SET active = 0, admission_open = 0[^`]*WHERE id = \? AND teacher_id = \? AND active = 1/);
  assert.match(block, /UPDATE device_sessions SET revoked_at = CURRENT_TIMESTAMP[^`]*student_profiles WHERE classroom_id = \?/);
  assert.match(block, /UPDATE family_share_links SET revoked_at = CURRENT_TIMESTAMP[^`]*teacher_id = \?[^`]*student_profiles WHERE classroom_id = \?/);
  assert.match(block, /DELETE FROM teacher_views WHERE classroom_id = \?/);
  assert.doesNotMatch(block, /DELETE FROM classrooms|DELETE FROM student_profiles|DELETE FROM artworks|ARTWORKS\.delete/);
  assert.match(route, /c\.active = 1/);
  assert.match(security, /JOIN classrooms c ON c\.id = s\.classroom_id AND c\.active = 1/);
});

test("every post-delete teacher mutation rechecks active ownership at its SQL boundary", async () => {
  const [route, mutations, familySharing] = await Promise.all([
    read("../app/api/teacher/route.ts"),
    read("../lib/teacher-classroom-mutations.ts"),
    read("../lib/family-sharing.ts"),
  ]);

  assert.equal((mutations.match(/UPDATE classrooms SET/g) ?? []).length, 3);
  assert.equal((mutations.match(/WHERE id = \? AND teacher_id = \? AND active = 1/g) ?? []).length, 3);
  assert.match(mutations, /INSERT INTO teacher_views[\s\S]*FROM classrooms c JOIN student_profiles s ON s\.classroom_id = c\.id[\s\S]*c\.teacher_id = \? AND c\.active = 1 AND s\.id = \?/);
  assert.equal((mutations.match(/c\.teacher_id = \? AND c\.active = 1/g) ?? []).length, 2);
  assert.equal((mutations.match(/\$\{activeStudent\}/g) ?? []).length, 2);
  assert.match(route, /updateClassroomAdmission[\s\S]*if \(!updated\) return jsonError\("활성 학급을 다시 확인해 주세요\.", 403\)/);
  assert.match(route, /rotateClassroomEntry[\s\S]*if \(!updated\) return jsonError\("활성 학급을 다시 확인해 주세요\.", 403\)/);
  assert.match(route, /updateClassroomActivity[\s\S]*if \(!updated\) return jsonError\("활성 학급을 다시 확인해 주세요\.", 403\)/);
  assert.match(route, /upsertTeacherView[\s\S]*if \(!viewed\) return jsonError\("활성 학급의 학생을 다시 확인해 주세요\.", 403\)/);
  assert.match(route, /resetActiveStudentRecovery[\s\S]*if \(!reset\) return jsonError\("활성 학급의 학생을 다시 확인해 주세요\.", 403\)/);
  assert.match(familySharing, /revokeFamilyShare[\s\S]*c\.teacher_id = \? AND c\.active = 1/);
});

test("a committed delete prevents stale teacher actions from changing class state or recreating views", async (context) => {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    compatibilityDate: "2026-05-22",
    d1Databases: { DB: `teacher-delete-boundary-${randomUUID()}` },
  });
  context.after(() => miniflare.dispose());
  const DB = await miniflare.getD1Database("DB");
  await DB.exec(`
    CREATE TABLE classrooms (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, admission_open INTEGER NOT NULL DEFAULT 1, class_code TEXT NOT NULL, join_token TEXT NOT NULL, current_activity TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE student_profiles (id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL);
    CREATE TABLE teacher_views (teacher_id TEXT NOT NULL, classroom_id TEXT NOT NULL, student_id TEXT NOT NULL, expires_at TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(teacher_id, student_id));
    CREATE TABLE recovery_credentials (student_id TEXT PRIMARY KEY, personal_qr_hash TEXT NOT NULL, reset_at TEXT);
    CREATE TABLE device_sessions (token_hash TEXT PRIMARY KEY, student_id TEXT NOT NULL, revoked_at TEXT);
    INSERT INTO classrooms(id, teacher_id, active, admission_open, class_code, join_token, current_activity) VALUES ('class_a', 'teacher_a', 1, 1, '1234', 'join_old', 'free');
    INSERT INTO student_profiles(id, classroom_id) VALUES ('student_a', 'class_a');
    INSERT INTO recovery_credentials(student_id, personal_qr_hash) VALUES ('student_a', 'qr_old');
    INSERT INTO device_sessions(token_hash, student_id) VALUES ('session_old', 'student_a');
  `);

  assert.equal(await upsertTeacherView(DB, { teacherId: "teacher_a", classroomId: "class_a", studentId: "student_a", expiresAt: "2099-01-01T00:00:00.000Z" }), true);
  assert.equal(await resetActiveStudentRecovery(DB, { teacherId: "teacher_a", classroomId: "class_a", studentId: "student_a", personalQrHash: "qr_active" }), true);
  await DB.batch([
    DB.prepare("UPDATE recovery_credentials SET personal_qr_hash = 'qr_old', reset_at = NULL WHERE student_id = 'student_a'"),
    DB.prepare("UPDATE device_sessions SET revoked_at = NULL WHERE student_id = 'student_a'"),
  ]);
  await DB.batch([
    DB.prepare("UPDATE classrooms SET active = 0, admission_open = 0 WHERE id = 'class_a' AND teacher_id = 'teacher_a' AND active = 1"),
    DB.prepare("UPDATE device_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE student_id = 'student_a'"),
    DB.prepare("DELETE FROM teacher_views WHERE classroom_id = 'class_a'"),
  ]);

  assert.equal(await updateClassroomAdmission(DB, { teacherId: "teacher_a", classroomId: "class_a", open: true }), false);
  assert.equal(await rotateClassroomEntry(DB, { teacherId: "teacher_a", classroomId: "class_a", classCode: "9876", joinToken: "join_new" }), false);
  assert.equal(await updateClassroomActivity(DB, { teacherId: "teacher_a", classroomId: "class_a", activity: "practice_line" }), false);
  assert.equal(await upsertTeacherView(DB, { teacherId: "teacher_a", classroomId: "class_a", studentId: "student_a", expiresAt: "2099-02-01T00:00:00.000Z" }), false);
  assert.equal(await resetActiveStudentRecovery(DB, { teacherId: "teacher_a", classroomId: "class_a", studentId: "student_a", personalQrHash: "qr_new" }), false);

  const classroom = await DB.prepare("SELECT active, admission_open AS admissionOpen, class_code AS classCode, join_token AS joinToken, current_activity AS currentActivity FROM classrooms WHERE id = 'class_a'").first();
  assert.deepEqual(classroom, { active: 0, admissionOpen: 0, classCode: "1234", joinToken: "join_old", currentActivity: "free" });
  assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM teacher_views").first()).count, 0);
  assert.equal((await DB.prepare("SELECT personal_qr_hash AS personalQrHash FROM recovery_credentials WHERE student_id = 'student_a'").first()).personalQrHash, "qr_old");
});
