import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const EXPECTED_HEX = "8507895fd4f3c23f16a2fd73133060f1cb36897fceed3f8efe3c52884d10f25b";

// 예전에는 workerd를 띄워 그 런타임의 pbkdf2를 확인했지만, 이제 실행 런타임이 Node라
// 앱이 실제로 쓰는 파생 함수를 그대로 불러 검증한다. 표식 패키지(server-only)는 하네스
// 별칭 훅이 이미 빈 모듈로 바꿔 주지만, lib/security.ts에는 Next 해석기만 풀 수 있는
// 지정자가 둘 남아 있어 여기서 메운다 — `next/headers`(exports 맵에 없는 하위 경로)와
// 확장자 없는 상대 경로(`./client-ip`, TS는 풀지만 Node 타입 스트리핑은 거부한다).
// 쿠키 API는 호출하지 않고 파생·검증 함수만 쓴다.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier === "next/headers") return nextResolve("next/headers.js", context);
      if (specifier.startsWith("./")) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});
const { PBKDF2_ITERATIONS, deriveSecret, verifySecret } = await import("../lib/security.ts");

test("node:crypto preserves the capped 100k PBKDF2-SHA256 fixed vector through deriveSecret", async () => {
  // 고정 벡터를 앱 함수에 직접 물린다. 반복 횟수·키 길이·해시 중 하나라도 흔들리면
  // 이미 저장된 그림 비밀번호 해시가 통째로 검증 불가가 되므로 여기서 먼저 깨져야 한다.
  assert.equal(PBKDF2_ITERATIONS, 100_000);
  assert.equal(await deriveSecret("wiggle-password", "student-salt"), EXPECTED_HEX);
  assert.equal((await deriveSecret("wiggle-password", "student-salt")).length, 64);
});

test("derivation is deterministic and salt-separated, and verification separates right from wrong", async () => {
  const derived = await deriveSecret("wiggle-password", "student-salt");
  assert.equal(await deriveSecret("wiggle-password", "student-salt"), derived);
  // 같은 비밀번호라도 salt가 다르면 해시가 갈려야 한다 — 학생마다 salt를 따로 두는 이유다.
  assert.notEqual(await deriveSecret("wiggle-password", "other-salt"), derived);
  assert.notEqual(await deriveSecret("other-password", "student-salt"), derived);
  assert.equal(await verifySecret("wiggle-password", "student-salt", derived), true);
  assert.equal(await verifySecret("other-password", "student-salt", derived), false);
  assert.equal(await verifySecret("wiggle-password", "other-salt", derived), false);
  // 길이가 어긋나는 기대값은 비교 루프에 들어가기 전에 걸러져야 한다.
  assert.equal(await verifySecret("wiggle-password", "student-salt", derived.slice(0, 63)), false);
  assert.equal(await verifySecret("wiggle-password", "student-salt", `${derived}0`), false);
});

test("server crypto keeps the node:crypto PBKDF2 contract", async () => {
  // Worker 설정(nodejs_compat) 단언은 런타임이 Node로 바뀌며 검증 대상이 사라져 제거했다.
  const security = await read("../lib/security.ts");
  assert.match(security, /import "server-only"/);
  assert.match(security, /pbkdf2\(value, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_BYTES, "sha256"/);
  assert.match(security, /PBKDF2_ITERATIONS = 100_000/);
  assert.doesNotMatch(security, /120_000|120000/);
  assert.match(security, /PBKDF2_KEY_BYTES = 32/);
  assert.doesNotMatch(security, /crypto\.subtle|deriveBits/);
});
