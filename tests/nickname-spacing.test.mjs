import assert from "node:assert/strict";
import { pbkdf2Sync, randomUUID } from "node:crypto";
import test from "node:test";
import { Miniflare } from "miniflare";
import { nicknameKeySql, nicknameMatchKey, nicknameRateKeyPart } from "../lib/nickname.ts";
import { FALLBACK_NICKNAME, NICKNAME_IDEAS, pickDifferentNickname } from "../lib/nickname-ideas.ts";

const ANIMALS = ["🐰", "🐻", "🦊", "🐯", "🐼", "🐶", "🐱", "🐨", "🦁", "🐸"];

function makeMiniflare(name) {
  return new Miniflare({
    modules: true,
    modulesRoot: "./dist/server",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    scriptPath: "./dist/server/index.js",
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: `${name}-${randomUUID()}` },
    r2Buckets: ["ARTWORKS"],
  });
}

function studentRequest(body, ip = "203.0.113.60") {
  return {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  };
}

async function initSchema(miniflare) {
  const initialized = await miniflare.dispatchFetch("http://localhost/api/student", studentRequest({ action: "unsupported" }));
  assert.equal(initialized.status, 400);
}

async function seedClassroom(DB, suffix) {
  await DB.batch([
    DB.prepare(`INSERT INTO teachers(id, email, display_name) VALUES ('teacher_${suffix}', '${suffix}@example.com', 'Spacing')`),
    DB.prepare(`INSERT INTO classrooms(id, teacher_id, display_name, class_code, join_token) VALUES ('class_${suffix}', 'teacher_${suffix}', '공백 학급', '4321', 'join_${suffix}')`),
  ]);
  return "class_" + suffix;
}

test("nickname match key ignores every whitespace difference but never merges different Korean characters", () => {
  assert.equal(nicknameMatchKey("토끼 화가"), "토끼화가");
  assert.equal(nicknameMatchKey("  토끼   화가  "), "토끼화가");
  assert.equal(nicknameMatchKey("토끼\t화가"), "토끼화가");
  assert.equal(nicknameMatchKey("토끼 화가"), "토끼화가");
  assert.equal(nicknameMatchKey("토끼　화가"), "토끼화가");
  assert.notEqual(nicknameMatchKey("토기 화가"), nicknameMatchKey("토끼 화가"));
  assert.equal(nicknameRateKeyPart("  Rabbit  화가 "), "rabbit화가");
  // SQL 식은 저장된 별명에서 같은 공백 집합을 지운다. migration 없이 기존 행을 찾는 근거.
  for (const escaped of ["' '", "CHAR(9)", "CHAR(10)", "CHAR(13)", "CHAR(160)", "CHAR(12288)"]) {
    assert.ok(nicknameKeySql("nickname").includes(escaped), escaped);
  }
});

test("every animal offers at least 10 unique, easy-to-read nickname ideas", () => {
  const allKeys = new Set();
  for (const animal of ANIMALS) {
    const ideas = NICKNAME_IDEAS[animal];
    assert.ok(Array.isArray(ideas), `${animal} has ideas`);
    assert.ok(ideas.length >= 10, `${animal} has ${ideas.length} ideas`);
    for (const idea of ideas) {
      // 초등학생이 읽기 쉬운 한글 낱말과 단일 공백만 사용하고, 입력 상한 16자를 넘지 않는다.
      assert.match(idea, /^[가-힣]+( [가-힣]+)*$/, idea);
      assert.ok(idea.length >= 2 && idea.length <= 16, idea);
      // 공백을 지운 비교 기준으로도 전체 후보가 서로 다른 별명이어야 한다.
      const key = nicknameRateKeyPart(idea);
      assert.ok(!allKeys.has(key), `duplicate idea: ${idea}`);
      allKeys.add(key);
    }
  }
  assert.equal(Object.keys(NICKNAME_IDEAS).length, ANIMALS.length);
});

test("the dice never repeats the current nickname and cycles through far more than two ideas", () => {
  for (const animal of ANIMALS) {
    const ideas = NICKNAME_IDEAS[animal];
    for (const current of ideas) {
      const seen = new Set();
      for (let step = 0; step < 100; step += 1) {
        const next = pickDifferentNickname(ideas, current, step / 100);
        assert.notEqual(next, current, `${animal} repeated ${current}`);
        assert.ok(ideas.includes(next));
        seen.add(next);
      }
      assert.equal(seen.size, ideas.length - 1, `${animal} from ${current} reaches every other idea`);
    }
  }
  // 연속으로 눌러도 두 별명만 왕복하지 않는다: 결정적 roll 순서로 6번 눌러 4개 이상 등장.
  const ideas = NICKNAME_IDEAS["🐰"];
  let current = ideas[0];
  const sequence = [];
  const rolls = [0.05, 0.35, 0.65, 0.95, 0.15, 0.55];
  for (const roll of rolls) {
    current = pickDifferentNickname(ideas, current, roll);
    sequence.push(current);
  }
  assert.ok(new Set(sequence).size >= 4, sequence.join(", "));
  for (let i = 1; i < sequence.length; i += 1) assert.notEqual(sequence[i], sequence[i - 1]);
  // 후보가 하나뿐인 경계에서도 현재 별명을 그대로 돌려주지 않는다.
  assert.equal(pickDifferentNickname(["토끼 화가"], "토끼 화가", 0.5), FALLBACK_NICKNAME);
  assert.equal(pickDifferentNickname(["가", "나"], "가", 1), "나");
});

test("spacing variants re-enter the same student and are blocked as duplicate new profiles", async (context) => {
  const miniflare = makeMiniflare("nickname-spacing");
  context.after(() => miniflare.dispose());
  await initSchema(miniflare);
  const DB = await miniflare.getD1Database("DB");
  await seedClassroom(DB, "spacing");

  const password = ["⭐", "🍎", "🚲"];
  const joined = await miniflare.dispatchFetch("http://localhost/api/student", studentRequest({ action: "join", entry: "4321", nickname: "토끼 화가", animal: "🐰", picturePassword: password }, "203.0.113.61"));
  assert.equal(joined.status, 201);
  const original = await joined.json();
  assert.equal(original.student.nickname, "토끼 화가");

  // 공백 제거·연속 공백·탭 변형 모두 같은 학생으로 재입장한다.
  for (const variant of ["토끼화가", "  토끼   화가  ", "토끼\t화가"]) {
    const recovered = await miniflare.dispatchFetch("http://localhost/api/student", studentRequest({ action: "recover", entry: "4321", nickname: variant, animal: "🐰", picturePassword: password }, "203.0.113.62"));
    assert.equal(recovered.status, 200, variant);
    const payload = await recovered.json();
    assert.equal(payload.student.id, original.student.id, variant);
    assert.equal(payload.student.nickname, "토끼 화가", "display nickname keeps its original spacing");
  }

  // 공백 변형 신규 생성은 기존 프로필 중복으로 차단된다.
  const duplicate = await miniflare.dispatchFetch("http://localhost/api/student", studentRequest({ action: "join", entry: "4321", nickname: "토끼화가", animal: "🐰", picturePassword: ["⭐", "⭐", "⭐"] }, "203.0.113.63"));
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, "PROFILE_EXISTS");

  // 같은 그림 비밀번호까지 같으면 allowDuplicate여도 동일 자격정보로 차단된다.
  const sameCredentials = await miniflare.dispatchFetch("http://localhost/api/student", studentRequest({ action: "join", entry: "4321", nickname: "토끼  화가", animal: "🐰", picturePassword: password, allowDuplicate: true }, "203.0.113.64"));
  assert.equal(sameCredentials.status, 409);
  assert.equal((await sameCredentials.json()).code, "PROFILE_CREDENTIALS_EXIST");

  // 다른 그림 비밀번호의 의도적 중복 생성은 그대로 허용된다.
  const allowedDuplicate = await miniflare.dispatchFetch("http://localhost/api/student", studentRequest({ action: "join", entry: "4321", nickname: "토끼화가", animal: "🐰", picturePassword: ["🌈", "🌈", "🌈"], allowDuplicate: true }, "203.0.113.65"));
  assert.equal(allowedDuplicate.status, 201);

  // 다른 동물이면 같은 별명이라도 새 프로필이고, 다른 한글 글자는 합쳐지지 않는다.
  const otherAnimal = await miniflare.dispatchFetch("http://localhost/api/student", studentRequest({ action: "join", entry: "4321", nickname: "토끼화가", animal: "🐻", picturePassword: ["⭐", "⭐", "⭐"] }, "203.0.113.66"));
  assert.equal(otherAnimal.status, 201);
  const differentHangul = await miniflare.dispatchFetch("http://localhost/api/student", studentRequest({ action: "join", entry: "4321", nickname: "토기 화가", animal: "🐰", picturePassword: ["⭐", "⭐", "⭐"] }, "203.0.113.67"));
  assert.equal(differentHangul.status, 201);

  assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM student_profiles").first()).count, 4);
});

test("a pre-existing DB profile with spaces is found by spaceless re-entry without any migration", async (context) => {
  const miniflare = makeMiniflare("nickname-legacy");
  context.after(() => miniflare.dispose());
  await initSchema(miniflare);
  const DB = await miniflare.getD1Database("DB");
  await seedClassroom(DB, "legacy");

  // 새 코드 이전에 저장된 행을 흉내 낸다: API를 거치지 않고 D1에 직접 넣는다.
  const salt = "legacysalt";
  const pictureHash = pbkdf2Sync("⭐→⭐→⭐", salt, 100_000, 32, "sha256").toString("hex");
  await DB.batch([
    DB.prepare(`INSERT INTO student_profiles(id, classroom_id, nickname, animal, last_activity_at) VALUES ('student_legacy', 'class_legacy', '아기 곰 화가', '🐻', '2026-08-01T00:00:00.000Z')`),
    DB.prepare(`INSERT INTO recovery_credentials(student_id, picture_hash, picture_salt, personal_qr_hash) VALUES ('student_legacy', ?, ?, 'legacy_qr_hash')`).bind(pictureHash, salt),
  ]);

  const recovered = await miniflare.dispatchFetch("http://localhost/api/student", studentRequest({ action: "recover", entry: "4321", nickname: "아기곰화가", animal: "🐻", picturePassword: ["⭐", "⭐", "⭐"] }, "203.0.113.70"));
  assert.equal(recovered.status, 200);
  const payload = await recovered.json();
  assert.equal(payload.student.id, "student_legacy");
  assert.equal(payload.student.nickname, "아기 곰 화가");

  // 틀린 비밀번호는 공백 변형으로도 열리지 않는다.
  const wrongPassword = await miniflare.dispatchFetch("http://localhost/api/student", studentRequest({ action: "recover", entry: "4321", nickname: "아기곰화가", animal: "🐻", picturePassword: ["🍎", "🍎", "🍎"] }, "203.0.113.71"));
  assert.equal(wrongPassword.status, 401);
});

test("spacing variants share one brute-force bucket so spacing cannot bypass the rate limit", async (context) => {
  const miniflare = makeMiniflare("nickname-ratelimit");
  context.after(() => miniflare.dispose());
  await initSchema(miniflare);
  const DB = await miniflare.getD1Database("DB");
  await seedClassroom(DB, "ratelimit");

  const password = ["⭐", "🍎", "🚲"];
  const joined = await miniflare.dispatchFetch("http://localhost/api/student", studentRequest({ action: "join", entry: "4321", nickname: "토끼 화가", animal: "🐰", picturePassword: password }, "203.0.113.80"));
  assert.equal(joined.status, 201);

  // 대상별 한도는 8회/15분. 공백 변형을 번갈아 써도 같은 버킷을 소비해야 한다.
  const variants = ["토끼 화가", "토끼화가", " 토끼  화가 "];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const failed = await miniflare.dispatchFetch("http://localhost/api/student", studentRequest({ action: "recover", entry: "4321", nickname: variants[attempt % variants.length], animal: "🐰", picturePassword: ["🌙", "🌙", "🌙"] }, "203.0.113.81"));
    assert.equal(failed.status, 401, `attempt ${attempt}`);
  }
  // 9번째는 올바른 비밀번호여도 공백 변형이어도 잠긴다.
  const blockedRecover = await miniflare.dispatchFetch("http://localhost/api/student", studentRequest({ action: "recover", entry: "4321", nickname: "토끼화가", animal: "🐰", picturePassword: password }, "203.0.113.82"));
  assert.equal(blockedRecover.status, 429);
  // 중복 생성 분기의 비밀번호 대조(409 오라클)도 같은 버킷으로 잠긴다.
  const blockedProbe = await miniflare.dispatchFetch("http://localhost/api/student", studentRequest({ action: "join", entry: "4321", nickname: "토끼화가", animal: "🐰", picturePassword: password, allowDuplicate: true }, "203.0.113.83"));
  assert.equal(blockedProbe.status, 429);
});
