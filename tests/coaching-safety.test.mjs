import assert from "node:assert/strict";
import test from "node:test";
import { isChildSafeCoachingText } from "../lib/openai-coaching.ts";

const praise = [
  "우와, 정말 멋있다! 여기는 뭐야?",
  "그림이 멋있어요",
  "와, 이쁘다!",
  "이쁜 색이네",
  "잘 그린 그림이네",
  "정말 잘 그리고 있어",
  "진짜 짱이야",
  "멋진 그림이야",
  "정말 멋져",
  "잘 그렸어요",
  "예쁘게 그렸네",
  "참 잘했어요",
];

const spacingTricks = [
  "멋 있 다",
  "이 쁘 다",
  "잘. 그린. 그림",
];

const allowed = [
  "여기에 무엇을 더 그리고 싶어?",
  "동그라미를 하나 더 그려 볼래?",
  "어떤 색을 골랐어?",
  "다음에는 무엇을 더할까?",
  "지붕 위에 선을 하나 이어 봐.",
];

test("Korean praise judgments are rejected in every common inflection", () => {
  for (const text of praise) assert.equal(isChildSafeCoachingText(text), false, `허용되면 안 되는 칭찬: ${text}`);
});

test("praise split by spaces or punctuation is still rejected", () => {
  for (const text of spacingTricks) assert.equal(isChildSafeCoachingText(text), false, `띄어쓰기로 우회됨: ${text}`);
});

test("ordinary questions and drawing instructions stay allowed", () => {
  for (const text of allowed) assert.equal(isChildSafeCoachingText(text), true, `막히면 안 되는 문장: ${text}`);
});
