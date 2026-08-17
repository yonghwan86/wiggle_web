import { bindings, ensureSchema } from "@/db/runtime";
import { deriveSecret, id, randomToken, sha256, verifySecret } from "@/lib/security";

type LocalTeacher = { id: string; email: string; displayName: string };

export async function ensureLocalAutoTeacher(): Promise<LocalTeacher> {
  await ensureSchema();
  const db = bindings().DB;
  const existing = await db.prepare(
    `SELECT t.id, t.email, t.display_name AS displayName
       FROM teachers t
      ORDER BY (SELECT MAX(s.last_used_at) FROM teacher_sessions s WHERE s.teacher_id = t.id) DESC,
               (SELECT COUNT(*) FROM classrooms c WHERE c.teacher_id = t.id AND c.active = 1) DESC,
               t.id ASC
      LIMIT 1`,
  ).first<LocalTeacher>();
  if (existing) return existing;

  const teacherId = id("teacher");
  const teacher = { id: teacherId, email: `${teacherId}@localhost.invalid`, displayName: "로컬 선생님" };
  await db.prepare(
    `INSERT INTO teachers(id, email, display_name, credential_hash, credential_salt) VALUES (?, ?, ?, '', '')`,
  ).bind(teacher.id, teacher.email, teacher.displayName).run();
  return teacher;
}

export async function ensureLocalTeacher(email: string, pin: string, displayName: string) {
  await ensureSchema();
  const db = bindings().DB;
  const found = await db.prepare(`SELECT id, credential_hash AS credentialHash, credential_salt AS credentialSalt FROM teachers WHERE email = ?`).bind(email).first<{ id: string; credentialHash: string | null; credentialSalt: string | null }>();
  if (found) {
    if (!found.credentialHash || !found.credentialSalt || !(await verifySecret(pin, found.credentialSalt, found.credentialHash))) return null;
    return found.id;
  }

  const teacherId = id("teacher");
  const salt = randomToken(16);
  const credentialHash = await deriveSecret(pin, salt);
  const classroomId = id("class");
  const classCode = String(1000 + Math.floor(Math.random() * 9000));
  await db.batch([
    db.prepare(`INSERT INTO teachers(id, email, display_name, credential_hash, credential_salt) VALUES (?, ?, ?, ?, ?)`).bind(teacherId, email, displayName, credentialHash, salt),
    db.prepare(`INSERT INTO classrooms(id, teacher_id, display_name, class_code, join_token, admission_open, active, current_activity) VALUES (?, ?, ?, ?, ?, 1, 1, ?)`).bind(classroomId, teacherId, "로컬 연습반", classCode, randomToken(18), "자유롭게 그리기"),
  ]);
  return teacherId;
}

export async function issueTeacherSession(teacherId: string) {
  const token = randomToken(32);
  const now = new Date();
  const expires = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  await bindings().DB.prepare(`INSERT INTO teacher_sessions(token_hash, teacher_id, expires_at, last_used_at) VALUES (?, ?, ?, ?)`).bind(await sha256(token), teacherId, expires.toISOString(), now.toISOString()).run();
  return { token, expires };
}
