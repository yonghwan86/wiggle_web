export type CoachingChoice = { emoji: string; label: string; answer: string };
export type StudentCoaching = {
  question: string;
  choices: CoachingChoice[];
  nextAction: string;
  observedElements: string[];
  uncertain: boolean;
  growthEvent: string;
};
export type GuideShape = "none" | "line" | "circle" | "triangle" | "rectangle";
export type GuideStep = { instruction: string; openChoice: boolean; choices: string[]; guideShape: GuideShape };
export type DrawingGuide = { topic: string; steps: GuideStep[] };
export type TeacherCoachingDraft = { body: string; observation: string; nextAction: string };
export type OpenAIKind = "student_coaching" | "drawing_guide" | "teacher_draft";

export const STUDENT_COACHING_INSTRUCTIONS = `너는 초등학교 1~2학년 아이를 돕는 그림 코치 '그리미'다.
아이가 버튼으로 도움을 요청한 이번 한 번에만 답한다. 자동으로 끼어들지 않는다.
그림을 대신 완성하거나 원본 선을 수정한다고 말하지 않는다. 점수, 순위, 칭찬 판정, 평가, 재능 진단, 실패 표현을 쓰지 않는다.
멋진 그림, 훌륭한 창의력, 잘 그렸어요, 예쁜 그림, 천재, 재능, 소질 같은 판정과 정답, 반드시 따라, exact answer, follow 같은 강요 표현을 어느 필드에도 쓰지 않는다.
보이는 대상을 확신할 수 없으면 추측하거나 단정하지 말고 uncertain=true로 두고 질문한다.
질문은 정확히 하나만, 짧고 쉬운 한국어로 쓴다. 답 선택은 정답 없는 칩 2~4개다.
next_action에는 아이가 바로 선, 모양, 색, 위치 또는 새 요소를 그려 볼 수 있는 행동 하나를 넣는다.
growth_event는 진단이 아니라 관찰 가능한 과정 한 문장으로 쓴다.`;

export const DRAWING_GUIDE_INSTRUCTIONS = `너는 초등학교 1~2학년 아이의 요청 주제를 단계로 나누는 그림 코치다.
6~15단계를 만든다. 각 instruction은 짧고 쉬운 한국어 한 문장이다.
최소 두 단계는 정답 없는 선택 단계이며 choices를 2~4개 제공한다.
마지막 단계는 반드시 아이가 자기 생각을 자유롭게 더하는 단계다.
점수, 칭찬 판정, 평가, 실패, 재능 진단, 정답 강요를 instruction과 choices 어디에도 쓰지 않는다. 아이 그림을 대신 완성하거나 원본 선을 바꾸지 않는다.
guide_shape은 아이가 점선을 요청했을 때 별도 레이어에 보일 최소 도형만 고른다. 필요 없으면 none이다.`;

export const TEACHER_DRAFT_INSTRUCTIONS = `너는 초등 저학년 미술 수업의 교사용 코칭 초안 작성자다.
초안은 학생에게 자동 전송되지 않고 교사가 반드시 검토, 수정, 승인한다.
점수, 순위, 칭찬 판정, 평가, 재능 진단, 틀렸다는 표현, 정답 강요, 대신 완성하거나 원본을 수정한다는 약속을 어느 필드에도 쓰지 않는다.
그림에서 관찰 가능한 내용과 학생이 실제로 다음에 그려 볼 행동 하나를 짧고 쉬운 한국어로 제안한다.
대상이 불확실하면 단정하지 않고 학생에게 물어보는 문장으로 쓴다.`;

const choiceSchema = {
  type: "object", additionalProperties: false,
  required: ["emoji", "label", "answer"],
  properties: { emoji: { type: "string" }, label: { type: "string" }, answer: { type: "string" } },
};

export const OPENAI_SCHEMAS = {
  student_coaching: {
    type: "object", additionalProperties: false,
    required: ["question", "choices", "next_action", "observed_elements", "uncertain", "growth_event"],
    properties: {
      question: { type: "string" }, choices: { type: "array", minItems: 2, maxItems: 4, items: choiceSchema },
      next_action: { type: "string" }, observed_elements: { type: "array", minItems: 0, maxItems: 4, items: { type: "string" } },
      uncertain: { type: "boolean" }, growth_event: { type: "string" },
    },
  },
  drawing_guide: {
    type: "object", additionalProperties: false, required: ["topic", "steps"],
    properties: {
      topic: { type: "string" },
      steps: { type: "array", minItems: 6, maxItems: 15, items: {
        type: "object", additionalProperties: false, required: ["instruction", "open_choice", "choices", "guide_shape"],
        properties: {
          instruction: { type: "string" }, open_choice: { type: "boolean" },
          choices: { type: "array", minItems: 0, maxItems: 4, items: { type: "string" } },
          guide_shape: { type: "string", enum: ["none", "line", "circle", "triangle", "rectangle"] },
        },
      } },
    },
  },
  teacher_draft: {
    type: "object", additionalProperties: false, required: ["body", "observation", "next_action"],
    properties: { body: { type: "string" }, observation: { type: "string" }, next_action: { type: "string" } },
  },
} as const;

const instructionsByKind = {
  student_coaching: STUDENT_COACHING_INSTRUCTIONS,
  drawing_guide: DRAWING_GUIDE_INSTRUCTIONS,
  teacher_draft: TEACHER_DRAFT_INSTRUCTIONS,
};

const forbiddenMeaningPatterns = [
  /(?:멋진|멋지|멋져|훌륭|예쁜|예쁘|아름답|근사|굉장|대단|완벽|최고|칭찬|잘\s*(?:했|그렸)|좋은\s*그림|창의력)/iu,
  /(?:천재|영재|재능|소질|재주|그림\s*실력)/iu,
  /(?:\d{1,3}\s*점|점수|등수|순위|평가|채점|합격|불합격)/iu,
  /(?:틀렸|틀린|오답|정답|실패|못했|못\s*그렸)/iu,
  /(?:원본(?:의)?\s*(?:선|그림)?.{0,12}(?:고쳐|수정|바꿔|지워)|(?:고쳐|수정|바꿔|지워).{0,12}원본)/iu,
  /(?:(?:대신|내가|그리미가|AI가).{0,16}(?:그려|완성)|(?:그려|완성).{0,16}(?:줄게|드릴게|해\s*줄게|해\s*드릴게))/iu,
  /(?:(?:반드시|꼭|그대로|똑같이|정확히).{0,14}(?:따라|베껴|그려)|(?:따라|베껴).{0,14}(?:반드시|꼭|그대로|똑같이|정확히))/iu,
  /\b(?:exact\s*answer|correct\s*answer|wrong\s*answer|must\s*follow|follow\s*exactly|copy\s*exactly|follow)\b/iu,
  /\b(?:praise|praised|praising|compliment|compliments|complimented|complimenting|evaluate|evaluates|evaluated|evaluating|evaluation)\b/iu,
  /\b(?:score|scores|scored|scoring|rank|ranks|ranked|ranking|talent|talented|gifted|genius)\b/iu,
  /\bcorrect\b/iu,
  /(?:\b(?:fix|repair|correct|modify|replace|erase|redraw)\b(?:\s+\p{L}+){0,5}\s+\b(?:original|lines?|drawings?|pictures?|sketch(?:es)?)\b|\b(?:original|lines?|drawings?|pictures?|sketch(?:es)?)\b(?:\s+\p{L}+){0,5}\s+\b(?:fix|repair|correct|modify|replace|erase|redraw)\b)/iu,
  /(?:\b(?:complete|finish|draw)\b(?:\s+\p{L}+){0,6}\s+(?:for\s+you|instead|on\s+your\s+behalf)|(?:for\s+you|instead|on\s+your\s+behalf)(?:\s+\p{L}+){0,6}\s+\b(?:complete|finish|draw)\b)/iu,
  /(?:\b(?:complete|finish|draw)\b.{0,24}(?:해\s*줄게|해줄게|대신)|(?:해\s*줄게|해줄게|대신).{0,24}\b(?:complete|finish|draw)\b)/iu,
];
const drawingActionPattern = /(그려|더해|추가|넣어|이어|색칠|선|모양|놓아|붙여|표시해|찍어|꾸며|만들어)/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function shortText(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}

export function normalizeCoachingPolicyText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US")
    .replace(/[\p{Cf}\p{Cc}]+/gu, "")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ").trim();
}

export function compactCoachingPolicyText(value: string) {
  return normalizeCoachingPolicyText(value).normalize("NFKD")
    .replace(/\p{M}+/gu, "").normalize("NFC")
    .replace(/[\s\p{P}\p{S}_]+/gu, "");
}

export function isChildSafeCoachingText(value: string) {
  const normalized = normalizeCoachingPolicyText(value);
  if (/[\p{Script_Extensions=Greek}\p{Script_Extensions=Cyrillic}]/u.test(normalized)) return false;
  if (forbiddenMeaningPatterns.some((pattern) => pattern.test(normalized))) return false;
  const policyCompact = compactCoachingPolicyText(normalized);
  const forbiddenCompactTerms = ["prais", "compliment", "evaluat", "score", "rank", "talent", "gifted", "genius", "correct"];
  if (forbiddenCompactTerms.some((term) => policyCompact.includes(term))) return false;
  const editActions = ["fix", "repair", "correct", "modify", "replace", "erase", "redraw"];
  const drawingObjects = ["original", "line", "drawing", "picture", "sketch", "원본", "선", "그림"];
  if (editActions.some((term) => policyCompact.includes(term)) && drawingObjects.some((term) => policyCompact.includes(term))) return false;
  const completionActions = ["complete", "finish", "draw"];
  const completionObjects = ["picture", "drawing", "그림"];
  const delegationTerms = ["foryou", "onyourbehalf", "instead", "해줄", "대신"];
  const hasCompletionAction = completionActions.some((term) => policyCompact.includes(term));
  const hasDelegation = delegationTerms.some((term) => policyCompact.includes(term));
  const hasKoreanDelegation = ["해줄", "대신"].some((term) => policyCompact.includes(term));
  if (hasCompletionAction && ((completionObjects.some((term) => policyCompact.includes(term)) && hasDelegation) || hasKoreanDelegation)) return false;
  return true;
}

function isKoreanFreeCreationStep(value: string) {
  const hasCreationAction = /(?:더해|추가|넣어|그려|꾸며|만들어)/.test(value);
  const explicitlyFree = /(?:자유롭게|마음대로)/.test(value);
  const childDirected = /(?:내|자기|너의|생각|상상|원하는|원하고\s*싶은|하고\s*싶은)/.test(value);
  return hasCreationAction && (explicitlyFree || childDirected);
}

export function validateStudentCoaching(value: unknown): StudentCoaching | null {
  const item = record(value); if (!item) return null;
  const question = shortText(item.question, 90); const nextAction = shortText(item.next_action, 90); const growthEvent = shortText(item.growth_event, 120);
  if (!question || !nextAction || !growthEvent || typeof item.uncertain !== "boolean") return null;
  if ((question.match(/\?/g) ?? []).length !== 1 || !drawingActionPattern.test(nextAction) || !isChildSafeCoachingText(`${question} ${nextAction} ${growthEvent}`)) return null;
  if (!Array.isArray(item.choices) || item.choices.length < 2 || item.choices.length > 4) return null;
  const choices: CoachingChoice[] = [];
  for (const raw of item.choices) {
    const choice = record(raw); if (!choice) return null;
    const emoji = shortText(choice.emoji, 12); const label = shortText(choice.label, 20); const answer = shortText(choice.answer, 50);
    if (!emoji || !label || !answer || !isChildSafeCoachingText(`${emoji} ${label} ${answer}`)) return null;
    choices.push({ emoji, label, answer });
  }
  if (new Set(choices.map((choice) => choice.label)).size !== choices.length) return null;
  if (!Array.isArray(item.observed_elements) || item.observed_elements.length > 4) return null;
  const observedElements = item.observed_elements.map((entry) => shortText(entry, 30));
  if (observedElements.some((entry) => !entry) || !isChildSafeCoachingText(observedElements.join(" "))) return null;
  return { question, choices, nextAction, observedElements: observedElements as string[], uncertain: item.uncertain, growthEvent };
}

export function validateDrawingGuide(value: unknown): DrawingGuide | null {
  const item = record(value); const topic = item && shortText(item.topic, 50);
  if (!item || !topic || !isChildSafeCoachingText(topic) || !Array.isArray(item.steps) || item.steps.length < 6 || item.steps.length > 15) return null;
  const steps: GuideStep[] = [];
  for (const raw of item.steps) {
    const step = record(raw); if (!step) return null;
    const instruction = shortText(step.instruction, 70); const guideShape = step.guide_shape;
    if (!instruction || /[\r\n]/.test(instruction) || (instruction.match(/[.!?]/g) ?? []).length > 1 || typeof step.open_choice !== "boolean") return null;
    if (!isChildSafeCoachingText(instruction) || !["none", "line", "circle", "triangle", "rectangle"].includes(String(guideShape))) return null;
    if (!Array.isArray(step.choices) || step.choices.length > 4) return null;
    const choices = step.choices.map((entry) => shortText(entry, 24)); if (choices.some((entry) => !entry) || !isChildSafeCoachingText(choices.join(" "))) return null;
    if (step.open_choice && choices.length < 2) return null;
    if (!step.open_choice && choices.length !== 0) return null;
    steps.push({ instruction, openChoice: step.open_choice, choices: choices as string[], guideShape: guideShape as GuideShape });
  }
  if (steps.filter((step) => step.openChoice).length < 2) return null;
  const last = steps.at(-1)!;
  const nonDirectiveFinal = /(?:자유롭게|마음대로|생각|상상|원하는|하고\s*싶은)/.test(last.instruction);
  if (!isKoreanFreeCreationStep(last.instruction) || last.guideShape !== "none" || (!last.openChoice && !nonDirectiveFinal)) return null;
  return { topic, steps };
}

export function validateTeacherDraft(value: unknown): TeacherCoachingDraft | null {
  const item = record(value); if (!item) return null;
  const body = shortText(item.body, 180); const observation = shortText(item.observation, 100); const nextAction = shortText(item.next_action, 80);
  if (!body || !observation || !nextAction || !drawingActionPattern.test(nextAction) || !isChildSafeCoachingText(`${body} ${observation} ${nextAction}`)) return null;
  return { body, observation, nextAction };
}

export class AIServiceError extends Error {
  code: "AI_CONFIG" | "AI_TIMEOUT" | "AI_BUSY" | "AI_REFUSAL" | "AI_RESPONSE_INVALID" | "AI_UNAVAILABLE";
  status: number;
  constructor(code: AIServiceError["code"], message: string, status = 503) { super(message); this.code = code; this.status = status; }
}

function outputText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return null;
  for (const rawItem of response.output) {
    const item = record(rawItem); if (!item || !Array.isArray(item.content)) continue;
    for (const rawPart of item.content) {
      const part = record(rawPart); if (!part) continue;
      if (part.type === "refusal" || typeof part.refusal === "string") throw new AIServiceError("AI_REFUSAL", "그리미가 이번 그림에는 답하기 어려워요. 선생님과 함께 다시 해 봐요.", 422);
      if (part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  return null;
}

export async function requestStructuredOpenAI(options: {
  kind: OpenAIKind;
  prompt: string;
  imageDataUrl: string;
  safetyIdentifier: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  apiKey?: string;
  model?: string;
}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AIServiceError("AI_CONFIG", "그리미 연결이 아직 준비되지 않았어요.");
  const model = (options.model ?? process.env.OPENAI_MODEL ?? "gpt-5.6-sol").trim();
  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(model)) throw new AIServiceError("AI_CONFIG", "그리미 모델 설정을 확인해 주세요.");
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  const requestBody = {
    model,
    instructions: instructionsByKind[options.kind],
    input: [{ role: "user", content: [
      { type: "input_text", text: options.prompt },
      { type: "input_image", image_url: options.imageDataUrl, detail: "low" },
    ] }],
    text: { verbosity: "low", format: { type: "json_schema", name: `wiggle_${options.kind}`, strict: true, schema: OPENAI_SCHEMAS[options.kind] } },
    reasoning: { effort: "low" },
    max_output_tokens: options.kind === "drawing_guide" ? 2200 : 1000,
    store: false,
    safety_identifier: options.safetyIdentifier,
  };
  try {
    const response = await (options.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new AIServiceError("AI_CONFIG", "그리미 연결 설정을 확인해 주세요.");
      if (response.status === 429) throw new AIServiceError("AI_BUSY", "그리미가 잠깐 바빠요. 조금 뒤에 다시 불러 주세요.", 429);
      throw new AIServiceError("AI_UNAVAILABLE", "그리미가 잠시 쉬고 있어요. 조금 뒤에 다시 불러 주세요.");
    }
    const responseBody = await response.json() as Record<string, unknown>;
    const text = outputText(responseBody); if (!text) throw new AIServiceError("AI_RESPONSE_INVALID", "그리미의 답을 확인하지 못했어요.", 502);
    let parsed: unknown; try { parsed = JSON.parse(text); } catch { throw new AIServiceError("AI_RESPONSE_INVALID", "그리미의 답을 확인하지 못했어요.", 502); }
    const value = options.kind === "student_coaching" ? validateStudentCoaching(parsed)
      : options.kind === "drawing_guide" ? validateDrawingGuide(parsed) : validateTeacherDraft(parsed);
    if (!value) throw new AIServiceError("AI_RESPONSE_INVALID", "그리미의 답을 확인하지 못했어요.", 502);
    return { value, model, schemaValid: true as const };
  } catch (error) {
    if (error instanceof AIServiceError) throw error;
    if (controller.signal.aborted) throw new AIServiceError("AI_TIMEOUT", "그리미의 답이 늦어지고 있어요. 다시 불러 주세요.", 504);
    throw new AIServiceError("AI_UNAVAILABLE", "그리미가 잠시 쉬고 있어요. 조금 뒤에 다시 불러 주세요.");
  } finally { clearTimeout(timeout); }
}
