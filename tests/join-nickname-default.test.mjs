import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const join = await readFile(new URL("../app/components/JoinClient.tsx", import.meta.url), "utf8");

test("default nickname starts from the default rabbit's first idea, not a random animal", () => {
  assert.match(join, /const \[nickname, setNickname\] = useState\(NICKNAME_IDEAS\["🐰"\]\[0\]\)/);
  assert.doesNotMatch(join, /Object\.values\(NICKNAME_IDEAS\)\.flat\(\)/);
});

test("animal click only overwrites nickname when it is still auto-generated, no follow-up effect", () => {
  // 수동 입력 뒤에는 동물을 바꿔도 별명이 조용히 덮어써지지 않도록, 이펙트가 아니라 클릭 시점 조건으로만 갱신한다.
  assert.match(
    join,
    /onClick=\{\(\) => \{ if \(nicknameAuto\) setNickname\(NICKNAME_IDEAS\[value\]\?\.\[0\] \?\? "꼬마 화가"\); setAnimal\(value\);/
  );
  assert.doesNotMatch(join, /if \(!nicknameAuto\) return;\s*\n\s*setNickname\(NICKNAME_IDEAS\[animal\]/);
});

test("typing a custom nickname stops it from being overwritten by animal changes", () => {
  assert.match(
    join,
    /onChange=\{\(event\) => \{ setNickname\(event\.target\.value\); setNicknameAuto\(false\);/
  );
});

test("다른 별명 stays auto-generated and keeps drawing from the selected animal's ideas", () => {
  assert.match(
    join,
    /function suggestNickname\(\) \{\s*\n\s*const ideas = NICKNAME_IDEAS\[animal\] \?\? \[FALLBACK_NICKNAME\];/
  );
  assert.match(join, /setNickname\(pickDifferentNickname\(ideas, nickname, Math\.random\(\)\)\);\s*\n\s*setNicknameAuto\(true\);/);
  assert.match(join, /import \{ FALLBACK_NICKNAME, NICKNAME_IDEAS, pickDifferentNickname \} from "@\/lib\/nickname-ideas";/);
});
