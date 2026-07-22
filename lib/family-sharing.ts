import { id, randomToken, sha256 } from "./token-crypto.ts";

const tokenPattern = /^[A-Za-z0-9_-]{32,160}$/;
export const FAMILY_SESSION_COOKIE = "wiggle_family";
export const FAMILY_SHARE_MAX_ARTWORKS = 12;
export const FAMILY_SHARE_MAX_DAYS = 30;
export const FAMILY_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const FAMILY_INITIAL_INVITE_TTL_SECONDS = 10 * 60;
export const FAMILY_HANDOFF_TTL_SECONDS = 10 * 60;
export const FAMILY_CONSENT_METHODS = ["paper", "in_person", "phone", "school_portal"] as const;
export type FamilyConsentMethod = (typeof FAMILY_CONSENT_METHODS)[number];

export type FamilyShareArtworkRow = { position: number; opsJson: string; finalImageKey: string };
export type ResolvedFamilyShare = {
  linkId: string;
  studentId: string;
  animal: string;
  scope: "artwork" | "bundle";
  reportStartAt: string;
  reportEndAt: string;
  expiresAt: string;
  sensitiveValues: string[];
  artworks: FamilyShareArtworkRow[];
};

export function familySecurityHeaders(headers = new Headers()) {
  headers.set("cache-control", "no-store, max-age=0"); headers.set("pragma", "no-cache"); headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff"); headers.set("x-frame-options", "DENY"); headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  headers.set("content-security-policy", "default-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  return headers;
}

export function familyJson(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, { ...init, headers: familySecurityHeaders(new Headers(init.headers)) });
}

function boundedExpiry(now: Date, ttlMs: number, linkExpiresAt: string) {
  const requested = new Date(now.getTime() + ttlMs).toISOString();
  return requested < linkExpiresAt ? requested : linkExpiresAt;
}

export function familyCookieToken(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === FAMILY_SESSION_COOKIE) {
      try { return decodeURIComponent(rest.join("=")); } catch { return ""; }
    }
  }
  return "";
}

export function familySessionCookieHeader(sessionToken: string, expiresAt: string, now = new Date()) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000));
  return `${FAMILY_SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export async function createFamilyShare(DB: D1Database, input: {
  teacherId: string;
  classroomId: string;
  studentId: string;
  artworkIds: string[];
  guardianConsentConfirmed: boolean;
  consentMethod: unknown;
  expiresInDays?: number;
  now?: Date;
  tokenFactory?: () => string;
}) {
  if (input.guardianConsentConfirmed !== true) return { ok: false as const, reason: "guardian_consent_required" as const };
  const consentMethod = String(input.consentMethod ?? "") as FamilyConsentMethod;
  if (!FAMILY_CONSENT_METHODS.includes(consentMethod)) return { ok: false as const, reason: "invalid_consent_method" as const };
  const artworkIds = [...new Set(input.artworkIds.map((value) => String(value).trim()).filter(Boolean))];
  if (!artworkIds.length || artworkIds.length > FAMILY_SHARE_MAX_ARTWORKS || artworkIds.length !== input.artworkIds.length) return { ok: false as const, reason: "invalid_scope" as const };
  const owner = await DB.prepare(`SELECT s.id FROM student_profiles s JOIN classrooms c ON c.id = s.classroom_id
    WHERE s.id = ? AND s.classroom_id = ? AND c.teacher_id = ? AND c.active = 1`).bind(input.studentId, input.classroomId, input.teacherId).first();
  if (!owner) return { ok: false as const, reason: "forbidden" as const };
  const placeholders = artworkIds.map(() => "?").join(",");
  const approved = await DB.prepare(`SELECT id FROM artworks WHERE student_id = ? AND classroom_id = ? AND status = 'complete' AND final_image_key IS NOT NULL AND id IN (${placeholders})`)
    .bind(input.studentId, input.classroomId, ...artworkIds).all<{ id: string }>();
  if (approved.results.length !== artworkIds.length) return { ok: false as const, reason: "artwork_forbidden" as const };

  const now = input.now ?? new Date(); const consentAt = now.toISOString();
  const days = Math.max(1, Math.min(FAMILY_SHARE_MAX_DAYS, Math.floor(input.expiresInDays ?? 7)));
  const expiresAt = new Date(now.getTime() + days * 86_400_000).toISOString();
  const inviteExpiresAt = boundedExpiry(now, FAMILY_INITIAL_INVITE_TTL_SECONDS * 1000, expiresAt);
  const reportStartAt = new Date(now.getTime() - 7 * 86_400_000).toISOString(); const reportEndAt = now.toISOString();
  const scope = artworkIds.length === 1 ? "artwork" : "bundle";

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const inviteToken = input.tokenFactory?.() ?? randomToken(32);
    if (!tokenPattern.test(inviteToken)) return { ok: false as const, reason: "invalid_token" as const };
    const inviteHash = await sha256(inviteToken); const linkId = id("share");
    try {
      const results = await DB.batch([
        DB.prepare(`INSERT INTO family_share_links(id, teacher_id, student_id, scope, approval_kind, guardian_consent_at, consent_method, attested_by_teacher_id, report_start_at, report_end_at, expires_at)
          SELECT ?, ?, ?, ?, 'guardian', ?, ?, ?, ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM student_profiles s JOIN classrooms c ON c.id = s.classroom_id
            WHERE s.id = ? AND s.classroom_id = ? AND c.teacher_id = ? AND c.active = 1
          )`).bind(linkId, input.teacherId, input.studentId, scope, consentAt, consentMethod, input.teacherId, reportStartAt, reportEndAt, expiresAt, input.studentId, input.classroomId, input.teacherId),
        ...artworkIds.map((artworkId, position) => DB.prepare(`INSERT INTO family_share_artworks(link_id, artwork_id, position, approved_at)
          SELECT ?, a.id, ?, ? FROM artworks a JOIN family_share_links l ON l.id = ?
          WHERE a.id = ? AND a.student_id = l.student_id AND a.classroom_id = ? AND a.status = 'complete' AND a.final_image_key IS NOT NULL
            AND l.teacher_id = ? AND l.approval_kind = 'guardian' AND l.guardian_consent_at IS NOT NULL AND l.attested_by_teacher_id = ?`)
          .bind(linkId, position, consentAt, linkId, artworkId, input.classroomId, input.teacherId, input.teacherId)),
        DB.prepare(`INSERT INTO family_share_invites(token_hash, link_id, kind, expires_at)
          SELECT ?, id, 'initial', ? FROM family_share_links WHERE id = ? AND approval_kind = 'guardian' AND guardian_consent_at IS NOT NULL AND consent_method = ? AND attested_by_teacher_id = ?`)
          .bind(inviteHash, inviteExpiresAt, linkId, consentMethod, input.teacherId),
      ]);
      if (results.some((result) => !result.meta.changes)) {
        await DB.prepare(`DELETE FROM family_share_links WHERE id = ? AND teacher_id = ?`).bind(linkId, input.teacherId).run();
        return { ok: false as const, reason: "forbidden" as const };
      }
      return { ok: true as const, linkId, inviteToken, scope, expiresAt, inviteExpiresAt };
    } catch {
      const collision = await DB.prepare(`SELECT link_id FROM family_share_invites WHERE token_hash = ?`).bind(inviteHash).first();
      if (!collision || attempt === 3) return { ok: false as const, reason: "save_failed" as const };
    }
  }
  return { ok: false as const, reason: "save_failed" as const };
}

export async function exchangeFamilyInvite(DB: D1Database, inviteToken: string, input: { now?: Date; sessionTokenFactory?: () => string } = {}) {
  if (!tokenPattern.test(inviteToken)) return { ok: false as const, reason: "invalid_invite" as const };
  const now = input.now ?? new Date(); const at = now.toISOString(); const inviteHash = await sha256(inviteToken);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const sessionToken = input.sessionTokenFactory?.() ?? randomToken(32);
    if (!tokenPattern.test(sessionToken)) return { ok: false as const, reason: "invalid_session" as const };
    const sessionHash = await sha256(sessionToken); const requestedSessionExpiry = new Date(now.getTime() + FAMILY_SESSION_TTL_MS).toISOString();
    try {
      const results = await DB.batch([
        DB.prepare(`UPDATE family_share_invites SET consumed_at = ?, consumed_session_hash = ?
          WHERE token_hash = ? AND consumed_at IS NULL AND consumed_session_hash IS NULL AND expires_at > ?
            AND EXISTS (SELECT 1 FROM family_share_links l WHERE l.id = family_share_invites.link_id AND l.revoked_at IS NULL AND l.expires_at > ?
              AND l.approval_kind = 'guardian' AND l.guardian_consent_at IS NOT NULL AND l.guardian_consent_at <> ''
              AND l.consent_method IN ('paper', 'in_person', 'phone', 'school_portal') AND l.attested_by_teacher_id = l.teacher_id)`)
          .bind(at, sessionHash, inviteHash, at, at),
        DB.prepare(`INSERT INTO family_share_sessions(token_hash, link_id, expires_at, last_used_at)
          SELECT ?, i.link_id, CASE WHEN l.expires_at < ? THEN l.expires_at ELSE ? END, ?
          FROM family_share_invites i JOIN family_share_links l ON l.id = i.link_id
          WHERE i.token_hash = ? AND i.consumed_session_hash = ? AND i.consumed_at = ? AND l.revoked_at IS NULL AND l.expires_at > ?`)
          .bind(sessionHash, requestedSessionExpiry, requestedSessionExpiry, at, inviteHash, sessionHash, at, at),
      ]);
      if (results[0]?.meta.changes && results[1]?.meta.changes) {
        const session = await DB.prepare(`SELECT expires_at AS expiresAt FROM family_share_sessions WHERE token_hash = ?`).bind(sessionHash).first<{ expiresAt: string }>();
        if (session) return { ok: true as const, sessionToken, expiresAt: session.expiresAt };
      }
      return { ok: false as const, reason: "invite_unavailable" as const };
    } catch {
      const collision = await DB.prepare(`SELECT link_id FROM family_share_sessions WHERE token_hash = ?`).bind(sessionHash).first();
      if (!collision || attempt === 3) return { ok: false as const, reason: "exchange_failed" as const };
    }
  }
  return { ok: false as const, reason: "exchange_failed" as const };
}

export async function revokeFamilyShare(DB: D1Database, input: { teacherId: string; classroomId: string; linkId: string }) {
  const result = await DB.prepare(`UPDATE family_share_links SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND teacher_id = ? AND student_id IN (
      SELECT s.id FROM student_profiles s JOIN classrooms c ON c.id = s.classroom_id WHERE s.classroom_id = ? AND c.teacher_id = ?
    ) AND revoked_at IS NULL`).bind(input.linkId, input.teacherId, input.classroomId, input.teacherId).run();
  return Boolean(result.meta.changes);
}

async function activeSessionLink(DB: D1Database, sessionToken: string, now: Date) {
  if (!tokenPattern.test(sessionToken)) return null;
  const sessionHash = await sha256(sessionToken); const at = now.toISOString();
  const touched = await DB.prepare(`UPDATE family_share_sessions SET last_used_at = ? WHERE token_hash = ? AND expires_at > ?
    AND EXISTS (SELECT 1 FROM family_share_links l WHERE l.id = family_share_sessions.link_id AND l.revoked_at IS NULL AND l.expires_at > ?
      AND l.approval_kind = 'guardian' AND l.guardian_consent_at IS NOT NULL AND l.guardian_consent_at <> ''
      AND l.consent_method IN ('paper', 'in_person', 'phone', 'school_portal') AND l.attested_by_teacher_id = l.teacher_id)`)
    .bind(at, sessionHash, at, at).run();
  if (!touched.meta.changes) return null;
  return DB.prepare(`SELECT l.id AS linkId, l.expires_at AS expiresAt FROM family_share_sessions s JOIN family_share_links l ON l.id = s.link_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND l.revoked_at IS NULL AND l.expires_at > ? AND l.approval_kind = 'guardian'`)
    .bind(sessionHash, at, at).first<{ linkId: string; expiresAt: string }>();
}

export async function createFamilyHandoffInvite(DB: D1Database, sessionToken: string, input: { now?: Date; tokenFactory?: () => string } = {}) {
  const now = input.now ?? new Date(); const active = await activeSessionLink(DB, sessionToken, now);
  if (!active) return { ok: false as const, reason: "session_invalid" as const };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const inviteToken = input.tokenFactory?.() ?? randomToken(32);
    if (!tokenPattern.test(inviteToken)) return { ok: false as const, reason: "invalid_token" as const };
    const inviteHash = await sha256(inviteToken); const expiresAt = boundedExpiry(now, FAMILY_HANDOFF_TTL_SECONDS * 1000, active.expiresAt);
    try {
      const inserted = await DB.prepare(`INSERT INTO family_share_invites(token_hash, link_id, kind, expires_at)
        SELECT ?, l.id, 'handoff', ? FROM family_share_links l WHERE l.id = ? AND l.revoked_at IS NULL AND l.expires_at > ?
          AND l.approval_kind = 'guardian' AND l.guardian_consent_at IS NOT NULL AND l.guardian_consent_at <> ''
          AND l.consent_method IN ('paper', 'in_person', 'phone', 'school_portal') AND l.attested_by_teacher_id = l.teacher_id`)
        .bind(inviteHash, expiresAt, active.linkId, now.toISOString()).run();
      if (inserted.meta.changes) return { ok: true as const, inviteToken, expiresAt };
      return { ok: false as const, reason: "session_invalid" as const };
    } catch {
      const collision = await DB.prepare(`SELECT link_id FROM family_share_invites WHERE token_hash = ?`).bind(inviteHash).first();
      if (!collision || attempt === 3) return { ok: false as const, reason: "save_failed" as const };
    }
  }
  return { ok: false as const, reason: "save_failed" as const };
}

export async function resolveFamilySession(DB: D1Database, sessionToken: string, now = new Date()): Promise<ResolvedFamilyShare | null> {
  const active = await activeSessionLink(DB, sessionToken, now); if (!active) return null;
  const at = now.toISOString();
  const counted = await DB.prepare(`UPDATE family_share_links SET view_count = view_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL AND expires_at > ?`).bind(active.linkId, at).run();
  if (!counted.meta.changes) return null;
  const link = await DB.prepare(`SELECT l.id AS linkId, l.student_id AS studentId, s.animal, l.scope,
      l.report_start_at AS reportStartAt, l.report_end_at AS reportEndAt, l.expires_at AS expiresAt,
      s.nickname, c.display_name AS classroomName, t.email AS teacherEmail
    FROM family_share_links l JOIN student_profiles s ON s.id = l.student_id JOIN classrooms c ON c.id = s.classroom_id JOIN teachers t ON t.id = l.teacher_id
    WHERE l.id = ? AND l.revoked_at IS NULL AND l.expires_at > ? AND l.approval_kind = 'guardian'
      AND l.guardian_consent_at IS NOT NULL AND l.guardian_consent_at <> ''
      AND l.consent_method IN ('paper', 'in_person', 'phone', 'school_portal') AND l.attested_by_teacher_id = l.teacher_id`)
    .bind(active.linkId, at).first<{ linkId: string; studentId: string; animal: string; scope: "artwork" | "bundle"; reportStartAt: string; reportEndAt: string; expiresAt: string; nickname: string; classroomName: string; teacherEmail: string }>();
  if (!link) return null;
  const artworks = await DB.prepare(`SELECT f.position, a.ops_json AS opsJson, a.final_image_key AS finalImageKey
    FROM family_share_artworks f JOIN artworks a ON a.id = f.artwork_id JOIN family_share_links l ON l.id = f.link_id AND l.student_id = a.student_id
    WHERE f.link_id = ? AND l.revoked_at IS NULL AND l.expires_at > ? AND a.status = 'complete' AND a.final_image_key IS NOT NULL ORDER BY f.position ASC`)
    .bind(link.linkId, at).all<FamilyShareArtworkRow>();
  if (!artworks.results.length || (link.scope === "artwork" && artworks.results.length !== 1)) return null;
  return { linkId: link.linkId, studentId: link.studentId, animal: link.animal, scope: link.scope, reportStartAt: link.reportStartAt, reportEndAt: link.reportEndAt, expiresAt: link.expiresAt, sensitiveValues: [link.nickname, link.classroomName, link.teacherEmail], artworks: artworks.results };
}
