import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function joinRequest() {
  return {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json", "cf-connecting-ip": "203.0.113.40" },
    body: JSON.stringify({ action: "join", entry: "4999", nickname: "토끼화가", animal: "🐰", picturePassword: ["⭐", "⭐", "⭐"] }),
  };
}

async function count(DB, table) {
  return (await DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first()).count;
}

test("a failed device-session insert rolls back the entire join and a retry creates one profile", async (context) => {
  const miniflare = new Miniflare({
    modules: true,
    modulesRoot: "./dist/server",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    scriptPath: "./dist/server/index.js",
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: `join-atomic-${randomUUID()}` },
    r2Buckets: ["ARTWORKS"],
  });
  context.after(() => miniflare.dispose());

  const initialized = await miniflare.dispatchFetch("http://localhost/api/student", {
    method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ action: "unsupported" }),
  });
  assert.equal(initialized.status, 400);

  const DB = await miniflare.getD1Database("DB");
  await DB.batch([
    DB.prepare("INSERT INTO teachers(id, email, display_name) VALUES ('teacher_atomic', 'atomic@example.com', 'Atomic')"),
    DB.prepare("INSERT INTO classrooms(id, teacher_id, display_name, class_code, join_token) VALUES ('class_atomic', 'teacher_atomic', '원자성 반', '4999', 'join_atomic')"),
    DB.prepare("CREATE TRIGGER fail_device_session BEFORE INSERT ON device_sessions BEGIN SELECT RAISE(ABORT, 'forced device session failure'); END"),
  ]);

  const failed = await miniflare.dispatchFetch("http://localhost/api/student", joinRequest());
  assert.equal(failed.status, 500);
  assert.match(failed.headers.get("content-type") ?? "", /application\/json/);
  assert.match(failed.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await failed.json(), { error: "입장을 처리하지 못했어요. 잠시 뒤 다시 해 주세요." });
  for (const table of ["student_profiles", "recovery_credentials", "device_sessions"]) assert.equal(await count(DB, table), 0, table);

  await DB.prepare("DROP TRIGGER fail_device_session").run();
  const retried = await miniflare.dispatchFetch("http://localhost/api/student", joinRequest());
  assert.equal(retried.status, 201);
  const payload = await retried.json();
  assert.equal(payload.student.nickname, "토끼화가");
  assert.ok(payload.deviceToken);
  for (const table of ["student_profiles", "recovery_credentials", "device_sessions"]) assert.equal(await count(DB, table), 1, table);
});

test("join batches all three inserts while switch and recovery retain session issuance", async () => {
  const route = await read("../app/api/student/route.ts");
  const join = route.slice(route.indexOf('if (action === "join")'), route.indexOf('if (action === "switchProfile")'));
  assert.match(join, /const \[pictureHash, personalQrHash, device\] = await Promise\.all/);
  assert.match(join, /await db\.batch\(\[[\s\S]*student_profiles[\s\S]*recovery_credentials[\s\S]*device\.insert[\s\S]*\]\)/);
  assert.doesNotMatch(join, /issueDeviceSession/);
  assert.equal((route.match(/const device = await issueDeviceSession\(/g) ?? []).length, 2);
});
