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
  // 단정형을 열거하면 시제·회상형이 계속 빠진다. 허용 어미만 두고 나머지를 막아야 한다.
  "나는 네 그림을 좋아했어",
  "네 그림을 좋아했다",
  "네 그림을 좋아할 거야",
  "네 그림을 좋아하네",
  // 지시어가 없어도 작품 승인이다.
  "그림을 좋아해.",
  "작품을 정말 좋아합니다.",
  "그림을 좋아했어요",
  // 의문형 전처리가 원문을 지우면 그 안에 낀 금지어까지 검사 전에 사라진다.
  "네 그림을 좋아칭찬?",
  "네 그림을 좋아최고?",
  "네 작품을 좋아평가?",
  "네 그림을 좋아정답?",
  // 표시용 낱말을 본문에 끼워 넣으면 모델이 그대로 써서 검사를 비켜 갈 수 있다.
  "네 그림을 좋아해 물음표",
  "네 그림을 좋아해 물음표.",
  // 평가자가 자기를 주어로 밝힌 승인.
  "나는 그림을 좋아해.",
  "내가 이 그림을 좋아한다",
  // 질문 뒤에 이어지는 승인 문장도 그 문장 단위로 잡아야 한다.
  "무엇을 그렸어? 그림을 좋아해.",
  // 문장 끝이 물음표여도 앞 절이 승인이면 막아야 한다. 절 경계는 쉼표만이 아니다.
  "네 그림을 좋아해, 무엇을 더 그리고 싶어?",
  "그림이 참 좋네, 무엇을 더 그릴까?",
  "네 그림을 좋아해; 무엇을 더 그리고 싶어?",
  "네 그림을 좋아해: 무엇을 더 그릴까?",
  "네 그림을 좋아해\n무엇을 더 그리고 싶어?",
  "네 그림을 좋아해 — 무엇을 더 그리고 싶어?",
  // 형태만 의문이고 내용은 평가인 문장.
  "그림이 참 좋네?",
  // 평가자는 열거가 아니라 이 제품이 아는 화자 집합이다.
  "그리미는 네 그림을 좋아해.",
  "선생님도 네 그림을 좋아해.",
  "선생님께서는 네 그림을 좋아해.",
  "난 네 그림을 좋아해.",
  // 소유자를 열거하면 이름과 일반 명사가 빠진다.
  "아이의 그림을 좋아해요.",
  "나는 아이의 그림을 좋아해요.",
  "선생님은 민수의 작품을 정말 좋아합니다.",
  // 소유는 관형절로도 온다. 제작 동사를 열거하면 만든·색칠한·완성한이 계속 빠진다.
  "네가 그린 그림을 좋아해요",
  "민수가 그린 작품을 좋아합니다",
  "네가 만든 작품을 좋아해요",
  "민수가 색칠한 그림을 좋아합니다",
  "네가 완성한 그림을 좋아해",
  "내가 네가 만든 작품을 좋아하는 게 느껴지니?",
  // 조사 "의"는 흔히 생략된다.
  "네 그림 색이 좋다",
  "이 작품 색깔이 정말 좋아요",
  // 의문문으로 감싸도 평가자의 승인은 승인이다.
  "내가 네 그림을 좋아하는 게 느껴지니?",
  // 작품 문맥이 있으면 색 평가도 승인이다.
  "네 그림의 색이 좋다",
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
  // 존댓말과 전각 물음표도 의문형이다. 활용형을 하나씩 적으면 이런 것이 빠진다.
  "네 그림을 좋아해요?",
  "네 그림을 좋아해？",
  "네가 좋아하는 색이 뭐야?",
  // 제3자를 주어로 둔 관찰은 평가가 아니다. 막으면 교사 초안이 502가 된다.
  "아이가 그림을 좋아해요",
  "학생이 색칠을 좋아합니다",
  "친구가 그림을 좋아했어요",
  // 아이의 선택을 묻는 질문도 막으면 502가 된다.
  "어떤 색이 좋아?",
  "빨강과 파랑 중 어느 색이 좋아?",
  "무슨 색이 좋아?",
  // 맨몸의 색 선호는 아이가 고른 답이지 작품 평가가 아니다.
  "빨간색이 좋아요",
  "아이는 빨간색이 좋아요",
  "파란색이 좋아",
  // 관형절 소유 규칙이 조사를 중간말로 오인하면 제3자 관찰까지 막힌다.
  "아이가 만든 그림을 좋아하는 친구를 그려 봐.",
  "아이가 좋아하는 그림을 그려 봐.",
  // 절 앞에 제3자 주어가 있으면 승인이 아니라 관찰이다.
  "아이는 엄마가 그린 그림을 좋아해요",
  // 평가자가 그린 사람일 뿐이면 아이에게 묻는 질문이다.
  "내가 그린 그림을 좋아하니?",
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

  // 필드를 이어 붙여 한 번에 검사하면 절 시작 규칙이 첫 필드에서만 걸린다.
  assert.equal(validateStudentCoaching(studentPayload({
    choices: [{ emoji: "🐶", label: "강아지", answer: "그림을 좋아해" }, { emoji: "🌳", label: "나무", answer: "나무를 그렸어요" }],
  })), null, "뒤쪽 필드의 승인도 막아야 한다");
  assert.equal(validateStudentCoaching(studentPayload({ growth_event: "그림을 좋아해" })), null);
  for (const text of ["네 그림 색이 좋다", "네가 만든 작품을 좋아해요", "민수가 색칠한 그림을 좋아합니다"]) {
    assert.equal(validateStudentCoaching(studentPayload({ growth_event: text })), null, `학생 코칭으로 새면 안 됨: ${text}`);
    assert.equal(validateTeacherDraft({ body: "다음에는 배경을 더 그려볼까?", observation: text, next_action: "선을 하나 더 그려 보게 해 주세요." }), null, `교사 초안으로 새면 안 됨: ${text}`);
  }
  for (const text of ["빨간색이 좋아요", "아이가 그림을 좋아해요"]) {
    assert.ok(validateStudentCoaching(studentPayload({ growth_event: text })), `막히면 502가 난다: ${text}`);
    assert.ok(validateTeacherDraft({ body: "다음에는 배경을 더 그려볼까?", observation: text, next_action: "선을 하나 더 그려 보게 해 주세요." }), `막히면 502가 난다: ${text}`);
  }
  // 전각 물음표를 쓴 정상 질문은 통과해야 한다(안전 검사와 물음표 개수 검사의 기준이 같아야 한다).
  assert.ok(validateStudentCoaching(studentPayload({ question: "여기 동그란 건 무엇이니？" })), "전각 물음표 질문이 막히면 502가 난다");
  // 화면에서는 emoji와 label이 한 버튼에 붙어 나온다. 따로만 검사하면 쪼갠 칭찬이 통과한다.
  assert.equal(validateStudentCoaching(studentPayload({
    choices: [{ emoji: "잘", label: "했어요", answer: "강아지를 그렸어요" }, { emoji: "🌳", label: "나무", answer: "나무를 그렸어요" }],
  })), null, "emoji 자리에 글자를 넣어 칭찬을 쪼개면 막아야 한다");
  assert.equal(validateStudentCoaching(studentPayload({
    choices: [{ emoji: "멋", label: "있다", answer: "강아지를 그렸어요" }, { emoji: "🌳", label: "나무", answer: "나무를 그렸어요" }],
  })), null);
  // 국기·키캡도 정상 이모지다. 문자 종류를 금지하면 유효한 응답이 502가 된다.
  for (const emoji of ["🇰🇷", "1️⃣", "👩‍🎨", "🎨"]) {
    assert.ok(validateStudentCoaching(studentPayload({
      choices: [{ emoji, label: "하나", answer: "하나를 그렸어요" }, { emoji: "🌳", label: "나무", answer: "나무를 그렸어요" }],
    })), `유효한 이모지가 막히면 502가 난다: ${emoji}`);
  }
  for (const text of ["그리미는 네 그림을 좋아해.", "선생님도 네 그림을 좋아해.", "난 네 그림을 좋아해.", "그림이 참 좋네?"]) {
    assert.equal(validateStudentCoaching(studentPayload({ growth_event: text })), null, `학생 코칭으로 새면 안 됨: ${text}`);
    assert.equal(validateTeacherDraft({ body: "다음에는 배경을 더 그려볼까?", observation: text, next_action: "선을 하나 더 그려 보게 해 주세요." }), null, `교사 초안으로 새면 안 됨: ${text}`);
  }
  // 아이가 고른 색 선호는 choice answer로 자주 온다.
  assert.ok(validateStudentCoaching(studentPayload({
    choices: [{ emoji: "🔴", label: "빨강", answer: "빨간색이 좋아요" }, { emoji: "🔵", label: "파랑", answer: "파란색이 좋아요" }],
  })), "색 선호 답이 막히면 502가 난다");

  const draft = { body: "다음에는 배경을 하나 더 그려볼까?", observation: "선을 이어 그렸어요.", next_action: "지붕 위에 선을 하나 그려 보게 해 주세요." };
  assert.ok(validateTeacherDraft(draft), "정상 초안은 통과해야 한다");
  assert.equal(validateTeacherDraft({ ...draft, observation: "그림을 좋아해" }), null, "뒤쪽 필드의 승인도 막아야 한다");
  assert.equal(validateTeacherDraft({ ...draft, body: "그림을 참 잘하는 아이구나." }), null);
  assert.equal(validateTeacherDraft({ ...draft, observation: "정말 잘하고 있어요." }), null);
});

// 필터 단위만 고정하면 최종 관문이 뚫린 것을 놓친다. 시제·존댓말·전각 부호까지
// 두 validator에서 직접 확인한다.
test("tense and politeness variants are judged the same way at both final validators", () => {
  const approvals = [
    "나는 네 그림을 좋아했어.",
    "선생님은 네 작품을 좋아했어요.",
    "네 그림을 좋아했다",
    "네 그림을 좋아할 거야",
    "네 그림을 좋아하네",
    "그림을 좋아해.",
    "작품을 정말 좋아합니다.",
    "네 그림을 좋아칭찬?",
    "네 작품을 좋아평가?",
  ];
  for (const text of approvals) {
    assert.equal(validateStudentCoaching(studentPayload({ growth_event: text })), null, `학생 코칭으로 새면 안 됨: ${text}`);
    assert.equal(validateTeacherDraft({ body: text, observation: "선을 이어 그렸어요.", next_action: "선을 하나 더 그려 보게 해 주세요." }), null, `교사 초안으로 새면 안 됨: ${text}`);
  }

  const questions = [
    "네 그림을 좋아해요?",
    "네 그림을 좋아했어?",
    "네 그림을 좋아했어요?",
    "네 그림을 좋아해？",
    "이 색깔을 좋아하니?",
  ];
  for (const text of questions) {
    assert.ok(validateStudentCoaching(studentPayload({ growth_event: text })), `막히면 502가 난다(학생 코칭): ${text}`);
    assert.ok(validateTeacherDraft({ body: "다음에는 배경을 더 그려볼까?", observation: text, next_action: "선을 하나 더 그려 보게 해 주세요." }), `막히면 502가 난다(교사 초안): ${text}`);
  }
});
