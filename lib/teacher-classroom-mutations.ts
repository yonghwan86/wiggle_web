export async function updateClassroomAdmission(DB: D1Database, input: { teacherId: string; classroomId: string; open: boolean }) {
  const result = await DB.prepare(`UPDATE classrooms SET admission_open = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND teacher_id = ? AND active = 1`)
    .bind(input.open ? 1 : 0, input.classroomId, input.teacherId).run();
  return Boolean(result.meta.changes);
}

export async function rotateClassroomEntry(DB: D1Database, input: { teacherId: string; classroomId: string; classCode: string; joinToken: string }) {
  const result = await DB.prepare(`UPDATE classrooms SET class_code = ?, join_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND teacher_id = ? AND active = 1`)
    .bind(input.classCode, input.joinToken, input.classroomId, input.teacherId).run();
  return Boolean(result.meta.changes);
}

export async function updateClassroomActivity(DB: D1Database, input: { teacherId: string; classroomId: string; activity: string }) {
  const result = await DB.prepare(`UPDATE classrooms SET current_activity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND teacher_id = ? AND active = 1`)
    .bind(input.activity, input.classroomId, input.teacherId).run();
  return Boolean(result.meta.changes);
}

export async function upsertTeacherView(DB: D1Database, input: { teacherId: string; classroomId: string; studentId: string; expiresAt: string }) {
  const result = await DB.prepare(`INSERT INTO teacher_views(teacher_id, classroom_id, student_id, expires_at, updated_at)
    SELECT ?, c.id, s.id, ?, CURRENT_TIMESTAMP
    FROM classrooms c JOIN student_profiles s ON s.classroom_id = c.id
    WHERE c.id = ? AND c.teacher_id = ? AND c.active = 1 AND s.id = ? AND s.archived_at IS NULL
    ON CONFLICT(teacher_id, student_id) DO UPDATE SET classroom_id = excluded.classroom_id, expires_at = excluded.expires_at, updated_at = CURRENT_TIMESTAMP`)
    .bind(input.teacherId, input.expiresAt, input.classroomId, input.teacherId, input.studentId).run();
  return Boolean(result.meta.changes);
}

export async function resetActiveStudentRecovery(DB: D1Database, input: { teacherId: string; classroomId: string; studentId: string; personalQrHash: string }) {
  const activeStudent = `EXISTS (SELECT 1 FROM student_profiles s JOIN classrooms c ON c.id = s.classroom_id WHERE s.id = ? AND s.classroom_id = ? AND s.archived_at IS NULL AND c.teacher_id = ? AND c.active = 1)`;
  const results = await DB.batch([
    DB.prepare(`UPDATE recovery_credentials SET personal_qr_hash = ?, reset_at = CURRENT_TIMESTAMP WHERE student_id = ? AND ${activeStudent}`)
      .bind(input.personalQrHash, input.studentId, input.studentId, input.classroomId, input.teacherId),
    DB.prepare(`UPDATE device_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE student_id = ? AND revoked_at IS NULL AND ${activeStudent}`)
      .bind(input.studentId, input.studentId, input.classroomId, input.teacherId),
  ]);
  return Boolean(results[0]?.meta.changes);
}
