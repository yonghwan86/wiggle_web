import type { DrawDocument } from "@/lib/drawing-model";
import type { parseImageDataUrl } from "@/lib/image-data";

export type CoachingAfterKind = "question_answer" | "guide_completed" | "guide_free_exit";
export type CoachingAfterResult =
  | { ok: true; eventId: string; afterVersionId: string }
  | { ok: false; reason: "not_found" | "already_recorded" | "save_failed" };

type VersionImage = NonNullable<ReturnType<typeof parseImageDataUrl>>;
type OwnedEvent = { id: string; responseKind: string; status: string; afterVersionId: string | null };
type OwnedArtwork = { revision: number; status: string; versionCount: number };
type EventOwner = { artworkId: string; studentId: string };

export type CoachingBeforeResult =
  | { ok: true; eventId: string; beforeVersionId: string }
  | { ok: false; reason: "not_found" | "already_recorded" | "revision_conflict" | "artwork_complete" | "save_failed"; serverRevision?: number };

function storageId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function storageNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function findOwnedCoachingEvent(DB: D1Database, eventId: string, artworkId: string, studentId: string) {
  return DB.prepare(`SELECT e.id, e.after_version_id AS afterVersionId, d.response_kind AS responseKind, d.status
    FROM coaching_events e
    JOIN coaching_event_details d ON d.event_id = e.id
    JOIN artworks a ON a.id = e.artwork_id
    WHERE e.id = ? AND e.artwork_id = ? AND a.student_id = ?`)
    .bind(eventId, artworkId, studentId).first<OwnedEvent>();
}

async function ownedArtwork(DB: D1Database, artworkId: string, studentId: string) {
  return DB.prepare(`SELECT revision, status, version_count AS versionCount FROM artworks WHERE id = ? AND student_id = ?`)
    .bind(artworkId, studentId).first<OwnedArtwork>();
}

export async function recordCoachingBefore(input: {
  DB: D1Database;
  ARTWORKS: R2Bucket;
  studentId: string;
  artworkId: string;
  eventId: string;
  expectedRevision: number;
  responseKind: "question" | "guide";
  document: DrawDocument;
  image: VersionImage;
  question: string;
  hint: string;
  choices: unknown[];
  guideSteps: unknown[];
  growthEvent: string | null;
  currentStep: number;
}): Promise<CoachingBeforeResult> {
  const artwork = await ownedArtwork(input.DB, input.artworkId, input.studentId);
  if (!artwork) return { ok: false, reason: "not_found" };
  if (artwork.status === "complete") return { ok: false, reason: "artwork_complete", serverRevision: artwork.revision };
  if (artwork.revision !== input.expectedRevision) return { ok: false, reason: "revision_conflict", serverRevision: artwork.revision };
  const duplicate = await input.DB.prepare(`SELECT e.artwork_id AS artworkId, a.student_id AS studentId FROM coaching_events e JOIN artworks a ON a.id = e.artwork_id WHERE e.id = ?`).bind(input.eventId).first<EventOwner>();
  if (duplicate) return { ok: false, reason: duplicate.artworkId === input.artworkId && duplicate.studentId === input.studentId ? "already_recorded" : "not_found" };

  const versionId = storageId("version");
  const imageKey = `students/${input.studentId}/artworks/${input.artworkId}/coaching/${input.eventId}-before-${storageNonce()}.${input.image.extension}`;
  try {
    await input.ARTWORKS.put(imageKey, input.image.bytes, {
      httpMetadata: { contentType: input.image.mimeType, cacheControl: "private, max-age=60" },
      customMetadata: { studentId: input.studentId, artworkId: input.artworkId, eventId: input.eventId, phase: "before", state: "committed" },
    });
  } catch {
    return { ok: false, reason: "save_failed" };
  }

  try {
    const results = await input.DB.batch([
      input.DB.prepare(`INSERT INTO coaching_events(id, artwork_id, actor, question, applied_hint, before_version_id)
        SELECT ?, a.id, 'ai', ?, ?, ? FROM artworks a
        WHERE a.id = ? AND a.student_id = ? AND a.revision = ? AND a.status <> 'complete' AND a.version_count = ?
          AND NOT EXISTS (SELECT 1 FROM coaching_events e WHERE e.id = ?)`)
        .bind(input.eventId, input.question, input.hint, versionId, input.artworkId, input.studentId, input.expectedRevision, artwork.versionCount, input.eventId),
      input.DB.prepare(`UPDATE artworks SET version_count = version_count + 1
        WHERE id = ? AND student_id = ? AND revision = ? AND status <> 'complete' AND version_count = ?
          AND EXISTS (SELECT 1 FROM coaching_events e WHERE e.id = ? AND e.artwork_id = artworks.id AND e.before_version_id = ?)`)
        .bind(input.artworkId, input.studentId, input.expectedRevision, artwork.versionCount, input.eventId, versionId),
      input.DB.prepare(`INSERT INTO artwork_versions(id, artwork_id, sequence, ops_json, image_key, reason)
        SELECT ?, a.id, ?, ?, ?, 'coaching_before' FROM artworks a
        WHERE a.id = ? AND a.student_id = ? AND a.version_count = ?
          AND EXISTS (SELECT 1 FROM coaching_events e WHERE e.id = ? AND e.artwork_id = a.id AND e.before_version_id = ?)`)
        .bind(versionId, artwork.versionCount + 1, JSON.stringify(input.document), imageKey, input.artworkId, input.studentId, artwork.versionCount + 1, input.eventId, versionId),
      input.DB.prepare(`INSERT INTO coaching_event_details(event_id, response_kind, choices_json, guide_steps_json, growth_event, current_step, status)
        SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM coaching_events e WHERE e.id = ? AND e.before_version_id = ?)`)
        .bind(input.eventId, input.responseKind, JSON.stringify(input.choices), JSON.stringify(input.guideSteps), input.growthEvent, input.currentStep, input.responseKind === "question" ? "open" : "active", input.eventId, versionId),
    ]);
    if (results.every((result) => result.meta.changes === 1)) return { ok: true, eventId: input.eventId, beforeVersionId: versionId };
  } catch {
    await input.ARTWORKS.delete(imageKey).catch(() => undefined);
    return { ok: false, reason: "save_failed" };
  }

  await input.ARTWORKS.delete(imageKey).catch(() => undefined);
  const [existingEvent, currentArtwork] = await Promise.all([
    input.DB.prepare(`SELECT e.artwork_id AS artworkId, a.student_id AS studentId FROM coaching_events e JOIN artworks a ON a.id = e.artwork_id WHERE e.id = ?`).bind(input.eventId).first<EventOwner>(),
    ownedArtwork(input.DB, input.artworkId, input.studentId),
  ]);
  if (existingEvent) return { ok: false, reason: existingEvent.artworkId === input.artworkId && existingEvent.studentId === input.studentId ? "already_recorded" : "not_found" };
  if (!currentArtwork) return { ok: false, reason: "not_found" };
  if (currentArtwork.status === "complete") return { ok: false, reason: "artwork_complete", serverRevision: currentArtwork.revision };
  return { ok: false, reason: "revision_conflict", serverRevision: currentArtwork.revision };
}

export async function recordCoachingAfter(input: {
  DB: D1Database;
  ARTWORKS: R2Bucket;
  studentId: string;
  artworkId: string;
  eventId: string;
  kind: CoachingAfterKind;
  document: DrawDocument;
  image: VersionImage;
  currentStep: number;
  answer?: string;
  newElements?: string[];
}): Promise<CoachingAfterResult> {
  const expectedKind = input.kind === "question_answer" ? "question" : "guide";
  const expectedStatus = input.kind === "question_answer" ? "open" : "active";
  const finalStatus = input.kind === "question_answer" ? "answered" : input.kind === "guide_completed" ? "completed" : "dismissed";
  const studentAnswer = input.kind === "question_answer" ? (input.answer ?? "") : input.kind === "guide_completed" ? "guide_completed" : "guide_free_exit";
  const event = await findOwnedCoachingEvent(input.DB, input.eventId, input.artworkId, input.studentId);
  if (!event || event.responseKind !== expectedKind) return { ok: false, reason: "not_found" };
  if (event.afterVersionId || event.status !== expectedStatus) return { ok: false, reason: "already_recorded" };

  const versionId = storageId("version");
  const imageKey = `students/${input.studentId}/artworks/${input.artworkId}/coaching/${input.eventId}-after-${storageNonce()}.${input.image.extension}`;
  try {
    await input.ARTWORKS.put(imageKey, input.image.bytes, {
      httpMetadata: { contentType: input.image.mimeType, cacheControl: "private, max-age=60" },
      customMetadata: { studentId: input.studentId, artworkId: input.artworkId, eventId: input.eventId, phase: "after", state: "committed" },
    });
  } catch {
    return { ok: false, reason: "save_failed" };
  }

  const serialized = JSON.stringify(input.document);
  const newElements = JSON.stringify(input.newElements ?? []);
  try {
    const results = await input.DB.batch([
      input.DB.prepare(`UPDATE coaching_events SET student_answer = ?, after_version_id = ?
        WHERE id = ? AND artwork_id = ? AND after_version_id IS NULL
        AND EXISTS (SELECT 1 FROM coaching_event_details d JOIN artworks a ON a.id = ?
          WHERE d.event_id = coaching_events.id AND d.response_kind = ? AND d.status = ? AND a.id = coaching_events.artwork_id AND a.student_id = ?)`)
        .bind(studentAnswer, versionId, input.eventId, input.artworkId, input.artworkId, expectedKind, expectedStatus, input.studentId),
      input.DB.prepare(`UPDATE coaching_event_details SET new_elements_json = ?, current_step = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE event_id = ? AND response_kind = ? AND status = ?
        AND EXISTS (SELECT 1 FROM coaching_events e WHERE e.id = ? AND e.after_version_id = ?)`)
        .bind(newElements, input.currentStep, finalStatus, input.eventId, expectedKind, expectedStatus, input.eventId, versionId),
      input.DB.prepare(`UPDATE artworks SET version_count = version_count + 1
        WHERE id = ? AND student_id = ?
        AND EXISTS (SELECT 1 FROM coaching_events e WHERE e.id = ? AND e.artwork_id = artworks.id AND e.after_version_id = ?)`)
        .bind(input.artworkId, input.studentId, input.eventId, versionId),
      input.DB.prepare(`INSERT INTO artwork_versions(id, artwork_id, sequence, ops_json, image_key, reason)
        SELECT ?, a.id, a.version_count, ?, ?, 'coaching_after' FROM artworks a
        WHERE a.id = ? AND a.student_id = ?
        AND EXISTS (SELECT 1 FROM coaching_events e WHERE e.id = ? AND e.artwork_id = a.id AND e.after_version_id = ?)`)
        .bind(versionId, serialized, imageKey, input.artworkId, input.studentId, input.eventId, versionId),
    ]);
    if (!results[0]?.meta.changes) {
      await input.ARTWORKS.delete(imageKey).catch(() => undefined);
      return { ok: false, reason: "already_recorded" };
    }
    return { ok: true, eventId: input.eventId, afterVersionId: versionId };
  } catch {
    await input.ARTWORKS.delete(imageKey).catch(() => undefined);
    return { ok: false, reason: "save_failed" };
  }
}
