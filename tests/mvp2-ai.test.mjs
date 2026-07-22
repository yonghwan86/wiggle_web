import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DRAWING_GUIDE_INSTRUCTIONS, requestStructuredOpenAI, STUDENT_COACHING_INSTRUCTIONS,
  TEACHER_DRAFT_INSTRUCTIONS, compactCoachingPolicyText, isChildSafeCoachingText, normalizeCoachingPolicyText,
  validateDrawingGuide, validateStudentCoaching, validateTeacherDraft,
} from "../lib/openai-coaching.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
const coaching = {
  question: "이 모양 옆에는 누가 함께 있으면 좋을까?",
  choices: [
    { emoji: "🐰", label: "토끼", answer: "토끼가 함께 있어요" },
    { emoji: "🐦", label: "새", answer: "새가 날아와요" },
  ],
  next_action: "고른 친구의 모양을 옆에 그려 봐.",
  observed_elements: ["둥근 모양"], uncertain: true,
  growth_event: "질문 뒤에 새로운 친구를 더하려고 선택했어요.",
};

function jsonResponse(value) { return new Response(JSON.stringify({ output_text: JSON.stringify(value) }), { status: 200, headers: { "content-type": "application/json" } }); }

test("Responses request keeps image, strict schema, privacy and coaching invariants", async () => {
  let captured;
  const result = await requestStructuredOpenAI({
    kind: "student_coaching", prompt: "structured context", imageDataUrl: image, safetyIdentifier: "hashed-student-id",
    apiKey: "test-only-key", model: "gpt-5.6-sol", fetchImpl: async (url, init) => { captured = { url, init, body: JSON.parse(String(init?.body)) }; return jsonResponse(coaching); },
  });
  assert.equal(result.schemaValid, true); assert.equal(result.model, "gpt-5.6-sol");
  assert.equal(captured.url, "https://api.openai.com/v1/responses");
  assert.equal(captured.body.store, false); assert.equal(captured.body.safety_identifier, "hashed-student-id");
  assert.equal(captured.body.text.format.type, "json_schema"); assert.equal(captured.body.text.format.strict, true);
  assert.equal(captured.body.input[0].content[1].type, "input_image"); assert.equal(captured.body.input[0].content[1].detail, "low");
  assert.equal(captured.body.model, "gpt-5.6-sol"); assert.equal(captured.body.reasoning.effort, "low");
  assert.match(captured.body.instructions, /자동으로 끼어들지 않는다/); assert.match(captured.body.instructions, /질문은 정확히 하나/); assert.match(captured.body.instructions, /점수, 순위.*평가/);
  assert.doesNotMatch(JSON.stringify(captured.body), /student_x7k29/i);
});

test("server validation rejects malformed coaching and invalid guides", () => {
  assert.equal(validateStudentCoaching({ ...coaching, question: "질문 하나? 질문 둘?" }), null);
  assert.equal(validateStudentCoaching({ ...coaching, next_action: "생각해 봐." }), null);
  assert.equal(validateStudentCoaching({ ...coaching, growth_event: "창의력 95점" }), null);
  const step = { instruction: "동그라미를 그려 봐.", open_choice: false, choices: [], guide_shape: "circle" };
  assert.equal(validateDrawingGuide({ topic: "강아지", steps: Array.from({ length: 5 }, () => step) }), null);
  assert.equal(validateDrawingGuide({ topic: "강아지", steps: [step, step, step, step, step, { ...step, instruction: "끝내 봐." }] }), null);
});

const validGuideSteps = [
  { instruction: "큰 동그라미를 그려 봐.", open_choice: false, choices: [], guide_shape: "circle" },
  { instruction: "귀 모양을 골라 그려 봐.", open_choice: true, choices: ["둥근 귀", "긴 귀"], guide_shape: "none" },
  { instruction: "눈 두 개를 그려 봐.", open_choice: false, choices: [], guide_shape: "circle" },
  { instruction: "꼬리 모양을 골라 그려 봐.", open_choice: true, choices: ["동그란 꼬리", "긴 꼬리"], guide_shape: "none" },
  { instruction: "옆에 작은 풀을 더해 봐.", open_choice: false, choices: [], guide_shape: "none" },
  { instruction: "마지막에는 원하는 요소를 자유롭게 추가해 봐.", open_choice: false, choices: [], guide_shape: "none" },
];
const teacherDraft = { body: "지붕 옆에 작은 나무가 보여요.", observation: "질문 후 새 대상을 추가했어요.", next_action: "마당에 사람 한 명을 더 그려 봐." };

const unicodePolicyControls = [
  "\u0000", "\u001F", "\u007F", "\u0085", "\u009F", "\u00AD", "\u061C", "\u200B", "\u200C", "\u200D", "\u200E", "\u200F",
  "\u202A", "\u202B", "\u202C", "\u202D", "\u202E", "\u2060", "\u2066", "\u2067", "\u2068", "\u2069", "\uFEFF",
];
const unicodeControlEvasions = unicodePolicyControls.flatMap((control) => [
  `p${control}raise`,
  `eval${control}uate`,
  `f${control}ix original`,
  `compl${control}ete \uADF8\uB9BC foryou`,
]);
const unicodeHomoglyphEvasions = [
  "pr\u0430ise", // Cyrillic small a
  "ev\u0430luate", // Cyrillic small a
  "fi\u0445 original", // Cyrillic small ha
  "c\u03BFmplete \uADF8\uB9BC foryou", // Greek small omicron
  "\u03B1", // Greek small alpha
  "\u0430", // Cyrillic small a
];

test("semantic safety deny rules cover every generated coaching field", () => {
  const forbidden = [
    "p\u00ADraise", "eval\u200Euate", "f\u202Dix original lines", "compl\u2066ete the picture for you",
    ...unicodeControlEvasions, ...unicodeHomoglyphEvasions,
    "멋진 그림", "훌륭한 창의력", "잘 그렸어요", "예쁜 그림", "그림 천재", "그림 재능", "그림 소질",
    "원본 선을 고쳐 줄게", "대신 그려 줄게", "완성해 줄게", "틀렸어요", "정답은 하나", "반드시 따라 그려", "자유 exact answer follow",
    "praise this drawing", "evaluate this drawing", "fix original lines", "complete the picture for you", "correct", "그림 praise", "원본 line fix", "AI가 complete 해줄게",
    "P-R_A😀I S E this drawing", "e\u0301 V A L U A T E this drawing", "F_i X o-r-i-g-i-n-a-l L I N E S", "C-o-M-p-L-e-T-e the P_I_C_T_U_R_E f o r y o u",
    "C_O-R R E C T", "그 림 P-r-A-i-S-e", "원 본 L_I-N E F i X", "aI가 C-O-M-P-L-E-T-E 해 줄 게",
  ];
  for (const phrase of forbidden) {
    assert.equal(validateStudentCoaching({ ...coaching, choices: [{ ...coaching.choices[0], emoji: phrase }, coaching.choices[1]] }), null, `student choice emoji: ${phrase}`);
    assert.equal(validateStudentCoaching({ ...coaching, question: `${phrase}. 무엇을 더 그릴까?` }), null, `student question: ${phrase}`);
    assert.equal(validateStudentCoaching({ ...coaching, choices: [{ emoji: "🎨", label: phrase, answer: phrase }, coaching.choices[1]] }), null, `student choice: ${phrase}`);
    assert.equal(validateStudentCoaching({ ...coaching, next_action: `${phrase}. 새 선을 그려 봐.` }), null, `student action: ${phrase}`);
    assert.equal(validateStudentCoaching({ ...coaching, growth_event: `${phrase}. 질문 후 새 대상을 추가했어요.` }), null, `student growth: ${phrase}`);
    assert.equal(validateStudentCoaching({ ...coaching, observed_elements: [phrase] }), null, `student observation: ${phrase}`);
    assert.equal(validateTeacherDraft({ ...teacherDraft, body: `${phrase}. ${teacherDraft.body}` }), null, `teacher body: ${phrase}`);
    assert.equal(validateTeacherDraft({ ...teacherDraft, observation: `${phrase}. ${teacherDraft.observation}` }), null, `teacher observation: ${phrase}`);
    assert.equal(validateTeacherDraft({ ...teacherDraft, next_action: `${phrase}. ${teacherDraft.next_action}` }), null, `teacher action: ${phrase}`);
    assert.equal(validateDrawingGuide({ topic: "강아지", steps: validGuideSteps.map((step, index) => index === 2 ? { ...step, instruction: `${phrase}. 선을 그려 봐.` } : step) }), null, `guide instruction: ${phrase}`);
    assert.equal(validateDrawingGuide({ topic: "강아지", steps: validGuideSteps.map((step, index) => index === 1 ? { ...step, choices: [phrase, "긴 귀"] } : step) }), null, `guide choice: ${phrase}`);
    assert.equal(validateDrawingGuide({ topic: phrase, steps: validGuideSteps }), null, `guide topic: ${phrase}`);
  }
  assert.ok(validateStudentCoaching({ ...coaching, growth_event: "질문 후 새 대상을 추가했어요." }));
  assert.ok(validateTeacherDraft(teacherDraft));
  assert.ok(validateDrawingGuide({ topic: "강아지", steps: validGuideSteps }));
  assert.equal(normalizeCoachingPolicyText("ＰＲＡＩＳＥ\u200B—THIS   DRAWING"), "praise this drawing");
  assert.equal(compactCoachingPolicyText("P-r-a\u0301-i-s-e_😀"), "praise");
  for (const disguised of ["ｐｒａｉｓｅ this drawing", "pr\u200Baise this drawing", "evaluate—this drawing"]) assert.equal(isChildSafeCoachingText(disguised), false);
  assert.equal(isChildSafeCoachingText("child can complete it"), true);
  assert.equal(isChildSafeCoachingText("correct color name"), false);
});

test("Unicode controls canonicalize away and Greek or Cyrillic scripts are rejected", () => {
  for (const control of unicodePolicyControls) {
    assert.equal(normalizeCoachingPolicyText(`p${control}raise`), "praise", `control canonicalization: U+${control.codePointAt(0).toString(16).toUpperCase()}`);
  }
  for (const disguised of [
    "p\u00ADraise", "eval\u200Euate", "f\u202Dix original lines", "compl\u2066ete the picture for you",
    ...unicodeControlEvasions, ...unicodeHomoglyphEvasions,
  ]) assert.equal(isChildSafeCoachingText(disguised), false, `unicode policy: ${JSON.stringify(disguised)}`);
  assert.equal(isChildSafeCoachingText("child can complete it"), true);
  assert.equal(isChildSafeCoachingText("\uADF8\uB9BC\uC5D0 \uBCC4\uC744 \uB354 \uADF8\uB824 \uBCFC\uAE4C? \u2B50"), true);
});

test("guide final step is Korean free creation without a dotted shape", () => {
  assert.equal(validateDrawingGuide({ topic: "강아지", steps: validGuideSteps.map((step, index) => index === 5 ? { ...step, guide_shape: "circle" } : step) }), null);
  assert.equal(validateDrawingGuide({ topic: "강아지", steps: validGuideSteps.map((step, index) => index === 5 ? { ...step, instruction: "마지막 선을 그대로 따라 그려 봐." } : step) }), null);
  assert.equal(validateDrawingGuide({ topic: "강아지", steps: validGuideSteps.map((step, index) => index === 5 ? { ...step, instruction: "free exact answer follow 선을 그려 봐." } : step) }), null);
});

test("refusal, malformed output, upstream errors and timeout are sanitized", async () => {
  const base = { kind: "student_coaching", prompt: "x", imageDataUrl: image, safetyIdentifier: "hash", apiKey: "test-only-key", model: "gpt-5.6-sol" };
  await assert.rejects(requestStructuredOpenAI({ ...base, fetchImpl: async () => new Response(JSON.stringify({ output: [{ content: [{ type: "refusal", refusal: "no" }] }] }), { status: 200 }) }), (error) => error.code === "AI_REFUSAL" && !error.message.includes("no"));
  await assert.rejects(requestStructuredOpenAI({ ...base, fetchImpl: async () => jsonResponse({ question: "빠진 필드?" }) }), (error) => error.code === "AI_RESPONSE_INVALID");
  await assert.rejects(requestStructuredOpenAI({ ...base, fetchImpl: async () => new Response("secret upstream body", { status: 429 }) }), (error) => error.code === "AI_BUSY" && !error.message.includes("secret"));
  for (const status of [401, 403]) await assert.rejects(requestStructuredOpenAI({ ...base, fetchImpl: async () => new Response("secret auth body", { status }) }), (error) => error.code === "AI_CONFIG" && !error.message.includes("secret"));
  for (const status of [500, 502, 503]) await assert.rejects(requestStructuredOpenAI({ ...base, fetchImpl: async () => new Response("secret server body", { status }) }), (error) => error.code === "AI_UNAVAILABLE" && !error.message.includes("secret"));
  await assert.rejects(requestStructuredOpenAI({ ...base, fetchImpl: async () => { throw new TypeError("secret network failure"); } }), (error) => error.code === "AI_UNAVAILABLE" && !error.message.includes("secret"));
  await assert.rejects(requestStructuredOpenAI({ ...base, timeoutMs: 5, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))) }), (error) => error.code === "AI_TIMEOUT");
});

test("prompts and routes preserve child agency, teacher approval and structured storage", async () => {
  assert.match(STUDENT_COACHING_INSTRUCTIONS, /원본 선을 수정/); assert.match(STUDENT_COACHING_INSTRUCTIONS, /정답 없는 칩 2~4개/);
  assert.match(DRAWING_GUIDE_INSTRUCTIONS, /6~15단계/); assert.match(DRAWING_GUIDE_INSTRUCTIONS, /마지막 단계는 반드시/);
  assert.match(TEACHER_DRAFT_INSTRUCTIONS, /자동 전송되지 않고/); assert.match(TEACHER_DRAFT_INSTRUCTIONS, /검토, 수정, 승인/);
  const [studentRoute, teacherRoute, coachingStore, teacherMessages, schema, runtime, studio, teacherUi, timelapse, renderer] = await Promise.all([
    read("../app/api/ai/coaching/route.ts"), read("../app/api/ai/teacher-draft/route.ts"), read("../lib/coaching-store.ts"), read("../lib/teacher-messages.ts"), read("../db/schema.ts"), read("../db/runtime.ts"), read("../app/components/DrawingStudio.tsx"), read("../app/components/TeacherApp.tsx"), read("../app/components/TimelapsePlayer.tsx"), read("../lib/draw-renderer.ts"),
  ]);
  assert.match(studentRoute, /studentFromRequest/); assert.match(studentRoute, /WHERE id = \? AND student_id = \?/); assert.match(studentRoute, /recordCoachingBefore/); assert.match(coachingStore, /coaching_before/); assert.match(coachingStore, /coaching_after/); assert.match(studentRoute, /recentEvents/); assert.match(studentRoute, /rateLimit/); assert.match(studentRoute, /finishGuide/);
  assert.match(teacherRoute, /requireTeacher/); assert.match(teacherRoute, /c\.teacher_id = \?/); assert.match(teacherMessages, /status = 'draft'/); assert.match(teacherMessages, /status = 'approved'/); assert.match(teacherMessages, /INSERT INTO teacher_messages/); assert.match(teacherRoute, /approveTeacherDraftMessage/);
  assert.match(schema, /coachingEventDetails/); assert.match(schema, /teacherCoachingDrafts/); assert.match(runtime, /coaching_event_details/); assert.match(runtime, /teacher_coaching_drafts/);
  assert.match(studio, /그리미 부르기/); assert.match(studio, /그냥 내 마음대로 그릴래/); assert.match(studio, /TimelapsePlayer/); assert.match(teacherUi, /수정한 뒤 승인해서 보내기/);
  assert.match(renderer, /op\.type === "fill"/); assert.match(renderer, /op\.type === "shape"/); assert.match(renderer, /op\.type === "sticker"/); assert.match(timelapse, /setInterval/); assert.match(timelapse, /clearInterval/); assert.doesNotMatch(timelapse, /document\.ops\.slice\(0, frame\)/);
});
