import { bindings, ensureSchema } from "@/db/runtime";
import { cleanText, deriveSecret, id, jsonError, noStoreJson, normalizePicturePassword, picturePasswordLength, randomToken, rateLimit, sameOrigin, sha256, studentFromRequest, verifySecret } from "@/lib/security";
import { activityLabel, normalizeActivityKey } from "@/lib/lesson-content";

type RecoveredStudent = { id: string; nickname: string; animal: string; classroomName: string; pictureHash: string; pictureSalt: string };

async function prepareDeviceSession() {
  const token = randomToken(32); const now = new Date();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const tokenHash = await sha256(token);
  const lastUsedAt = now.toISOString();
  return { token, expiresAt, tokenHash, lastUsedAt };
}

async function issueDeviceSession(studentId: string) {
  const db = bindings().DB;
  const device = await prepareDeviceSession();
  const inserted = await db.prepare(`INSERT INTO device_sessions(token_hash, student_id, expires_at, last_used_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM student_profiles s JOIN classrooms c ON c.id = s.classroom_id WHERE s.id = ? AND s.archived_at IS NULL AND c.active = 1)`).bind(device.tokenHash, studentId, device.expiresAt, device.lastUsedAt, studentId).run();
  if (!inserted.meta.changes) return null;
  return { token: device.token, expiresAt: device.expiresAt };
}

async function classroomForEntry(codeOrToken: string) {
  return bindings().DB.prepare(`SELECT id, display_name AS displayName, class_code AS classCode, admission_open AS admissionOpen FROM classrooms WHERE active = 1 AND (class_code = ? OR join_token = ?)`).bind(codeOrToken, codeOrToken).first<{ id: string; displayName: string; classCode: string; admissionOpen: number }>();
}

function entryRateKey(request: Request) { return `student-entry:${request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local"}`; }
function presentedToken(request: Request) { return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""; }

export async function GET(request: Request) {
  const student = await studentFromRequest(request);
  if (!student) return jsonError("이 기기의 학생 정보를 찾지 못했어요.", 401);
  const db = bindings().DB;
  const artworks = await db.prepare(`SELECT id, title, topic, learning_mode AS learningMode, lesson_slug AS lessonSlug, status, current_step AS currentStep, revision, updated_at AS updatedAt, completed_at AS completedAt FROM artworks WHERE student_id = ? ORDER BY updated_at DESC, id DESC LIMIT 40`).bind(student.id).all();
  const classroom = await db.prepare(`SELECT current_activity AS currentActivity FROM classrooms WHERE id = ?`).bind(student.classroomId).first<{ currentActivity: string }>();
  const currentActivityKey = normalizeActivityKey(classroom?.currentActivity);
  const messages = await db.prepare(`SELECT id, body, createdAt, audience FROM (SELECT m.id, m.body, m.created_at AS createdAt, CASE WHEN m.student_id IS NULL THEN 'all' ELSE 'student' END AS audience FROM teacher_messages m WHERE m.classroom_id = ? AND (m.student_id IS NULL OR m.student_id = ?) ORDER BY m.created_at DESC, m.id DESC LIMIT 50) recent ORDER BY createdAt ASC, id ASC`).bind(student.classroomId, student.id).all<{ id: string; body: string; createdAt: string; audience: string }>();
  if (messages.results.length) await db.batch(messages.results.map((message) => db.prepare(`INSERT OR IGNORE INTO message_receipts(message_id, student_id, seen_at) VALUES (?, ?, CURRENT_TIMESTAMP)`).bind(message.id, student.id)));
  const teacherViewing = Boolean(await db.prepare(`SELECT 1 FROM teacher_views WHERE student_id = ? AND classroom_id = ? AND expires_at > ? LIMIT 1`).bind(student.id, student.classroomId, new Date().toISOString()).first());
  return noStoreJson({ student, artworks: artworks.results, messages: messages.results, teacherViewing, currentActivityKey, currentActivityLabel: activityLabel(currentActivityKey) });
}

async function studentPost(request: Request) {
  if (!sameOrigin(request)) return jsonError("요청 출처를 확인할 수 없어요.", 403);
  await ensureSchema();
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = cleanText(payload.action, 30);

  if (action === "logout") {
    const student = await studentFromRequest(request);
    if (!student) return jsonError("활성 학생 세션이 없어요.", 401);
    const token = presentedToken(request);
    await bindings().DB.prepare(`UPDATE device_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND student_id = ?`).bind(await sha256(token), student.id).run();
    return noStoreJson({ ok: true });
  }

  if (action === "join") {
    if (!(await rateLimit(entryRateKey(request), 12, 10 * 60))) return jsonError("입장 시도가 많아요. 잠시 후 다시 해 주세요.", 429);
    const entry = cleanText(payload.entry, 80); const classroom = await classroomForEntry(entry);
    if (!classroom) return jsonError("수업 코드를 다시 확인해 주세요.", 404);
    if (!classroom.admissionOpen) return jsonError("선생님이 입장을 열 때까지 기다려 주세요.", 403);
    const nickname = cleanText(payload.nickname, 16); const animal = cleanText(payload.animal, 12); const pictureLength = picturePasswordLength(payload.picturePassword); const picture = normalizePicturePassword(payload.picturePassword); const allowDuplicate = payload.allowDuplicate === true;
    if (nickname.length < 2 || !animal || pictureLength !== 3) return jsonError("별명, 동물, 그림 비밀번호 세 개를 모두 골라 주세요.");
    const db = bindings().DB;
    if (!allowDuplicate) {
      const existing = await db.prepare(`SELECT 1 FROM student_profiles WHERE classroom_id = ? AND nickname = ? COLLATE NOCASE AND animal = ? AND archived_at IS NULL LIMIT 1`).bind(classroom.id, nickname, animal).first();
      if (existing) return noStoreJson({ error: "같은 별명과 동물의 프로필이 이미 있어요.", code: "PROFILE_EXISTS" }, { status: 409 });
    }
    const studentId = id("student"); const salt = randomToken(16); const personalQrToken = randomToken(28); const now = new Date().toISOString();
    const [pictureHash, personalQrHash, device] = await Promise.all([
      deriveSecret(picture, salt),
      sha256(personalQrToken),
      prepareDeviceSession(),
    ]);
    const joinResults = await db.batch([
      db.prepare(`INSERT INTO student_profiles(id, classroom_id, nickname, animal, last_activity_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM classrooms WHERE id = ? AND active = 1 AND admission_open = 1) AND (? = 1 OR NOT EXISTS (SELECT 1 FROM student_profiles WHERE classroom_id = ? AND nickname = ? COLLATE NOCASE AND animal = ? AND archived_at IS NULL))`).bind(studentId, classroom.id, nickname, animal, now, classroom.id, allowDuplicate ? 1 : 0, classroom.id, nickname, animal),
      db.prepare(`INSERT INTO recovery_credentials(student_id, picture_hash, picture_salt, personal_qr_hash) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM student_profiles WHERE id = ? AND classroom_id = ? AND archived_at IS NULL)`).bind(studentId, pictureHash, salt, personalQrHash, studentId, classroom.id),
      db.prepare(`INSERT INTO device_sessions(token_hash, student_id, expires_at, last_used_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM student_profiles WHERE id = ? AND classroom_id = ? AND archived_at IS NULL)`).bind(device.tokenHash, studentId, device.expiresAt, device.lastUsedAt, studentId, classroom.id),
    ]);
    if (!joinResults[0]?.meta.changes) {
      if (!allowDuplicate) {
        const existing = await db.prepare(`SELECT 1 FROM student_profiles WHERE classroom_id = ? AND nickname = ? COLLATE NOCASE AND animal = ? AND archived_at IS NULL LIMIT 1`).bind(classroom.id, nickname, animal).first();
        if (existing) return noStoreJson({ error: "같은 별명과 동물의 프로필이 이미 있어요.", code: "PROFILE_EXISTS" }, { status: 409 });
      }
      return jsonError("입장이 닫혔어요. 선생님께 확인해 주세요.", 403);
    }
    return noStoreJson({ student: { id: studentId, nickname, animal, classroomName: classroom.displayName }, deviceToken: device.token, expiresAt: device.expiresAt, personalQrToken }, { status: 201 });
  }

  if (action === "switchProfile") {
    if (!(await rateLimit(entryRateKey(request), 8, 10 * 60))) return jsonError("확인 시도가 많아요. 잠시 기다려 주세요.", 429);
    const studentId = cleanText(payload.studentId, 40); const pictureLength = picturePasswordLength(payload.picturePassword); const picture = normalizePicturePassword(payload.picturePassword);
    if (pictureLength !== 3 && pictureLength !== 4) return jsonError("그림 비밀번호는 세 개 또는 예전에 만든 네 개를 골라 주세요.");
    const candidate = await bindings().DB.prepare(`SELECT s.id, s.nickname, s.animal, c.display_name AS classroomName, r.picture_hash AS pictureHash, r.picture_salt AS pictureSalt FROM student_profiles s JOIN classrooms c ON c.id = s.classroom_id JOIN recovery_credentials r ON r.student_id = s.id WHERE s.id = ? AND s.archived_at IS NULL AND c.active = 1`).bind(studentId).first<RecoveredStudent>();
    const valid = candidate ? await verifySecret(picture, candidate.pictureSalt, candidate.pictureHash) : Boolean(await deriveSecret(picture, "missing-profile-salt")) && false;
    if (!candidate || !valid) return jsonError("그림 비밀번호를 다시 확인해 주세요.", 401);
    const device = await issueDeviceSession(candidate.id);
    if (!device) return jsonError("이 학급은 더 이상 이용할 수 없어요. 선생님께 확인해 주세요.", 403);
    return noStoreJson({ student: { id: candidate.id, nickname: candidate.nickname, animal: candidate.animal, classroomName: candidate.classroomName }, deviceToken: device.token, expiresAt: device.expiresAt });
  }

  if (action === "recover") {
    if (!(await rateLimit(entryRateKey(request), 8, 10 * 60))) return jsonError("복구 시도가 많아요. 선생님께 도움을 요청해 주세요.", 429);
    const personalQrToken = cleanText(payload.personalQrToken, 120); let student: RecoveredStudent | null = null;
    if (personalQrToken) {
      student = await bindings().DB.prepare(`SELECT s.id, s.nickname, s.animal, c.display_name AS classroomName, r.picture_hash AS pictureHash, r.picture_salt AS pictureSalt FROM recovery_credentials r JOIN student_profiles s ON s.id = r.student_id JOIN classrooms c ON c.id = s.classroom_id WHERE r.personal_qr_hash = ? AND s.archived_at IS NULL AND c.active = 1`).bind(await sha256(personalQrToken)).first<RecoveredStudent>();
    } else {
      const classCode = cleanText(payload.classCode, 12); const nickname = cleanText(payload.nickname, 16); const animal = cleanText(payload.animal, 12); const pictureLength = picturePasswordLength(payload.picturePassword); const picture = normalizePicturePassword(payload.picturePassword);
      if (pictureLength !== 3 && pictureLength !== 4) return jsonError("그림 비밀번호는 세 개 또는 예전에 만든 네 개를 골라 주세요.");
      const candidates = await bindings().DB.prepare(`SELECT s.id, s.nickname, s.animal, c.display_name AS classroomName, r.picture_hash AS pictureHash, r.picture_salt AS pictureSalt FROM student_profiles s JOIN classrooms c ON c.id = s.classroom_id JOIN recovery_credentials r ON r.student_id = s.id WHERE c.class_code = ? AND s.nickname = ? AND s.animal = ? AND s.archived_at IS NULL AND c.active = 1 ORDER BY s.id`).bind(classCode, nickname, animal).all<RecoveredStudent>();
      const checks = await Promise.all(candidates.results.map((candidate) => verifySecret(picture, candidate.pictureSalt, candidate.pictureHash)));
      if (!candidates.results.length) await deriveSecret(picture, "missing-recovery-salt");
      const matches = candidates.results.filter((_, index) => checks[index]);
      if (matches.length > 1) return jsonError("같은 프로필이 있어요. 개인 QR이나 선생님 도움으로 찾아 주세요.", 409);
      student = matches[0] ?? null;
      if (!student) return jsonError("프로필이나 그림 비밀번호를 다시 확인해 주세요.", 401);
    }
    if (!student) return jsonError("복구할 학생을 찾지 못했어요.", 404);
    const device = await issueDeviceSession(student.id);
    if (!device) return jsonError("이 학급은 더 이상 이용할 수 없어요. 선생님께 확인해 주세요.", 403);
    return noStoreJson({ student: { id: student.id, nickname: student.nickname, animal: student.animal, classroomName: student.classroomName }, deviceToken: device.token, expiresAt: device.expiresAt });
  }
  return jsonError("지원하지 않는 요청이에요.");
}

export async function POST(request: Request) {
  try {
    return await studentPost(request);
  } catch (error) {
    console.error("Unexpected student API error", error);
    return jsonError("입장을 처리하지 못했어요. 잠시 뒤 다시 해 주세요.", 500);
  }
}
