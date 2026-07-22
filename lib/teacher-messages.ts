export type TeacherMessageTarget = {
  teacherId: string;
  classroomId: string;
  studentId: string | null;
  body: string;
  messageId: string;
};

export type TeacherMessageValidation =
  | { ok: true; target: TeacherMessageTarget }
  | { ok: false; reason: "empty_body" | "classroom_forbidden" | "student_forbidden" };

function cleanMessage(value: unknown) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

function messageId() {
  return `message_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export async function validateTeacherMessageTarget(DB: D1Database, input: {
  teacherId: string;
  classroomId: string;
  studentId?: string | null;
  body: unknown;
  messageId?: string;
}): Promise<TeacherMessageValidation> {
  const body = cleanMessage(input.body);
  if (!body) return { ok: false, reason: "empty_body" };
  const classroom = await DB.prepare(`SELECT id FROM classrooms WHERE id = ? AND teacher_id = ? AND active = 1`).bind(input.classroomId, input.teacherId).first();
  if (!classroom) return { ok: false, reason: "classroom_forbidden" };
  const studentId = input.studentId || null;
  if (studentId) {
    const student = await DB.prepare(`SELECT id FROM student_profiles WHERE id = ? AND classroom_id = ?`).bind(studentId, input.classroomId).first();
    if (!student) return { ok: false, reason: "student_forbidden" };
  }
  return { ok: true, target: { teacherId: input.teacherId, classroomId: input.classroomId, studentId, body, messageId: input.messageId ?? messageId() } };
}

export function prepareTeacherMessageInsert(DB: D1Database, target: TeacherMessageTarget, draftGuard?: { draftId: string }) {
  const draftClause = draftGuard
    ? `AND EXISTS (SELECT 1 FROM teacher_coaching_drafts d WHERE d.id = ? AND d.teacher_id = ? AND d.classroom_id = ? AND d.student_id = ? AND d.status = 'approved' AND d.approved_message_id = ?)`
    : "";
  const statement = DB.prepare(`INSERT INTO teacher_messages(id, classroom_id, student_id, teacher_id, body)
    SELECT ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM classrooms c WHERE c.id = ? AND c.teacher_id = ? AND c.active = 1)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM student_profiles s WHERE s.id = ? AND s.classroom_id = ?))
      ${draftClause}`);
  const values: unknown[] = [
    target.messageId, target.classroomId, target.studentId, target.teacherId, target.body,
    target.classroomId, target.teacherId, target.studentId, target.studentId, target.classroomId,
  ];
  if (draftGuard) values.push(draftGuard.draftId, target.teacherId, target.classroomId, target.studentId, target.messageId);
  return statement.bind(...values);
}

export async function approveTeacherDraftMessage(DB: D1Database, input: { teacherId: string; classroomId: string; draftId: string; body: unknown }) {
  const draft = await DB.prepare(`SELECT d.id, d.student_id AS studentId, d.status, d.approved_message_id AS approvedMessageId
    FROM teacher_coaching_drafts d
    JOIN classrooms c ON c.id = d.classroom_id AND c.teacher_id = d.teacher_id AND c.active = 1
    JOIN student_profiles s ON s.id = d.student_id AND s.classroom_id = d.classroom_id
    JOIN artworks a ON a.id = d.artwork_id AND a.student_id = d.student_id AND a.classroom_id = d.classroom_id
    WHERE d.id = ? AND d.teacher_id = ? AND d.classroom_id = ? AND c.teacher_id = ?`)
    .bind(input.draftId, input.teacherId, input.classroomId, input.teacherId)
    .first<{ id: string; studentId: string; status: string; approvedMessageId: string | null }>();
  if (!draft) return { ok: false as const, reason: "not_found" as const };
  if (draft.status !== "draft" || draft.approvedMessageId) return { ok: false as const, reason: "already_handled" as const };
  const validated = await validateTeacherMessageTarget(DB, { teacherId: input.teacherId, classroomId: input.classroomId, studentId: draft.studentId, body: input.body });
  if (!validated.ok) return { ok: false as const, reason: validated.reason };
  try {
    const results = await DB.batch([
      DB.prepare(`UPDATE teacher_coaching_drafts SET body = ?, status = 'approved', approved_message_id = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND teacher_id = ? AND classroom_id = ? AND status = 'draft'
        AND EXISTS (SELECT 1 FROM classrooms c JOIN student_profiles s ON s.classroom_id = c.id JOIN artworks a ON a.classroom_id = c.id AND a.student_id = s.id
          WHERE c.id = teacher_coaching_drafts.classroom_id AND c.teacher_id = teacher_coaching_drafts.teacher_id AND c.active = 1
            AND s.id = teacher_coaching_drafts.student_id AND a.id = teacher_coaching_drafts.artwork_id)`)
        .bind(validated.target.body, validated.target.messageId, input.draftId, input.teacherId, input.classroomId),
      prepareTeacherMessageInsert(DB, validated.target, { draftId: input.draftId }),
    ]);
    if (!results[0]?.meta.changes || !results[1]?.meta.changes) return { ok: false as const, reason: "already_handled" as const };
    return { ok: true as const, messageId: validated.target.messageId };
  } catch {
    return { ok: false as const, reason: "save_failed" as const };
  }
}
