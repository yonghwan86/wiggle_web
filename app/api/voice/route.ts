import { bindings } from "@/db/runtime";
import { jsonError, noStoreJson, requireTeacher, sameOrigin, studentFromRequest } from "@/lib/security";
import { deliverTransientWhisper, receiveTransientWhisper, voiceWhisperCapability, WHISPER_MAX_BYTES } from "@/lib/voice-whisper";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("role") === "student") {
    const student = await studentFromRequest(request);
    if (!student) return jsonError("학생 로그인이 필요해요.", 401);
    const capability = voiceWhisperCapability();
    if (url.searchParams.get("receive") !== "1" || !capability.enabled) return noStoreJson({ enabled: capability.enabled, reason: capability.reason });
    const audio = await receiveTransientWhisper(student.id);
    if (!audio) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    return new Response(audio.bytes, { headers: { "content-type": audio.contentType, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
  const teacher = await requireTeacher();
  if (!teacher) return jsonError("교사 로그인이 필요해요.", 401);
  const capability = voiceWhisperCapability();
  return noStoreJson({ enabled: capability.enabled, reason: capability.reason });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("요청 출처를 확인할 수 없어요.", 403);
  const teacher = await requireTeacher();
  if (!teacher) return jsonError("교사 로그인이 필요해요.", 401);
  const capability = voiceWhisperCapability();
  if (!capability.enabled) return noStoreJson({ error: "음성 릴레이가 아직 연결되지 않았어요.", code: "VOICE_WHISPER_DISABLED", reason: capability.reason }, { status: 503 });
  const studentId = request.headers.get("x-wiggle-student")?.slice(0, 80) ?? "";
  const classroomId = request.headers.get("x-wiggle-classroom")?.slice(0, 80) ?? "";
  const owned = await bindings().DB.prepare(`SELECT s.id FROM student_profiles s JOIN classrooms c ON c.id = s.classroom_id WHERE s.id = ? AND s.classroom_id = ? AND s.archived_at IS NULL AND c.teacher_id = ? AND c.active = 1`).bind(studentId, classroomId, teacher.id).first();
  if (!owned) return jsonError("이 학급 학생에게만 보낼 수 있어요.", 403);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > WHISPER_MAX_BYTES) return jsonError("음성 조각이 너무 커요.", 413);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > WHISPER_MAX_BYTES) return jsonError("음성 조각이 너무 커요.", 413);
  const result = await deliverTransientWhisper({ studentId, bytes, contentType: request.headers.get("content-type") ?? "", durationMs: Number(request.headers.get("x-wiggle-duration-ms")) });
  if (!result.ok) return jsonError(result.reason === "invalid_audio" ? "누르고 있는 동안의 짧은 음성만 보낼 수 있어요." : "음성 릴레이에 연결하지 못했어요.", result.reason === "invalid_audio" ? 400 : 503);
  return noStoreJson({ delivered: true });
}
