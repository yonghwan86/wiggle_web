import { cookies } from "next/headers";
import { bindings } from "@/db/runtime";
import { ensureLocalTeacher, issueTeacherSession } from "@/lib/demo-seed";
import { cleanText, id, isLocalDemoRequest, jsonError, noStoreJson, randomToken, rateLimit, requireTeacher, revokeTeacherSession, sameOrigin, sha256 } from "@/lib/security";
import { prepareTeacherMessageInsert, validateTeacherMessageTarget } from "@/lib/teacher-messages";
import { createFamilyShare, revokeFamilyShare } from "@/lib/family-sharing";
import { activityLabel, DEFAULT_ACTIVITY_KEY, isActivityKey, normalizeActivityKey } from "@/lib/lesson-content";

type ClassroomRow = { id: string; displayName: string; classCode: string; joinToken: string; admissionOpen: number; currentActivity: string; studentCount: number; updatedAt: string };

function presentClassroom<T extends { currentActivity: string }>(classroom: T) {
  const currentActivityKey = normalizeActivityKey(classroom.currentActivity);
  return { ...classroom, currentActivity: activityLabel(currentActivityKey), currentActivityKey, currentActivityLabel: activityLabel(currentActivityKey) };
}

function clientKey(request: Request, scope: string) {
  return `${scope}:${request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local"}`;
}

async function uniqueClassCode() {
  const db = bindings().DB;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const row = await db.prepare(`SELECT id FROM classrooms WHERE class_code = ?`).bind(code).first();
    if (!row) return code;
  }
  throw new Error("새 수업 코드를 만들지 못했어요.");
}

async function ownedClassroom(teacherId: string, classroomId: string) {
  const classroom = await bindings().DB.prepare(`SELECT id, display_name AS displayName, class_code AS classCode, join_token AS joinToken, admission_open AS admissionOpen, current_activity AS currentActivity FROM classrooms WHERE id = ? AND teacher_id = ? AND active = 1`).bind(classroomId, teacherId).first<{ id: string; displayName: string; classCode: string; joinToken: string; admissionOpen: number; currentActivity: string }>();
  return classroom ? presentClassroom(classroom) : null;
}

async function toDataUrl(key: string | null) {
  if (!key) return null;
  const object = await bindings().ARTWORKS.get(key);
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${object.httpMetadata?.contentType ?? "image/png"};base64,${btoa(binary)}`;
}

export async function GET(request: Request) {
  const teacher = await requireTeacher();
  if (!teacher) return noStoreJson({ error: "교사 로그인이 필요해요.", localDemo: isLocalDemoRequest(request) }, { status: 401 });
  const url = new URL(request.url);
  const classroomId = cleanText(url.searchParams.get("classroomId"), 40);
  const db = bindings().DB;
  if (!classroomId) {
    const result = await db.prepare(`SELECT c.id, c.display_name AS displayName, c.class_code AS classCode, c.join_token AS joinToken, c.admission_open AS admissionOpen, c.current_activity AS currentActivity, c.updated_at AS updatedAt, COUNT(s.id) AS studentCount FROM classrooms c LEFT JOIN student_profiles s ON s.classroom_id = c.id WHERE c.teacher_id = ? AND c.active = 1 GROUP BY c.id ORDER BY c.created_at DESC`).bind(teacher.id).all<ClassroomRow>();
    return noStoreJson({ teacher, classrooms: result.results.map(presentClassroom) });
  }

  const classroom = await ownedClassroom(teacher.id, classroomId);
  if (!classroom) return jsonError("이 학급을 볼 권한이 없어요.", 403);
  const students = await db.prepare(`SELECT s.id, s.nickname, s.animal, s.last_activity_at AS lastActivityAt, a.id AS artworkId, a.title AS artworkTitle, a.status, a.current_step AS currentStep, a.revision, a.thumbnail_key AS thumbnailKey, a.updated_at AS artworkUpdatedAt, (SELECT a3.id FROM artworks a3 WHERE a3.student_id = s.id AND a3.classroom_id = s.classroom_id AND a3.status = 'complete' AND a3.final_image_key IS NOT NULL ORDER BY a3.completed_at DESC, a3.id DESC LIMIT 1) AS completedArtworkId FROM student_profiles s LEFT JOIN artworks a ON a.id = (SELECT a2.id FROM artworks a2 WHERE a2.student_id = s.id ORDER BY a2.updated_at DESC LIMIT 1) WHERE s.classroom_id = ? ORDER BY s.nickname COLLATE NOCASE, s.id`).bind(classroomId).all<{ id: string; nickname: string; animal: string; lastActivityAt: string; artworkId: string | null; artworkTitle: string | null; status: string | null; currentStep: number | null; revision: number | null; thumbnailKey: string | null; artworkUpdatedAt: string | null; completedArtworkId: string | null }>();
  const hydrated = await Promise.all(students.results.map(async ({ thumbnailKey, ...student }: { id: string; nickname: string; animal: string; lastActivityAt: string; artworkId: string | null; artworkTitle: string | null; status: string | null; currentStep: number | null; revision: number | null; thumbnailKey: string | null; artworkUpdatedAt: string | null; completedArtworkId: string | null }) => ({ ...student, thumbnail: await toDataUrl(thumbnailKey) })));
  const messages = await db.prepare(`SELECT m.id, m.student_id AS studentId, m.body, m.created_at AS createdAt, s.nickname, COUNT(r.student_id) AS seenCount FROM teacher_messages m LEFT JOIN student_profiles s ON s.id = m.student_id LEFT JOIN message_receipts r ON r.message_id = m.id WHERE m.classroom_id = ? GROUP BY m.id ORDER BY m.created_at DESC, m.id DESC LIMIT 30`).bind(classroomId).all();
  const familyLinks = await db.prepare(`SELECT l.id, l.student_id AS studentId, l.scope, l.expires_at AS expiresAt, l.revoked_at AS revokedAt, l.created_at AS createdAt, COUNT(f.artwork_id) AS artworkCount FROM family_share_links l JOIN student_profiles s ON s.id = l.student_id LEFT JOIN family_share_artworks f ON f.link_id = l.id WHERE l.teacher_id = ? AND s.classroom_id = ? GROUP BY l.id ORDER BY l.created_at DESC LIMIT 50`).bind(teacher.id, classroomId).all();
  return noStoreJson({ teacher, classroom, students: hydrated, messages: messages.results, familyLinks: familyLinks.results });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("요청 출처를 확인할 수 없어요.", 403);
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = cleanText(payload.action, 30);
  if (action === "login") {
    if (!isLocalDemoRequest(request)) return jsonError("운영 환경에서는 ChatGPT 로그인만 사용할 수 있어요.", 401);
    if (!(await rateLimit(clientKey(request, "teacher-login"), 8, 10 * 60))) return jsonError("잠시 후 다시 시도해 주세요.", 429);
    const email = cleanText(payload.email, 120).toLowerCase();
    const pin = cleanText(payload.pin, 32);
    if (!/^\S+@\S+\.\S+$/.test(email) || pin.length < 8) return jsonError("로컬 이메일과 8자 이상 PIN을 입력해 주세요.");
    const teacherId = await ensureLocalTeacher(email, pin, email.split("@")[0].slice(0, 40) || "로컬 선생님");
    if (!teacherId) return jsonError("이메일이나 접속 PIN을 확인해 주세요.", 401);
    const session = await issueTeacherSession(teacherId);
    (await cookies()).set("wiggle_teacher", session.token, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict", path: "/", expires: session.expires });
    return noStoreJson({ ok: true });
  }

  const teacher = await requireTeacher();
  if (!teacher) return jsonError("교사 로그인이 필요해요.", 401);
  if (!(await rateLimit(`teacher-write:${teacher.id}`, 120, 60))) return jsonError("요청이 너무 빨라요. 잠깐 쉬어 주세요.", 429);
  const db = bindings().DB;

  if (action === "logout") {
    await revokeTeacherSession();
    return noStoreJson({ ok: true, signOut: teacher.source === "siwc" });
  }
  if (action === "createClassroom") {
    const displayName = cleanText(payload.displayName, 30);
    if (displayName.length < 2) return jsonError("학급 이름을 두 글자 이상 적어 주세요.");
    const classroom = { id: id("class"), classCode: await uniqueClassCode(), joinToken: randomToken(18) };
    await db.prepare(`INSERT INTO classrooms(id, teacher_id, display_name, class_code, join_token, admission_open, active, current_activity) VALUES (?, ?, ?, ?, ?, 1, 1, ?)`).bind(classroom.id, teacher.id, displayName, classroom.classCode, classroom.joinToken, DEFAULT_ACTIVITY_KEY).run();
    return noStoreJson({ classroom }, { status: 201 });
  }

  const classroomId = cleanText(payload.classroomId, 40);
  const classroom = await ownedClassroom(teacher.id, classroomId);
  if (!classroom) return jsonError("이 학급을 바꿀 권한이 없어요.", 403);
  if (action === "createFamilyShare") {
    const studentId = cleanText(payload.studentId, 40);
    const artworkIds = Array.isArray(payload.artworkIds) ? payload.artworkIds.map((value) => cleanText(value, 80)).filter(Boolean) : [];
    const result = await createFamilyShare(db, { teacherId: teacher.id, classroomId, studentId, artworkIds, guardianConsentConfirmed: payload.guardianConsentConfirmed === true, consentMethod: cleanText(payload.consentMethod, 30), expiresInDays: Number(payload.expiresInDays) || 7 });
    if (!result.ok) return jsonError(result.reason === "guardian_consent_required" ? "확인된 보호자 사전 동의 기록이 필요해요." : result.reason === "invalid_consent_method" ? "보호자 동의 확인 방법을 다시 골라 주세요." : result.reason === "artwork_forbidden" ? "완성되고 승인할 작품만 공유할 수 있어요." : result.reason === "invalid_scope" ? "공유할 작품을 다시 골라 주세요." : "가족 링크를 만들 권한이 없어요.", result.reason === "forbidden" ? 403 : 400);
    return noStoreJson({ share: { id: result.linkId, token: result.inviteToken, scope: result.scope, linkExpiresAt: result.expiresAt, inviteExpiresAt: result.inviteExpiresAt } }, { status: 201 });
  }
  if (action === "revokeFamilyShare") {
    const revoked = await revokeFamilyShare(db, { teacherId: teacher.id, classroomId, linkId: cleanText(payload.linkId, 50) });
    if (!revoked) return jsonError("취소할 가족 링크를 찾지 못했어요.", 404);
    return noStoreJson({ revoked: true });
  }
  if (action === "sendMessage") {
    const studentId = cleanText(payload.studentId, 40) || null;
    const validated = await validateTeacherMessageTarget(db, { teacherId: teacher.id, classroomId, studentId, body: payload.body });
    if (!validated.ok && validated.reason === "empty_body") return jsonError("보낼 말을 적어 주세요.");
    if (!validated.ok) return jsonError(validated.reason === "student_forbidden" ? "이 학급 학생이 아니에요." : "이 학급을 바꿀 권한이 없어요.", 403);
    const inserted = await prepareTeacherMessageInsert(db, validated.target).run();
    if (!inserted.meta.changes) return jsonError("메시지 대상을 다시 확인해 주세요.", 403);
    return noStoreJson({ messageId: validated.target.messageId }, { status: 201 });
  }
  if (action === "toggleAdmission") {
    await db.prepare(`UPDATE classrooms SET admission_open = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND teacher_id = ?`).bind(payload.open ? 1 : 0, classroomId, teacher.id).run();
    return noStoreJson({ open: Boolean(payload.open) });
  }
  if (action === "rotateCode") {
    const classCode = await uniqueClassCode();
    const joinToken = randomToken(18);
    await db.prepare(`UPDATE classrooms SET class_code = ?, join_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND teacher_id = ?`).bind(classCode, joinToken, classroomId, teacher.id).run();
    return noStoreJson({ classCode, joinToken });
  }
  if (action === "setActivity") {
    const activity = cleanText(payload.activity, 50);
    if (!isActivityKey(activity)) return jsonError("목록에 있는 활동을 골라 주세요.");
    await db.prepare(`UPDATE classrooms SET current_activity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND teacher_id = ?`).bind(activity, classroomId, teacher.id).run();
    return noStoreJson({ activity });
  }
  if (action === "viewStudent") {
    const studentId = cleanText(payload.studentId, 40);
    const student = await db.prepare(`SELECT id FROM student_profiles WHERE id = ? AND classroom_id = ?`).bind(studentId, classroomId).first();
    if (!student) return jsonError("이 학급 학생이 아니에요.", 403);
    const expiresAt = new Date(Date.now() + 20_000).toISOString();
    await db.prepare(`INSERT INTO teacher_views(teacher_id, classroom_id, student_id, expires_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(teacher_id, student_id) DO UPDATE SET classroom_id = excluded.classroom_id, expires_at = excluded.expires_at, updated_at = CURRENT_TIMESTAMP`).bind(teacher.id, classroomId, studentId, expiresAt).run();
    return noStoreJson({ viewing: true, expiresAt });
  }
  if (action === "resetStudentRecovery") {
    const studentId = cleanText(payload.studentId, 40);
    const student = await db.prepare(`SELECT id FROM student_profiles WHERE id = ? AND classroom_id = ?`).bind(studentId, classroomId).first();
    if (!student) return jsonError("이 학급 학생이 아니에요.", 403);
    const personalQrToken = randomToken(28);
    await db.batch([
      db.prepare(`UPDATE recovery_credentials SET personal_qr_hash = ?, reset_at = CURRENT_TIMESTAMP WHERE student_id = ?`).bind(await sha256(personalQrToken), studentId),
      db.prepare(`UPDATE device_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE student_id = ? AND revoked_at IS NULL`).bind(studentId),
    ]);
    return noStoreJson({ personalQrToken });
  }
  return jsonError("지원하지 않는 요청이에요.");
}
