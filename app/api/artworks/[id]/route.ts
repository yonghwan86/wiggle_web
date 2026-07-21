import { bindings } from "@/db/runtime";
import { validateDrawDocument } from "@/lib/drawing-model";
import { cleanText, id, jsonError, noStoreJson, randomToken, rateLimit, sameOrigin, studentFromRequest } from "@/lib/security";

type Artwork = { id: string; studentId: string; classroomId: string; title: string; topic: string; learningMode: string; intent: string; opsJson: string; currentStep: number; revision: number; status: string; versionCount: number; thumbnailKey: string | null; finalImageKey: string | null; updatedAt: string };

async function ownedArtwork(artworkId: string, studentId: string) {
  return bindings().DB.prepare(`SELECT id, student_id AS studentId, classroom_id AS classroomId, title, topic, learning_mode AS learningMode, intent, ops_json AS opsJson, current_step AS currentStep, revision, status, version_count AS versionCount, thumbnail_key AS thumbnailKey, final_image_key AS finalImageKey, updated_at AS updatedAt FROM artworks WHERE id = ? AND student_id = ?`).bind(artworkId, studentId).first<Artwork>();
}

function decodeImage(dataUrl: unknown, maxBytes: number) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ""));
  if (!match) return null;
  const binary = atob(match[1]); if (binary.length > maxBytes) return null;
  const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function priorMutation(requestId: string, artworkId: string, studentId: string) {
  return bindings().DB.prepare(`SELECT result_revision AS resultRevision FROM artwork_mutations WHERE request_id = ? AND artwork_id = ? AND student_id = ?`).bind(requestId, artworkId, studentId).first<{ resultRevision: number }>();
}

async function removeCandidates(keys: Array<string | null>) {
  await Promise.allSettled(keys.filter((key): key is string => Boolean(key)).map((key) => bindings().ARTWORKS.delete(key)));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const student = await studentFromRequest(request);
  if (!student) return jsonError("학생 로그인이 필요해요.", 401);
  const artworkId = cleanText((await context.params).id, 80); const artwork = await ownedArtwork(artworkId, student.id);
  if (!artwork) return jsonError("내 그림이 아니거나 찾을 수 없어요.", 404);
  const reflection = await bindings().DB.prepare(`SELECT favorite_part AS favoritePart, favorite_reason AS favoriteReason, spoken_description AS spokenDescription, story_text AS storyText, next_suggestion AS nextSuggestion FROM reflections WHERE artwork_id = ?`).bind(artworkId).first();
  return noStoreJson({ artwork: { ...artwork, document: JSON.parse(artwork.opsJson), opsJson: undefined }, reflection });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return jsonError("요청 출처를 확인할 수 없어요.", 403);
  const student = await studentFromRequest(request);
  if (!student) return jsonError("학생 로그인이 필요해요.", 401);
  if (!(await rateLimit(`artwork-save:${student.id}`, 90, 60))) return jsonError("저장이 너무 빨라요. 잠깐 기다려 주세요.", 429);
  const artworkId = cleanText((await context.params).id, 80); const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const requestId = cleanText(payload.requestId, 80);
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(requestId)) return jsonError("저장 요청 번호가 올바르지 않아요.");
  const previousRequest = await priorMutation(requestId, artworkId, student.id);
  if (previousRequest) return noStoreJson({ ok: true, revision: previousRequest.resultRevision, duplicate: true });
  const artwork = await ownedArtwork(artworkId, student.id);
  if (!artwork) return jsonError("내 그림이 아니거나 찾을 수 없어요.", 404);
  if (artwork.status === "complete") return noStoreJson({ error: "완성한 작품은 새 사본으로 이어 그려 주세요.", code: "ARTWORK_COMPLETE", serverRevision: artwork.revision }, { status: 409 });
  const expectedRevision = Number(payload.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== artwork.revision) return noStoreJson({ error: "다른 저장이 먼저 반영됐어요.", code: "REVISION_CONFLICT", serverRevision: artwork.revision }, { status: 409 });
  const document = validateDrawDocument(payload.document); if (!document) return jsonError("그림 동작 데이터가 올바르지 않아요.");
  const serialized = JSON.stringify(document); if (serialized.length > 1_250_000) return jsonError("한 작품의 동작이 너무 커요.", 413);
  const currentStep = Math.max(0, Math.min(30, Number(payload.currentStep) || 0)); const complete = payload.complete === true;
  const reflection = (payload.reflection ?? {}) as Record<string, unknown>;
  const favoritePart = cleanText(reflection.favoritePart, 80); const favoriteReason = cleanText(reflection.favoriteReason, 180);
  const spokenDescription = cleanText(reflection.spokenDescription, 300); const storyText = cleanText(reflection.storyText, 600);
  if (complete && (!favoritePart || !favoriteReason)) return jsonError("마음에 드는 곳과 이유를 모두 적어 주세요.");

  const newRevision = artwork.revision + 1; const thumbnail = decodeImage(payload.thumbnailDataUrl, 500_000); const finalImage = complete ? decodeImage(payload.finalDataUrl, 3_500_000) : null;
  if (payload.thumbnailDataUrl && !thumbnail) return jsonError("썸네일 파일을 확인해 주세요.", 413);
  if (complete && !finalImage) return jsonError("완성 그림 파일을 확인해 주세요.", 413);
  const nonce = randomToken(10);
  const thumbnailKey = thumbnail ? `students/${student.id}/artworks/${artworkId}/objects/r${newRevision}-${requestId}-${nonce}-thumb.png` : null;
  const finalKey = finalImage ? `students/${student.id}/artworks/${artworkId}/objects/r${newRevision}-${requestId}-${nonce}-final.png` : null;
  if (thumbnail && thumbnailKey) await bindings().ARTWORKS.put(thumbnailKey, thumbnail, { httpMetadata: { contentType: "image/png", cacheControl: "private, max-age=60" }, customMetadata: { studentId: student.id, artworkId, requestId, state: "candidate", kind: "thumbnail" } });
  if (finalImage && finalKey) await bindings().ARTWORKS.put(finalKey, finalImage, { httpMetadata: { contentType: "image/png", cacheControl: "private, max-age=300" }, customMetadata: { studentId: student.id, artworkId, requestId, state: "candidate", kind: "final" } });

  const db = bindings().DB; const versionId = id("version");
  const statements = [
    db.prepare(`UPDATE artworks SET ops_json = ?, current_step = ?, revision = ?, thumbnail_key = COALESCE(?, thumbnail_key), final_image_key = COALESCE(?, final_image_key), last_mutation_id = ?, status = CASE WHEN ? = 1 THEN 'complete' ELSE status END, completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE completed_at END, updated_at = CURRENT_TIMESTAMP, version_count = version_count + ? WHERE id = ? AND student_id = ? AND revision = ? AND status <> 'complete'`).bind(serialized, currentStep, newRevision, thumbnailKey, finalKey, requestId, complete ? 1 : 0, complete ? 1 : 0, complete ? 1 : 0, artworkId, student.id, expectedRevision),
    db.prepare(`INSERT OR IGNORE INTO artwork_mutations(request_id, artwork_id, student_id, result_revision) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM artworks WHERE id = ? AND student_id = ? AND revision = ? AND last_mutation_id = ?)`).bind(requestId, artworkId, student.id, newRevision, artworkId, student.id, newRevision, requestId),
  ];
  if (complete) {
    statements.push(db.prepare(`INSERT INTO artwork_versions(id, artwork_id, sequence, ops_json, image_key, reason) SELECT ?, ?, ?, ?, ?, 'complete' WHERE EXISTS (SELECT 1 FROM artworks WHERE id = ? AND student_id = ? AND revision = ? AND last_mutation_id = ?)`).bind(versionId, artworkId, artwork.versionCount + 1, serialized, finalKey, artworkId, student.id, newRevision, requestId));
    statements.push(db.prepare(`INSERT INTO reflections(artwork_id, favorite_part, favorite_reason, spoken_description, story_text, next_suggestion) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM artworks WHERE id = ? AND student_id = ? AND revision = ? AND last_mutation_id = ?) ON CONFLICT(artwork_id) DO UPDATE SET favorite_part = excluded.favorite_part, favorite_reason = excluded.favorite_reason, spoken_description = excluded.spoken_description, story_text = excluded.story_text, next_suggestion = excluded.next_suggestion, updated_at = CURRENT_TIMESTAMP`).bind(artworkId, favoritePart, favoriteReason, spokenDescription, storyText, "다음 그림에는 어떤 일이 생길까?", artworkId, student.id, newRevision, requestId));
  }

  let results: D1Result[];
  try { results = await db.batch(statements); }
  catch (error) {
    await removeCandidates([thumbnailKey, finalKey]);
    const duplicate = await priorMutation(requestId, artworkId, student.id);
    if (duplicate) return noStoreJson({ ok: true, revision: duplicate.resultRevision, duplicate: true });
    throw error;
  }
  if (!results[0]?.meta.changes) {
    await removeCandidates([thumbnailKey, finalKey]);
    const duplicate = await priorMutation(requestId, artworkId, student.id);
    if (duplicate) return noStoreJson({ ok: true, revision: duplicate.resultRevision, duplicate: true });
    const current = await ownedArtwork(artworkId, student.id);
    return noStoreJson({ error: current?.status === "complete" ? "완성한 작품은 바꿀 수 없어요." : "다른 저장이 먼저 반영됐어요.", code: current?.status === "complete" ? "ARTWORK_COMPLETE" : "REVISION_CONFLICT", serverRevision: current?.revision }, { status: 409 });
  }

  const committedWrites: Promise<unknown>[] = [];
  if (thumbnail && thumbnailKey) committedWrites.push(bindings().ARTWORKS.put(thumbnailKey, thumbnail, { httpMetadata: { contentType: "image/png", cacheControl: "private, max-age=60" }, customMetadata: { studentId: student.id, artworkId, requestId, state: "committed", revision: String(newRevision), kind: "thumbnail" } }));
  if (finalImage && finalKey) committedWrites.push(bindings().ARTWORKS.put(finalKey, finalImage, { httpMetadata: { contentType: "image/png", cacheControl: "private, max-age=300" }, customMetadata: { studentId: student.id, artworkId, requestId, state: "committed", revision: String(newRevision), kind: "final" } }));
  await Promise.allSettled(committedWrites);
  await removeCandidates([thumbnailKey && artwork.thumbnailKey !== thumbnailKey ? artwork.thumbnailKey : null, finalKey && artwork.finalImageKey !== finalKey ? artwork.finalImageKey : null]);
  return noStoreJson({ ok: true, revision: newRevision, status: complete ? "complete" : artwork.status });
}
