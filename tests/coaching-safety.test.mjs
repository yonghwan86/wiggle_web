import assert from "node:assert/strict";
import test from "node:test";
import { isChildSafeCoachingText, validateStudentCoaching, validateTeacherDraft } from "../lib/openai-coaching.ts";

const praise = [
  "정말 잘하고 있어!",
  "그림을 참 잘하는 아이구나.",
  "잘하셨어요",
  "정말 잘한다",
  "너 그림 잘해",
  "선생님은 네 그림을 좋아해.",
  "네 작품을 좋아한다",
  "이 그림을 정말 좋아해요",
  "나는 너 그림을 좋아해.",
  "그 작품을 좋아합니다",
  "색을 정말 잘 표현했네!",
  "네 그림이 정말 좋아!",
  "그림이 참 좋네",
  "작품이 좋다",
  "잘 꾸몄어요",
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
  // 과차단은 정상 코칭 응답을 502로 만든다. 선호를 묻는 질문과 대화 연결어는 통과해야 한다.
  "어떤 색을 좋아하니?",
  "그림을 좋아하는 친구를 그려 봐.",
  "네가 좋아하는 것을 하나 더 그려 볼까?",
  // 어미로 갈라내지 않으면 지시어가 붙은 정상 질문·관계절까지 막혀 502가 난다.
  "이 색깔을 좋아하니?",
  "그 그림을 좋아하는 친구를 그려 봐.",
  "저 색깔을 좋아해서 골랐어?",
  "너 그림을 좋아하니?",
  "네 그림을 좋아해?",
  "좋아, 이제 다음 선을 그어 보자.",
  "무슨 색을 더 칠하고 싶어?",
  "이 자리에 무엇을 만들까?",
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

// 필터 단위 검사만으로는 부족하다. 아이와 교사에게 실제로 나가는 최종 관문에서 막히는지 본다.
const studentPayload = (overrides = {}) => ({
  question: "여기 동그란 건 무엇이니?",
  next_action: "동그라미 옆에 선을 하나 더 그어 보자.",
  growth_event: "새 대상을 고르려고 했어요.",
  uncertain: false,
  observed_elements: ["동그라미"],
  choices: [
    { emoji: "🐶", label: "강아지", answer: "강아지를 그렸어요" },
    { emoji: "🌳", label: "나무", answer: "나무를 그렸어요" },
  ],
  ...overrides,
});

test("praise reaches neither the child coaching payload nor the teacher draft", () => {
  assert.ok(validateStudentCoaching(studentPayload()), "정상 페이로드는 통과해야 한다");
  assert.equal(validateStudentCoaching(studentPayload({ question: "정말 잘하고 있어! 이건 뭐야?" })), null);
  assert.equal(validateStudentCoaching(studentPayload({ growth_event: "그림을 참 잘하는 아이예요." })), null);
  assert.equal(validateStudentCoaching(studentPayload({ next_action: "잘했어요, 선을 하나 더 그어 보자." })), null);
  assert.equal(validateStudentCoaching(studentPayload({
    choices: [
      { emoji: "🐶", label: "강아지", answer: "정말 멋있게 그렸어요" },
      { emoji: "🌳", label: "나무", answer: "나무를 그렸어요" },
    ],
  })), null);

  const draft = { body: "다음에는 배경을 하나 더 그려볼까?", observation: "선을 이어 그렸어요.", next_action: "지붕 위에 선을 하나 그려 보게 해 주세요." };
  assert.ok(validateTeacherDraft(draft), "정상 초안은 통과해야 한다");
  assert.equal(validateTeacherDraft({ ...draft, body: "그림을 참 잘하는 아이구나." }), null);
  assert.equal(validateTeacherDraft({ ...draft, observation: "정말 잘하고 있어요." }), null);
});
