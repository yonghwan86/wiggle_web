import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Miniflare } from "miniflare";

const teacherHeaders = {
  origin: "http://localhost",
  "content-type": "application/json",
  "oai-authenticated-user-email": "profile-manager@example.com",
};

function studentHeaders(ip) {
  return { origin: "http://localhost", "content-type": "application/json", "cf-connecting-ip": ip };
}

test("duplicate entry is explicit and teacher deletion safely archives, revokes, and restores a student", async (context) => {
  const miniflare = new Miniflare({
    modules: true,
    modulesRoot: "./dist/server",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    scriptPath: "./dist/server/index.js",
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: `student-profile-management-${randomUUID()}` },
    r2Buckets: ["ARTWORKS"],
  });
  context.after(() => miniflare.dispose());

  const createdClass = await miniflare.dispatchFetch("http://localhost/api/teacher", {
    method: "POST",
    headers: teacherHeaders,
    body: JSON.stringify({ action: "createClassroom", displayName: "중복 점검반" }),
  });
  assert.equal(createdClass.status, 201);
  const classroom = (await createdClass.json()).classroom;

  const joinBody = {
    action: "join",
    entry: classroom.classCode,
    nickname: "토끼화가",
    animal: "🐰",
    picturePassword: ["⭐", "⭐", "⭐"],
  };
  const joined = await miniflare.dispatchFetch("http://localhost/api/student", {
    method: "POST", headers: studentHeaders("203.0.113.101"), body: JSON.stringify(joinBody),
  });
  assert.equal(joined.status, 201);
  const joinedProfile = await joined.json();

  const duplicate = await miniflare.dispatchFetch("http://localhost/api/student", {
    method: "POST", headers: studentHeaders("203.0.113.102"), body: JSON.stringify(joinBody),
  });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), { error: "같은 별명과 동물의 프로필이 이미 있어요.", code: "PROFILE_EXISTS" });

  const DB = await miniflare.getD1Database("DB");
  assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM student_profiles").first()).count, 1);
  await DB.prepare(`INSERT INTO artworks(id, student_id, classroom_id, title, topic, learning_mode) VALUES ('artwork_kept', ?, ?, '보관 그림', '선', 'practice')`)
    .bind(joinedProfile.student.id, classroom.id).run();

  const archived = await miniflare.dispatchFetch("http://localhost/api/teacher", {
    method: "POST",
    headers: teacherHeaders,
    body: JSON.stringify({ action: "archiveStudent", classroomId: classroom.id, studentId: joinedProfile.student.id }),
  });
  assert.equal(archived.status, 200);
  assert.deepEqual(await archived.json(), { archived: true, studentId: joinedProfile.student.id });

  const roomAfterArchive = await miniflare.dispatchFetch(`http://localhost/api/teacher?classroomId=${classroom.id}`, { headers: teacherHeaders });
  assert.equal(roomAfterArchive.status, 200);
  const archivedRoom = await roomAfterArchive.json();
  assert.equal(archivedRoom.students.length, 0);
  assert.equal(archivedRoom.archivedStudents.length, 1);
  assert.equal(archivedRoom.archivedStudents[0].artworkCount, 1);

  const rejectedSession = await miniflare.dispatchFetch("http://localhost/api/student", {
    headers: { authorization: `Bearer ${joinedProfile.deviceToken}` },
  });
  assert.equal(rejectedSession.status, 401);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM artworks WHERE id = 'artwork_kept'").first()).count, 1);
  assert.ok((await DB.prepare("SELECT revoked_at AS revokedAt FROM device_sessions WHERE student_id = ?").bind(joinedProfile.student.id).first()).revokedAt);

  const restored = await miniflare.dispatchFetch("http://localhost/api/teacher", {
    method: "POST",
    headers: teacherHeaders,
    body: JSON.stringify({ action: "restoreStudent", classroomId: classroom.id, studentId: joinedProfile.student.id }),
  });
  assert.equal(restored.status, 200);

  const recovered = await miniflare.dispatchFetch("http://localhost/api/student", {
    method: "POST",
    headers: studentHeaders("203.0.113.103"),
    body: JSON.stringify({ action: "recover", classCode: classroom.classCode, nickname: "토끼화가", animal: "🐰", picturePassword: ["⭐", "⭐", "⭐"] }),
  });
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).student.id, joinedProfile.student.id);

  const explicitlyNew = await miniflare.dispatchFetch("http://localhost/api/student", {
    method: "POST",
    headers: studentHeaders("203.0.113.104"),
    body: JSON.stringify({ ...joinBody, allowDuplicate: true }),
  });
  assert.equal(explicitlyNew.status, 201);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM student_profiles WHERE archived_at IS NULL").first()).count, 2);
});

