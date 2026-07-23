import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizePicturePassword, picturePasswordLength, shouldOfferLegacyPicturePassword } from "../lib/picture-password.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("new and recovered picture passwords preserve order and repeated symbols", () => {
  const repeatedThree = ["⭐", "⭐", "⭐"];
  const repeatedFour = ["🐰", "🐰", "🐰", "🐰"];
  const uniqueFour = ["🐰", "⭐", "🍎", "🚲"];
  assert.equal(picturePasswordLength(repeatedThree), 3);
  assert.equal(normalizePicturePassword(repeatedThree), "⭐→⭐→⭐");
  assert.equal(picturePasswordLength(repeatedFour), 4);
  assert.equal(normalizePicturePassword(repeatedFour), "🐰→🐰→🐰→🐰");
  assert.equal(picturePasswordLength(uniqueFour), 4);
  assert.equal(normalizePicturePassword(uniqueFour), "🐰→⭐→🍎→🚲");
});

test("picture password normalization rejects every non-legacy length", () => {
  for (const value of [["⭐", "⭐"], ["⭐", "⭐", "⭐", "⭐", "⭐"], [], "⭐→⭐→⭐", null]) {
    assert.equal(picturePasswordLength(value), 0);
    assert.equal(normalizePicturePassword(value), "");
  }
});

test("legacy recovery is offered only after an ordinary three-picture 401", () => {
  const ordinaryRecovery = { status: 401, mode: "recover", hasPersonalQrToken: false, legacyMode: false, submittedLength: 3 };
  assert.equal(shouldOfferLegacyPicturePassword(ordinaryRecovery), true);
  assert.equal(shouldOfferLegacyPicturePassword({ ...ordinaryRecovery, mode: "unlock" }), true);
  for (const input of [
    { ...ordinaryRecovery, status: 400 },
    { ...ordinaryRecovery, status: 403 },
    { ...ordinaryRecovery, status: 500 },
    { ...ordinaryRecovery, mode: "join" },
    { ...ordinaryRecovery, hasPersonalQrToken: true },
    { ...ordinaryRecovery, legacyMode: true },
    { ...ordinaryRecovery, submittedLength: 4 },
  ]) assert.equal(shouldOfferLegacyPicturePassword(input), false);
});

test("student entry keeps legacy server compatibility while hiding it from the default UI", async () => {
  const [route, join, css] = await Promise.all([read("../app/api/student/route.ts"), read("../app/components/JoinClient.tsx"), read("../app/globals.css")]);
  assert.match(route, /action === "join"[\s\S]*pictureLength !== 3/);
  assert.match(route, /action === "switchProfile"[\s\S]*pictureLength !== 3 && pictureLength !== 4/);
  assert.match(route, /action === "recover"[\s\S]*pictureLength !== 3 && pictureLength !== 4/);
  assert.match(route, /verifySecret\(picture, candidate\.pictureSalt, candidate\.pictureHash\)/);
  assert.match(join, /current\.length < targetLength \? \[\.\.\.current, value\]/);
  assert.match(join, /current\.slice\(0, -1\)/);
  assert.doesNotMatch(join, /pictures\.includes|current\.includes|current\.filter/);
  assert.doesNotMatch(join, /예전에 네 개로 만들었어요|legacy-password-toggle|type="checkbox"/);
  assert.match(join, /비밀번호가 네 개였나요\?/);
  assert.match(join, /비밀번호 세 개로 돌아가기/);
  assert.match(join, /setLegacyOffer\(shouldOfferLegacyPicturePassword\(\{ status: response\.status, mode, hasPersonalQrToken: Boolean\(recoveryToken\), legacyMode: legacyPassword, submittedLength: pictures\.length \}\)\)/);
  assert.match(join, /if \(recoveryToken \|\| \(mode !== "unlock" && mode !== "recover"\) \|\| \(!legacyOffer && !legacyPassword\)\) return null/);
  assert.ok((join.match(/setLegacyOffer\(false\)/g) ?? []).length >= 3);
  assert.match(join, /같은 그림을 여러 번/);
  assert.match(join, /한 칸 지우기/);
  assert.match(join, /현재 \$\{pictures\.length\}\/\$\{targetLength\}개 선택/);
  assert.doesNotMatch(join, /aria-pressed=\{pictures/);
  assert.match(css, /\.legacy-password-action \{[^}]*min-height:44px;[^}]*max-width:100%;[^}]*white-space:normal;[^}]*overflow-wrap:break-word;/);
});
