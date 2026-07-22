import { bindings } from "@/db/runtime";
import { findOwnedCoachingEvent, recordCoachingAfter, recordCoachingBefore } from "@/lib/coaching-store";
import { validateDrawDocument } from "@/lib/drawing-model";
import { parseImageDataUrl } from "@/lib/image-data";
import { AIServiceError, DrawingGuide, requestStructuredOpenAI, StudentCoaching } from "@/lib/openai-coaching";
import { cleanText, jsonError, noStoreJson, rateLimit, sameOrigin, sha256, studentFromRequest } from "@/lib/security";

const MAX_BODY_CHARS = 5_200_000;
type ArtworkRow = { id: string; studentId: string; topic: string; intent: string; currentStep: number; revision: number; status: string };

async function limitedPayload(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_CHARS) return null;
  const text = await request.text(); if (text.length > MAX_BODY_CHARS) return null;
  try { const value = JSON.parse(text); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; } catch { return {}; }
}

async function ownedArtwork(artworkId: string, studentId: string) {
  return bindings().DB.prepare(`SELECT id, student_id AS studentId, topic, intent, current_step AS currentStep, revision, status FROM artworks WHERE id = ? AND student_id = ?`).bind(artworkId, studentId).first<ArtworkRow>();
}

function stringList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const result = value.map((entry) => cleanText(entry, maxLength)).filter(Boolean);
  return result.length === value.length ? result : null;
}

function parsedStringList(value: string) {
  try { return stringList(JSON.parse(value || "[]"), 4, 40) ?? []; } catch { return []; }
}

async function recentContext(artworkId: string) {
  const rows = await bindings().DB.prepare(`SELECT e.question, e.student_answer AS studentAnswer, d.new_elements_json AS newElementsJson, d.growth_event AS growthEvent, d.response_kind AS responseKind FROM coaching_events e JOIN coaching_event_details d ON d.event_id = e.id WHERE e.artwork_id = ? ORDER BY e.created_at DESC, e.id DESC LIMIT 4`).bind(artworkId).all<{ question: string; studentAnswer: string | null; newElementsJson: string; growthEvent: string | null; responseKind: string }>();
  return rows.results.reverse().map((row) => ({
    kind: row.responseKind,
    question: cleanText(row.question, 100),
    answer: cleanText(row.studentAnswer, 80),
    newElements: parsedStringList(row.newElementsJson),
    growthEvent: cleanText(row.growthEvent, 120),
  }));
}

function aiError(error: unknown) {
  if (error instanceof AIServiceError) return noStoreJson({ error: error.message, code: error.code }, { status: error.status });
  return noStoreJson({ error: "그리미가 잠시 쉬고 있어요. 조금 뒤에 다시 불러 주세요.", code: "AI_UNAVAILABLE" }, { status: 503 });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("요청 출처를 확인할 수 없어요.", 403);
  const student = await studentFromRequest(request); if (!student) return jsonError("학생 로그인이 필요해요.", 401);
  const payload = await limitedPayload(request); if (!payload) return jsonError("그림 요청이 너무 커요.", 413);
  const action = cleanText(payload.action, 24); const artworkId = cleanText(payload.artworkId, 80);
  const artwork = await ownedArtwork(artworkId, student.id); if (!artwork) return jsonError("내 그림이 아니거나 찾을 수 없어요.", 404);
  if (artwork.status === "complete") return jsonError("완성한 작품에서는 새 사본으로 그리미를 불러 주세요.", 409);
  const db = bindings().DB;

  if (action === "dismiss") {
    const eventId = cleanText(payload.eventId, 80);
    const event = await findOwnedCoachingEvent(db, eventId, artworkId, student.id);
    if (!event) return jsonError("이 도움 기록을 찾을 수 없어요.", 404);
    if (event.responseKind === "guide") return noStoreJson({ error: "현재 그림을 과정에 남긴 뒤 가이드를 닫아 주세요.", code: "GUIDE_AFTER_REQUIRED" }, { status: 409 });
    const dismissed = await db.prepare(`UPDATE coaching_event_details SET status = 'dismissed', updated_at = CURRENT_TIMESTAMP WHERE event_id = ? AND response_kind = 'question' AND status = 'open' AND EXISTS (SELECT 1 FROM coaching_events e JOIN artworks a ON a.id = e.artwork_id WHERE e.id = coaching_event_details.event_id AND a.student_id = ? AND a.id = ?)`).bind(eventId, student.id, artworkId).run();
    if (!dismissed.meta.changes) return noStoreJson({ error: "이미 처리한 도움 기록이에요.", code: "COACHING_ALREADY_HANDLED" }, { status: 409 });
    return noStoreJson({ ok: true });
  }

  if (action === "answer" || action === "finishGuide") {
    if (!(await rateLimit(`ai-answer:${student.id}`, 30, 60))) return jsonError("잠깐 쉬었다가 다시 눌러 주세요.", 429);
    const eventId = cleanText(payload.eventId, 80); const answer = cleanText(payload.answer, 80); const newElements = stringList(payload.newElements, 4, 40);
    const document = validateDrawDocument(payload.document); const image = parseImageDataUrl(payload.imageDataUrl);
    const outcome = cleanText(payload.outcome, 24);
    if (!eventId || !document || !image || (action === "answer" && (!answer || !newElements)) || (action === "finishGuide" && !["completed", "free_exit"].includes(outcome))) return jsonError("그린 뒤 답과 그림을 다시 확인해 주세요.");
    const result = await recordCoachingAfter({
      DB: db, ARTWORKS: bindings().ARTWORKS, studentId: student.id, artworkId, eventId,
      kind: action === "answer" ? "question_answer" : outcome === "completed" ? "guide_completed" : "guide_free_exit",
      document, image, currentStep: Math.max(0, Math.min(30, Number(payload.currentStep) || 0)), answer,
      newElements: newElements ?? [],
    });
    if (!result.ok && result.reason === "not_found") return jsonError("이 도움 기록을 찾을 수 없어요.", 404);
    if (!result.ok && result.reason === "already_recorded") return noStoreJson({ error: "이미 처리한 도움 기록이에요.", code: "COACHING_ALREADY_HANDLED" }, { status: 409 });
    if (!result.ok) return noStoreJson({ error: "과정 기록을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.", code: "COACHING_SAVE_FAILED" }, { status: 503 });
    return noStoreJson(result);
  }

  if (action !== "ask" && action !== "guide") return jsonError("지원하지 않는 그리미 요청이에요.");
  const requestId = cleanText(payload.requestId, 80);
  if (!/^coaching_[a-zA-Z0-9_-]{12,70}$/.test(requestId)) return jsonError("그리미 요청 번호를 확인해 주세요.");
  const existingRequest = await db.prepare(`SELECT e.artwork_id AS artworkId, a.student_id AS studentId FROM coaching_events e JOIN artworks a ON a.id = e.artwork_id WHERE e.id = ?`).bind(requestId).first<{ artworkId: string; studentId: string }>();
  if (existingRequest && (existingRequest.artworkId !== artworkId || existingRequest.studentId !== student.id)) return jsonError("그리미 요청을 찾을 수 없어요.", 404);
  if (existingRequest) return noStoreJson({ error: "이미 처리한 그리미 요청이에요.", code: "COACHING_ALREADY_HANDLED" }, { status: 409 });
  if (!(await rateLimit(`ai-create:${student.id}`, 8, 10 * 60))) return jsonError("그리미를 많이 불렀어요. 잠깐 뒤에 다시 불러 주세요.", 429);
  const expectedRevision = Number(payload.expectedRevision); const document = validateDrawDocument(payload.document); const image = parseImageDataUrl(payload.imageDataUrl);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== artwork.revision) return noStoreJson({ error: "그림을 먼저 저장한 뒤 다시 불러 주세요.", code: "REVISION_CONFLICT", serverRevision: artwork.revision }, { status: 409 });
  if (!document || JSON.stringify(document).length > 1_250_000 || !image) return jsonError("현재 그림을 확인하지 못했어요.", 413);
  const childChoice = cleanText(payload.childChoice, 80); const requestedTopic = cleanText(payload.requestedTopic, 60);
  if (action === "guide" && requestedTopic.length < 2) return jsonError("그리고 싶은 것을 두 글자 이상 말해 주세요.");
  const context = { artworkIntent: artwork.intent, artworkTopic: artwork.topic, childChoice, currentStep: artwork.currentStep, recentEvents: await recentContext(artworkId) };
  const prompt = action === "guide"
    ? `아이의 요청 주제: ${requestedTopic}\n현재 작품 맥락(JSON): ${JSON.stringify(context)}\n단계별 가이드만 만들어 줘.`
    : `현재 작품 맥락(JSON): ${JSON.stringify(context)}\n그림을 관찰하고 질문 하나와 실제 다음 그리기 행동을 제안해 줘.`;
  try {
    const result = await requestStructuredOpenAI({
      kind: action === "guide" ? "drawing_guide" : "student_coaching",
      prompt, imageDataUrl: String(payload.imageDataUrl), safetyIdentifier: await sha256(`wiggle-ai-safety-v1:${student.id}`),
    });
    const coaching = action === "ask" ? result.value as StudentCoaching : null;
    const guide = action === "guide" ? result.value as DrawingGuide : null;
    const question = coaching?.question ?? `${guide!.topic}을 어떤 순서로 그려 볼까?`;
    const hint = coaching?.nextAction ?? guide!.steps[0].instruction;
    const choices = coaching?.choices ?? [];
    const guideSteps = guide?.steps ?? [];
    const saved = await recordCoachingBefore({
      DB: db, ARTWORKS: bindings().ARTWORKS, studentId: student.id, artworkId, eventId: requestId, expectedRevision,
      responseKind: action === "ask" ? "question" : "guide", document, image, question, hint, choices, guideSteps,
      growthEvent: coaching?.growthEvent ?? null, currentStep: artwork.currentStep,
    });
    if (!saved.ok && saved.reason === "not_found") return jsonError("내 그림이 아니거나 찾을 수 없어요.", 404);
    if (!saved.ok && saved.reason === "already_recorded") return noStoreJson({ error: "이미 처리한 그리미 요청이에요.", code: "COACHING_ALREADY_HANDLED" }, { status: 409 });
    if (!saved.ok && (saved.reason === "revision_conflict" || saved.reason === "artwork_complete")) return noStoreJson({ error: "그림이 바뀌었어요. 다시 불러 주세요.", code: "REVISION_CONFLICT", serverRevision: saved.serverRevision }, { status: 409 });
    if (!saved.ok) return noStoreJson({ error: "그리미 과정을 저장하지 못했어요.", code: "COACHING_SAVE_FAILED" }, { status: 503 });
    return noStoreJson({ eventId: saved.eventId, coaching, guide, meta: { model: result.model, schemaValid: result.schemaValid } }, { status: 201 });
  } catch (error) {
    return aiError(error);
  }
}
