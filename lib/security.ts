import "server-only";
import { pbkdf2 } from "node:crypto";
import { cookies } from "next/headers";
import { bindings, ensureSchema } from "@/db/runtime";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { id, sha256 } from "@/lib/token-crypto";

export { id, randomToken, sha256 } from "@/lib/token-crypto";
export { normalizePicturePassword, picturePasswordLength } from "@/lib/picture-password";

export const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_BYTES = 32;

export async function deriveSecret(value: string, salt: string) {
  const key = await new Promise<Buffer>((resolve, reject) => {
    pbkdf2(value, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_BYTES, "sha256", (error, derivedKey) => {
      if (error) reject(error); else resolve(derivedKey);
    });
  });
  return key.toString("hex");
}

function equalConstantTime(left: string, right: string) {
  if (left.length !== right.length) return false;
  let value = 0;
  for (let i = 0; i < left.length; i += 1) value |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return value === 0;
}

export async function verifySecret(value: string, salt: string, expected: string) {
  return equalConstantTime(await deriveSecret(value, salt), expected);
}

export type TeacherIdentity = { id: string; email: string; displayName: string; source: "siwc" | "local" };

async function chatGPTTeacher(): Promise<TeacherIdentity | null> {
  const user = await getChatGPTUser();
  if (!user?.email) return null;
  await ensureSchema();
  const email = user.email.trim().toLowerCase().slice(0, 160);
  const displayName = (user.displayName || email).trim().slice(0, 80);
  const teacherId = id("teacher");
  await bindings().DB.prepare(
    `INSERT INTO teachers(id, email, display_name, credential_hash, credential_salt) VALUES (?, ?, ?, '', '') ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name`,
  ).bind(teacherId, email, displayName).run();
  const row = await bindings().DB.prepare(`SELECT id, email, display_name AS displayName FROM teachers WHERE email = ?`).bind(email).first<{ id: string; email: string; displayName: string }>();
  return row ? { ...row, source: "siwc" } : null;
}

export async function requireTeacher(): Promise<TeacherIdentity | null> {
  await ensureSchema();
  const hosted = await chatGPTTeacher();
  if (hosted) return hosted;
  const token = (await cookies()).get("wiggle_teacher")?.value;
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const row = await bindings().DB.prepare(
    `SELECT t.id, t.email, t.display_name AS displayName FROM teacher_sessions s JOIN teachers t ON t.id = s.teacher_id WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(tokenHash, now).first<{ id: string; email: string; displayName: string }>();
  if (row) await bindings().DB.prepare(`UPDATE teacher_sessions SET last_used_at = ? WHERE token_hash = ?`).bind(now, tokenHash).run();
  return row ? { ...row, source: "local" } : null;
}

export function isLocalDemoRequest(request: Request) {
  if (process.env.NODE_ENV === "production") return false;
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export async function revokeTeacherSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("wiggle_teacher")?.value;
  if (token) await bindings().DB.prepare(`DELETE FROM teacher_sessions WHERE token_hash = ?`).bind(await sha256(token)).run();
  cookieStore.delete("wiggle_teacher");
}

export async function studentFromRequest(request: Request) {
  await ensureSchema();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const row = await bindings().DB.prepare(
    `SELECT s.id, s.classroom_id AS classroomId, s.nickname, s.animal, c.display_name AS classroomName FROM device_sessions d JOIN student_profiles s ON s.id = d.student_id JOIN classrooms c ON c.id = s.classroom_id WHERE d.token_hash = ? AND d.expires_at > ? AND d.revoked_at IS NULL`,
  ).bind(tokenHash, now).first<{ id: string; classroomId: string; nickname: string; animal: string; classroomName: string }>();
  if (row) {
    await bindings().DB.batch([
      bindings().DB.prepare(`UPDATE device_sessions SET last_used_at = ? WHERE token_hash = ?`).bind(now, tokenHash),
      bindings().DB.prepare(`UPDATE student_profiles SET last_activity_at = ? WHERE id = ?`).bind(now, row.id),
    ]);
  }
  return row ?? null;
}

export function jsonError(message: string, status = 400) {
  return noStoreJson({ error: message }, { status });
}

export function noStoreJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("pragma", "no-cache");
  return Response.json(data, { ...init, headers });
}

export function cleanText(value: unknown, max: number) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;
  return !origin || origin === new URL(request.url).origin;
}

export async function rateLimit(key: string, max: number, seconds: number) {
  await ensureSchema();
  const db = bindings().DB;
  const now = new Date();
  const current = await db.prepare(`SELECT count, window_ends_at AS windowEndsAt FROM rate_limits WHERE key = ?`).bind(key).first<{ count: number; windowEndsAt: string }>();
  if (!current || new Date(current.windowEndsAt) <= now) {
    const ends = new Date(now.getTime() + seconds * 1000).toISOString();
    await db.prepare(`INSERT INTO rate_limits(key, count, window_ends_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_ends_at = excluded.window_ends_at`).bind(key, ends).run();
    return true;
  }
  if (current.count >= max) return false;
  await db.prepare(`UPDATE rate_limits SET count = count + 1 WHERE key = ?`).bind(key).run();
  return true;
}
