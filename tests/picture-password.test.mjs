import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizePicturePassword, picturePasswordLength, PICTURE_PASSWORD_LENGTH } from "../lib/picture-password.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("picture passwords use exactly three pictures and preserve order and repetition", () => {
  const repeatedThree = ["⭐", "⭐", "⭐"];
  const uniqueThree = ["🐰", "⭐", "🍎"];
  assert.equal(PICTURE_PASSWORD_LENGTH, 3);
  assert.equal(picturePasswordLength(repeatedThree), 3);
  assert.equal(normalizePicturePassword(repeatedThree), "⭐→⭐→⭐");
  assert.equal(picturePasswordLength(uniqueThree), 3);
  assert.equal(normalizePicturePassword(uniqueThree), "🐰→⭐→🍎");
});

test("picture password normalization rejects every length other than three, including four", () => {
  for (const value of [["⭐", "⭐"], ["⭐", "⭐", "⭐", "⭐"], ["⭐", "⭐", "⭐", "⭐", "⭐"], [], "⭐→⭐→⭐", null]) {
    assert.equal(picturePasswordLength(value), 0);
    assert.equal(normalizePicturePassword(value), "");
  }
});

test("student entry and recovery accept only three pictures with no four-picture fallback", async () => {
  const [passwords, route, join] = await Promise.all([read("../lib/picture-password.ts"), read("../app/api/student/route.ts"), read("../app/components/JoinClient.tsx")]);
  assert.match(route, /action === "join"[\s\S]*pictureLength !== 3/);
  assert.match(route, /action === "switchProfile"[\s\S]*pictureLength !== 3/);
  assert.match(route, /action === "recover"[\s\S]*pictureLength !== 3/);
  assert.match(route, /verifySecret\(picture, candidate\.pictureSalt, candidate\.pictureHash\)/);
  assert.match(join, /const targetLength = PICTURE_PASSWORD_LENGTH/);
  assert.match(join, /current\.length < targetLength \? \[\.\.\.current, value\]/);
  assert.match(join, /current\.slice\(0, -1\)/);
  assert.doesNotMatch(join, /pictures\.includes|current\.includes|current\.filter/);
  assert.doesNotMatch(passwords, /export const [A-Z_]+ = 4/);
  assert.doesNotMatch(join, /targetLength\s*=.*\?/);
  assert.match(join, /같은 그림을 여러 번/);
  assert.match(join, /한 칸 지우기/);
  assert.match(join, /현재 \$\{pictures\.length\}\/\$\{targetLength\}개 선택/);
  assert.doesNotMatch(join, /aria-pressed=\{pictures/);
});

test("entry offers ten animals and ten password pictures in compact five-column grids", async () => {
  const [join, css] = await Promise.all([read("../app/components/JoinClient.tsx"), read("../app/globals.css")]);
  const animals = join.match(/const ANIMALS = \[(.*?)\];/s)?.[1] ?? "";
  const pictures = join.match(/const PICTURES = \[(.*?)\] as const;/s)?.[1] ?? "";
  assert.equal((animals.match(/"[^\"]+"/g) ?? []).length, 10);
  assert.equal((pictures.match(/\{ value:/g) ?? []).length, 10);
  assert.match(join, /className="animal-choice-grid"/);
  assert.match(join, /className="picture-choice-grid"/);
  assert.doesNotMatch(join, /password-preview|qrStep|QR_STEPPER/);
  assert.match(css, /\.animal-choice-grid,\.picture-choice-grid \{ display:grid; grid-template-columns:repeat\(5,minmax\(48px,1fr\)\)/);
});
