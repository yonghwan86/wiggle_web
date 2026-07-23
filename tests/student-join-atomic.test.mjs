import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function joinRequest(ip = "203.0.113.40") {
  return {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json", "cf-connecting-ip": ip },
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
  const switchProfile = route.slice(route.indexOf('if (action === "switchProfile")'), route.indexOf('if (action === "recover")'));
  const recover = route.slice(route.indexOf('if (action === "recover")'));
  assert.match(join, /const \[pictureHash, personalQrHash, device\] = await Promise\.all/);
  assert.match(join, /const joinResults = await db\.batch\(\[[\s\S]*student_profiles[\s\S]*recovery_credentials[\s\S]*device_sessions[\s\S]*\]\)/);
  assert.match(join, /student_profiles[^`]*SELECT \?, \?, \?, \?, \? WHERE EXISTS \(SELECT 1 FROM classrooms WHERE id = \? AND active = 1 AND admission_open = 1\)/);
  assert.match(join, /recovery_credentials[^`]*WHERE EXISTS \(SELECT 1 FROM student_profiles WHERE id = \? AND classroom_id = \? AND archived_at IS NULL\)/);
  assert.match(join, /device_sessions[^`]*WHERE EXISTS \(SELECT 1 FROM student_profiles WHERE id = \? AND classroom_id = \? AND archived_at IS NULL\)/);
  assert.match(join, /if \(!joinResults\[0\]\?\.meta\.changes\)[\s\S]*return jsonError\("입장이 닫혔어요\. 선생님께 확인해 주세요\.", 403\)/);
  assert.doesNotMatch(join, /issueDeviceSession/);
  assert.match(route, /INSERT INTO device_sessions[^`]*WHERE EXISTS \(SELECT 1 FROM student_profiles s JOIN classrooms c ON c\.id = s\.classroom_id WHERE s\.id = \? AND s\.archived_at IS NULL AND c\.active = 1\)/);
  assert.match(route, /if \(!inserted\.meta\.changes\) return null/);
  assert.match(switchProfile, /const device = await issueDeviceSession\(candidate\.id\);[\s\S]*if \(!device\) return jsonError\("이 학급은 더 이상 이용할 수 없어요\. 선생님께 확인해 주세요\.", 403\)/);
  assert.match(recover, /const device = await issueDeviceSession\(student\.id\);[\s\S]*if \(!device\) return jsonError\("이 학급은 더 이상 이용할 수 없어요\. 선생님께 확인해 주세요\.", 403\)/);
  assert.equal((route.match(/const device = await issueDeviceSession\(/g) ?? []).length, 2);
});

test("join returns 403 without residue when the atomic classroom guard loses", async (context) => {
  const miniflare = new Miniflare({
    modules: true,
    modulesRoot: "./dist/server",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    scriptPath: "./dist/server/index.js",
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: `join-delete-race-${randomUUID()}` },
    r2Buckets: ["ARTWORKS"],
  });
  context.after(() => miniflare.dispose());

  const initialized = await miniflare.dispatchFetch("http://localhost/api/student", {
    method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ action: "unsupported" }),
  });
  assert.equal(initialized.status, 400);

  const DB = await miniflare.getD1Database("DB");
  await DB.batch([
    DB.prepare("INSERT INTO teachers(id, email, display_name) VALUES ('teacher_race', 'race@example.com', 'Race')"),
    DB.prepare("INSERT INTO classrooms(id, teacher_id, display_name, class_code, join_token) VALUES ('class_race', 'teacher_race', 'Race class', '4999', 'join_race')"),
    DB.prepare("CREATE TRIGGER close_class_before_join BEFORE INSERT ON student_profiles BEGIN SELECT RAISE(IGNORE); END"),
  ]);

  const response = await miniflare.dispatchFetch("http://localhost/api/student", joinRequest("203.0.113.41"));
  assert.equal(response.status, 403);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await response.json(), { error: "입장이 닫혔어요. 선생님께 확인해 주세요." });
  for (const table of ["student_profiles", "recovery_credentials", "device_sessions"]) assert.equal(await count(DB, table), 0, table);
});

test("profile switch and recovery return 403 when their atomic active-class guard loses", async (context) => {
  const miniflare = new Miniflare({
    modules: true,
    modulesRoot: "./dist/server",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    scriptPath: "./dist/server/index.js",
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: `session-delete-race-${randomUUID()}` },
    r2Buckets: ["ARTWORKS"],
  });
  context.after(() => miniflare.dispose());

  const initialized = await miniflare.dispatchFetch("http://localhost/api/student", {
    method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ action: "unsupported" }),
  });
  assert.equal(initialized.status, 400);

  const DB = await miniflare.getD1Database("DB");
  await DB.batch([
    DB.prepare("INSERT INTO teachers(id, email, display_name) VALUES ('teacher_session_race', 'session-race@example.com', 'Session race')"),
    DB.prepare("INSERT INTO classrooms(id, teacher_id, display_name, class_code, join_token) VALUES ('class_session_race', 'teacher_session_race', 'Session race class', '4999', 'join_session_race')"),
  ]);

  const initialRequest = joinRequest("203.0.113.42");
  const initialBody = JSON.parse(initialRequest.body);
  const joined = await miniflare.dispatchFetch("http://localhost/api/student", initialRequest);
  assert.equal(joined.status, 201);
  const joinedPayload = await joined.json();
  await DB.batch([
    DB.prepare("UPDATE device_sessions SET revoked_at = CURRENT_TIMESTAMP"),
    DB.prepare("CREATE TRIGGER close_class_before_session BEFORE INSERT ON device_sessions BEGIN SELECT RAISE(IGNORE); END"),
  ]);

  const switchIp = "203.0.113.43";
  const switched = await miniflare.dispatchFetch("http://localhost/api/student", {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json", "cf-connecting-ip": switchIp },
    body: JSON.stringify({ action: "switchProfile", studentId: joinedPayload.student.id, picturePassword: initialBody.picturePassword }),
  });
  assert.equal(switched.status, 403);
  assert.deepEqual(await switched.json(), { error: "이 학급은 더 이상 이용할 수 없어요. 선생님께 확인해 주세요." });
  assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM device_sessions WHERE revoked_at IS NULL").first()).count, 0);

  await DB.batch([
    DB.prepare("DROP TRIGGER close_class_before_session"),
    DB.prepare("UPDATE classrooms SET active = 1, admission_open = 0 WHERE id = 'class_session_race'"),
    DB.prepare("CREATE TRIGGER close_class_before_session BEFORE INSERT ON device_sessions BEGIN SELECT RAISE(IGNORE); END"),
  ]);
  const recoverIp = "203.0.113.44";
  const recovered = await miniflare.dispatchFetch("http://localhost/api/student", {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json", "cf-connecting-ip": recoverIp },
    body: JSON.stringify({ action: "recover", classCode: "4999", nickname: initialBody.nickname, animal: initialBody.animal, picturePassword: initialBody.picturePassword }),
  });
  assert.equal(recovered.status, 403);
  assert.deepEqual(await recovered.json(), { error: "이 학급은 더 이상 이용할 수 없어요. 선생님께 확인해 주세요." });
  assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM device_sessions WHERE revoked_at IS NULL").first()).count, 0);
});
