import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizePicturePassword, picturePasswordLength } from "../lib/picture-password.ts";

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

test("student entry uses three for join, three or four for recovery, and UI appends duplicates then removes the last", async () => {
  const [route, join] = await Promise.all([read("../app/api/student/route.ts"), read("../app/components/JoinClient.tsx")]);
  assert.match(route, /action === "join"[\s\S]*pictureLength !== 3/);
  assert.match(route, /action === "switchProfile"[\s\S]*pictureLength !== 3 && pictureLength !== 4/);
  assert.match(route, /action === "recover"[\s\S]*pictureLength !== 3 && pictureLength !== 4/);
  assert.match(route, /verifySecret\(picture, candidate\.pictureSalt, candidate\.pictureHash\)/);
  assert.match(join, /current\.length < targetLength \? \[\.\.\.current, value\]/);
  assert.match(join, /current\.slice\(0, -1\)/);
  assert.doesNotMatch(join, /pictures\.includes|current\.includes|current\.filter/);
  assert.match(join, /예전에 네 개로 만들었어요/);
  assert.match(join, /같은 그림을 여러 번/);
  assert.match(join, /한 칸 지우기/);
  assert.match(join, /현재 \$\{pictures\.length\}\/\$\{targetLength\}개 선택/);
  assert.doesNotMatch(join, /aria-pressed=\{pictures/);
});
