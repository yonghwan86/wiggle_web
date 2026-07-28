import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { consumeRateLimit, releaseRateLimit } from "../lib/rate-limit.ts";

async function fixture() {
  const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok') } }", compatibilityDate: "2026-05-22", d1Databases: { DB: "rate-limit-test" } });
  const DB = await mf.getD1Database("DB");
  await DB.exec("CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, window_ends_at TEXT NOT NULL)");
  return { mf, DB };
}

test("attempts past the cap are rejected within one window", async () => {
  const { mf, DB } = await fixture();
  try {
    const now = new Date("2026-07-28T09:00:00.000Z");
    const results = [];
    for (let attempt = 0; attempt < 5; attempt += 1) results.push(await consumeRateLimit(DB, "unlock:student_a", 3, 600, now));
    assert.deepEqual(results, [true, true, true, false, false]);
  } finally { await mf.dispose(); }
});

test("a parallel burst cannot slip past the cap", async () => {
  const { mf, DB } = await fixture();
  try {
    const now = new Date("2026-07-28T09:00:00.000Z");
    // 읽고-나서-증가하는 구현이면 40개가 모두 count 0을 읽어 전부 통과한다.
    const burst = await Promise.all(Array.from({ length: 40 }, () => consumeRateLimit(DB, "unlock:student_burst", 8, 600, now)));
    assert.equal(burst.filter(Boolean).length, 8, "동시 요청에서도 허용된 시도는 정확히 상한만큼이어야 한다");
    const stored = await DB.prepare("SELECT count FROM rate_limits WHERE key = 'unlock:student_burst'").first();
    assert.equal(stored.count, 40, "모든 시도가 원자적으로 계수되어야 한다");
  } finally { await mf.dispose(); }
});

test("a window boundary burst resets the counter exactly once", async () => {
  const { mf, DB } = await fixture();
  try {
    const now = new Date("2026-07-28T09:00:00.000Z");
    for (let attempt = 0; attempt < 8; attempt += 1) await consumeRateLimit(DB, "unlock:student_window", 8, 600, now);
    assert.equal(await consumeRateLimit(DB, "unlock:student_window", 8, 600, now), false);
    const afterWindow = new Date(now.getTime() + 600_001);
    const burst = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit(DB, "unlock:student_window", 8, 600, afterWindow)));
    assert.equal(burst.filter(Boolean).length, 8, "창이 새로 열려도 상한은 그대로여야 한다");
  } finally { await mf.dispose(); }
});

test("keys are independent and a success releases only its own counter", async () => {
  const { mf, DB } = await fixture();
  try {
    const now = new Date("2026-07-28T09:00:00.000Z");
    for (let attempt = 0; attempt < 8; attempt += 1) await consumeRateLimit(DB, "unlock:student_a", 8, 600, now);
    assert.equal(await consumeRateLimit(DB, "unlock:student_a", 8, 600, now), false);
    assert.equal(await consumeRateLimit(DB, "unlock:student_b", 8, 600, now), true, "다른 학생의 시도는 막히면 안 된다");
    await releaseRateLimit(DB, "unlock:student_a");
    assert.equal(await consumeRateLimit(DB, "unlock:student_a", 8, 600, now), true, "성공 인증 뒤에는 다시 시도할 수 있어야 한다");
    const others = await DB.prepare("SELECT count FROM rate_limits WHERE key = 'unlock:student_b'").first();
    assert.equal(others.count, 1);
  } finally { await mf.dispose(); }
});

test("student entry limits separate shared classroom IP traffic from per-target guessing", async () => {
  const route = await readFile(new URL("../app/api/student/route.ts", import.meta.url), "utf8");
  // 학교 NAT 뒤 한 학급 전체가 IP 하나로 보이므로 IP 한도는 학급 규모를 견뎌야 한다.
  assert.match(route, /const IP_ENTRY_LIMIT = (\d+)/);
  assert.ok(Number(route.match(/const IP_ENTRY_LIMIT = (\d+)/)[1]) >= 120);
  assert.match(route, /const TARGET_ATTEMPT_LIMIT = (\d+)/);
  assert.ok(Number(route.match(/const TARGET_ATTEMPT_LIMIT = (\d+)/)[1]) <= 10);
  assert.match(route, /targetAllowed\(`unlock:\$\{studentId\}`\)/);
  assert.match(route, /targetAllowed\(recoverTarget\)/);
  assert.match(route, /targetAllowed\(`qr:\$\{await sha256\(personalQrToken\)\}`\)/);
  assert.match(route, /clearRateLimit\(targetKey\(`unlock:\$\{studentId\}`\)\)/);
  assert.match(route, /clearRateLimit\(targetKey\(recoverTarget\)\)/);
  assert.match(route, /rateLimit\(`student-join-class:\$\{classroom\.id\}`/);
});
