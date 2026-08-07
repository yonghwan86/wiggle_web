import { bindings, ensureSchema } from "@/db/runtime";
import { cleanText, clearRateLimit, deriveSecret, id, jsonError, noStoreJson, normalizePicturePassword, picturePasswordLength, randomToken, rateLimit, sameOrigin, sha256, studentFromRequest, verifySecret } from "@/lib/security";
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

// 학교 Wi-Fi는 NAT 뒤라 한 학급 전체가 공인 IP 하나로 보인다. IP 한도는 학급 규모를
// 견딜 만큼 넉넉히 두고, 무차별 대입은 대상(학생·프로필) 단위 한도로 막는다.
const IP_ENTRY_LIMIT = 180;
const IP_ENTRY_WINDOW_SECONDS = 10 * 60;
const TARGET_ATTEMPT_LIMIT = 8;
const TARGET_ATTEMPT_WINDOW_SECONDS = 15 * 60;
const CLASSROOM_JOIN_LIMIT = 60;

function requestIp(request: Request) { return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local"; }
function entryRateKey(request: Request) { return `student-entry:${requestIp(request)}`; }
function ipAllowed(request: Request) { return rateLimit(entryRateKey(request), IP_ENTRY_LIMIT, IP_ENTRY_WINDOW_SECONDS); }
function targetKey(target: string) { return `student-target:${target}`; }
function targetAllowed(target: string) { return rateLimit(targetKey(target), TARGET_ATTEMPT_LIMIT, TARGET_ATTEMPT_WINDOW_SECONDS); }
function presentedToken(request: Request) { return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""; }

export async function GET(request: Request) {
  const student = await studentFromRequest(request);
  if (!student) return jsonError("이 기기의 학생 정보를 찾지 못했어요.", 401);
  const db = bindings().DB;
  const artworks = await db.prepare(`SELECT id, title, topic, learning_mode AS learningMode, lesson_slug AS lessonSlug, status, current_step AS currentStep, revision, CASE WHEN thumbnail_key IS NOT NULL OR final_image_key IS NOT NULL THEN 1 ELSE 0 END AS hasImage, updated_at AS updatedAt, completed_at AS completedAt FROM artworks WHERE student_id = ? ORDER BY updated_at DESC, id DESC LIMIT 40`).bind(student.id).all();
  const classroom = await db.prepare(`SELECT current_activity AS currentActivity FROM classrooms WHERE id = ?`).bind(student.classroomId).first<{ currentActivity: string }>();
  const currentActivityKey = normalizeActivityKey(classroom?.currentActivity);
  const messages = await db.prepare(`SELECT id, body, createdAt, audience, seenAt FROM (SELECT m.id, m.body, m.created_at AS createdAt, CASE WHEN m.student_id IS NULL THEN 'all' ELSE 'student' END AS audience, r.seen_at AS seenAt FROM teacher_messages m LEFT JOIN message_receipts r ON r.message_id = m.id AND r.student_id = ? WHERE m.classroom_id = ? AND (m.student_id IS NULL OR m.student_id = ?) ORDER BY m.created_at DESC, m.id DESC LIMIT 50) recent ORDER BY createdAt ASC, id ASC`).bind(student.id, student.classroomId, student.id).all<{ id: string; body: string; createdAt: string; audience: string; seenAt: string | null }>();
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

  if (action === "ackTeacherMessage") {
    const student = await studentFromRequest(request);
    if (!student) return jsonError("활성 학생 세션이 없어요.", 401);
    const messageId = cleanText(payload.messageId, 80);
    if (!messageId) return jsonError("확인할 선생님 말씀을 찾지 못했어요.", 400);
    const db = bindings().DB;
    const accessible = await db.prepare(`SELECT 1 FROM teacher_messages WHERE id = ? AND classroom_id = ? AND (student_id IS NULL OR student_id = ?) LIMIT 1`).bind(messageId, student.classroomId, student.id).first();
    if (!accessible) return jsonError("확인할 선생님 말씀을 찾지 못했어요.", 404);
    await db.prepare(`INSERT OR IGNORE INTO message_receipts(message_id, student_id, seen_at) VALUES (?, ?, CURRENT_TIMESTAMP)`).bind(messageId, student.id).run();
    return noStoreJson({ ok: true });
  }

  if (action === "ackTeacherMessages") {
    const student = await studentFromRequest(request);
    if (!student) return jsonError("활성 학생 세션이 없어요.", 401);
    const rawMessageIds = Array.isArray(payload.messageIds) ? payload.messageIds.slice(0, 100) : [];
    const messageIds = [...new Set(rawMessageIds
      .filter((value): value is string => typeof value === "string")
      .map((value) => cleanText(value, 80))
      .filter(Boolean))].slice(0, 50);
    if (!messageIds.length) return jsonError("확인할 선생님 말씀을 찾지 못했어요.", 400);

    const db = bindings().DB;
    const placeholders = messageIds.map(() => "?").join(", ");
    const accessible = await db.prepare(`SELECT id FROM teacher_messages WHERE id IN (${placeholders}) AND classroom_id = ? AND (student_id IS NULL OR student_id = ?)`)
      .bind(...messageIds, student.classroomId, student.id)
      .all<{ id: string }>();
    if (accessible.results.length !== messageIds.length) return jsonError("확인할 선생님 말씀을 찾지 못했어요.", 404);

    await db.batch(messageIds.map((messageId) => db.prepare(`INSERT OR IGNORE INTO message_receipts(message_id, student_id, seen_at)
      SELECT ?, ?, CURRENT_TIMESTAMP
      WHERE EXISTS (SELECT 1 FROM teacher_messages WHERE id = ? AND classroom_id = ? AND (student_id IS NULL OR student_id = ?))`)
      .bind(messageId, student.id, messageId, student.classroomId, student.id)));
    return noStoreJson({ ok: true, acknowledged: messageIds.length });
  }

  if (action === "join") {
    if (!(await ipAllowed(request))) return jsonError("입장 시도가 많아요. 잠시 후 다시 해 주세요.", 429);
    const entry = cleanText(payload.entry, 80); const classroom = await classroomForEntry(entry);
    if (!classroom) return jsonError("수업 코드를 다시 확인해 주세요.", 404);
    if (!classroom.admissionOpen) return jsonError("선생님이 입장을 열 때까지 기다려 주세요.", 403);
    const nickname = cleanText(payload.nickname, 16); const animal = cleanText(payload.animal, 12); const pictureLength = picturePasswordLength(payload.picturePassword); const picture = normalizePicturePassword(payload.picturePassword); const allowDuplicate = payload.allowDuplicate === true;
    // 형태 검증을 먼저 한다. 잘못된 본문이 아래 상한을 소비하면 공격자가 그 학급 전체의 입장을 막을 수 있다.
    if (nickname.length < 2 || !animal || pictureLength !== 3) return jsonError("별명, 동물, 그림 비밀번호 세 개를 모두 골라 주세요.");
    // 학급 상한은 IP와 함께 묶는다. 학급 단독 버킷은 한 클라이언트가 학급 전체를 잠그는 통로가 된다.
    // 이 상한은 명단 존재 여부를 캐내는 409 오라클 반복과 가짜 프로필 누적을 제한한다.
    if (!(await rateLimit(`student-join-class:${classroom.id}:${requestIp(request)}`, CLASSROOM_JOIN_LIMIT, IP_ENTRY_WINDOW_SECONDS))) return jsonError("이 수업의 입장 시도가 많아요. 선생님께 알려 주세요.", 429);
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
    if (!(await ipAllowed(request))) return jsonError("확인 시도가 많아요. 잠시 기다려 주세요.", 429);
    const studentId = cleanText(payload.studentId, 40); const pictureLength = picturePasswordLength(payload.picturePassword); const picture = normalizePicturePassword(payload.picturePassword);
    if (pictureLength !== 3) return jsonError("그림 비밀번호 세 개를 골라 주세요.");
    // 대상 학생 계정 단위 한도가 없으면 그림 비밀번호 512가지를 IP만 바꿔 가며 전수 시도할 수 있다.
    if (!(await targetAllowed(`unlock:${studentId}`))) return jsonError("여러 번 틀렸어요. 선생님께 도움을 요청해 주세요.", 429);
    const candidate = await bindings().DB.prepare(`SELECT s.id, s.nickname, s.animal, c.display_name AS classroomName, r.picture_hash AS pictureHash, r.picture_salt AS pictureSalt FROM student_profiles s JOIN classrooms c ON c.id = s.classroom_id JOIN recovery_credentials r ON r.student_id = s.id WHERE s.id = ? AND s.archived_at IS NULL AND c.active = 1`).bind(studentId).first<RecoveredStudent>();
    const valid = candidate ? await verifySecret(picture, candidate.pictureSalt, candidate.pictureHash) : Boolean(await deriveSecret(picture, "missing-profile-salt")) && false;
    if (!candidate || !valid) return jsonError("그림 비밀번호를 다시 확인해 주세요.", 401);
    await clearRateLimit(targetKey(`unlock:${studentId}`));
    const device = await issueDeviceSession(candidate.id);
    if (!device) return jsonError("이 학급은 더 이상 이용할 수 없어요. 선생님께 확인해 주세요.", 403);
    return noStoreJson({ student: { id: candidate.id, nickname: candidate.nickname, animal: candidate.animal, classroomName: candidate.classroomName }, deviceToken: device.token, expiresAt: device.expiresAt });
  }

  if (action === "recover") {
    if (!(await ipAllowed(request))) return jsonError("복구 시도가 많아요. 선생님께 도움을 요청해 주세요.", 429);
    const personalQrToken = cleanText(payload.personalQrToken, 120); let student: RecoveredStudent | null = null;
    const qrTarget = personalQrToken ? `qr:${await sha256(personalQrToken)}` : "";
    if (personalQrToken) {
      if (!(await targetAllowed(qrTarget))) return jsonError("복구 시도가 많아요. 선생님께 도움을 요청해 주세요.", 429);
      student = await bindings().DB.prepare(`SELECT s.id, s.nickname, s.animal, c.display_name AS classroomName, r.picture_hash AS pictureHash, r.picture_salt AS pictureSalt FROM recovery_credentials r JOIN student_profiles s ON s.id = r.student_id JOIN classrooms c ON c.id = s.classroom_id WHERE r.personal_qr_hash = ? AND s.archived_at IS NULL AND c.active = 1`).bind(qrTarget.slice(3)).first<RecoveredStudent>();
    } else {
      const classCode = cleanText(payload.classCode, 12); const nickname = cleanText(payload.nickname, 16); const animal = cleanText(payload.animal, 12); const pictureLength = picturePasswordLength(payload.picturePassword); const picture = normalizePicturePassword(payload.picturePassword);
      if (pictureLength !== 3) return jsonError("그림 비밀번호 세 개를 골라 주세요.");
      const recoverTarget = `recover:${classCode}:${nickname}:${animal}`;
      if (!(await targetAllowed(recoverTarget))) return jsonError("여러 번 틀렸어요. 선생님께 도움을 요청해 주세요.", 429);
      const candidates = await bindings().DB.prepare(`SELECT s.id, s.nickname, s.animal, c.display_name AS classroomName, r.picture_hash AS pictureHash, r.picture_salt AS pictureSalt FROM student_profiles s JOIN classrooms c ON c.id = s.classroom_id JOIN recovery_credentials r ON r.student_id = s.id WHERE c.class_code = ? AND s.nickname = ? AND s.animal = ? AND s.archived_at IS NULL AND c.active = 1 ORDER BY s.id`).bind(classCode, nickname, animal).all<RecoveredStudent>();
      const checks = await Promise.all(candidates.results.map((candidate) => verifySecret(picture, candidate.pictureSalt, candidate.pictureHash)));
      if (!candidates.results.length) await deriveSecret(picture, "missing-recovery-salt");
      const matches = candidates.results.filter((_, index) => checks[index]);
      if (matches.length > 1) return jsonError("같은 프로필이 있어요. 개인 QR이나 선생님 도움으로 찾아 주세요.", 409);
      student = matches[0] ?? null;
      if (!student) return jsonError("프로필이나 그림 비밀번호를 다시 확인해 주세요.", 401);
      await clearRateLimit(targetKey(recoverTarget));
    }
    if (!student) return jsonError("복구할 학생을 찾지 못했어요.", 404);
    // 성공한 QR 복구도 카운터를 비운다(정상 QR을 15분에 8번 쓰면 막히지 않게).
    // 세션 발급보다 먼저 해야, 이 삭제가 실패해도 클라이언트가 받지 못한 세션이 남지 않는다.
    if (qrTarget) await clearRateLimit(targetKey(qrTarget));
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
