const forbiddenCompactRoots = [
  "score", "rank", "talent", "diagnos", "praise", "prais", "evaluate", "evaluat", "percentage", "percent", "compliment", "gifted", "genius",
  "점수", "퍼센트", "순위", "또래", "재능", "소질", "진단", "천재", "영재", "최고", "완벽", "대단", "훌륭",
] as const;
const internalIdentifier = /\b(?:student|teacher|class|classroom|artwork|share|version|event)_[a-zA-Z0-9_-]+\b/giu;
const emailAddress = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const schoolOrClass = /[\p{L}\d]{1,24}(?:초등학교|중학교|고등학교|학교|유치원|어린이집|\d+반)/giu;
const exactEmailDetection = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const exactInternalDetection = /(?:student|teacher|classroom|class|artwork|share|version|event)_[a-zA-Z0-9_-]{2,}/iu;
const compactInternalDetection = /(?:student|teacher|classroom|class|artwork|share|version|event)[a-z0-9]{2,}/iu;
const compactSchoolOrClassDetection = /(?:[\p{L}\d]{1,24}(?:초등학교|중학교|고등학교|학교|유치원|어린이집)(?:\d{1,2}반)?|\d{1,2}반)/u;
const greekOrCyrillic = /[\p{Script_Extensions=Greek}\p{Script_Extensions=Cyrillic}]/u;
const koreanNumberWord = /(?:[영공일이삼사오육칠팔구십백천만]+|(?:하나|한|둘|두|셋|세|넷|네|다섯|여섯|일곱|여덟|아홉|열|스물|스무|서른|마흔|쉰|예순|일흔|여든|아흔)+)/u;
const englishNumberPoints = /(?:^|[^a-z])(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[^\p{L}\p{N}]*)points?(?=$|[^a-z])/u;

export type FamilyGrowthReport = {
  period: { start: string; end: string };
  summary: string;
  observations: Array<{ artworkAnchor: string; text: string }>;
  childWords: Array<{ artworkAnchor: string; text: string }>;
  verificationLinks: Array<{ artworkAnchor: string; label: string }>;
  note: string;
};

export function normalizeFamilyPolicyText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{Cf}\p{Cc}]+/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function compactFamilyPolicyText(value: unknown) {
  return normalizeFamilyPolicyText(value)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFC")
    .replace(/[\s\p{P}\p{S}_]+/gu, "");
}

export function canonicalEvaluationPolicyText(value: unknown) {
  return normalizeFamilyPolicyText(value)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFC");
}

export function emailJoinedFamilyPolicyText(value: unknown) {
  const atMarker = "\uE000";
  return normalizeFamilyPolicyText(value)
    .replace(/@/gu, atMarker)
    .normalize("NFKD")
    .replace(/[\s\p{P}\p{S}\p{M}_]+/gu, "")
    .normalize("NFC")
    .replaceAll(atMarker, "@");
}

export function containsFamilyPii(value: unknown, sensitiveValues: string[] = []) {
  const normalized = normalizeFamilyPolicyText(value);
  if (!normalized) return false;
  const compact = compactFamilyPolicyText(normalized);
  const emailJoined = emailJoinedFamilyPolicyText(normalized);
  if (exactEmailDetection.test(normalized)
    || exactInternalDetection.test(normalized)
    || compactInternalDetection.test(compact)
    || compactSchoolOrClassDetection.test(compact)
    || /[\p{L}\p{N}]{1,64}@[\p{L}\p{N}]{3,253}/u.test(emailJoined)) return true;
  return sensitiveValues.some((sensitive) => {
    const sensitiveCompact = compactFamilyPolicyText(sensitive);
    return sensitiveCompact.length >= 2 && compact.includes(sensitiveCompact);
  });
}

export function containsQuantifiedEvaluation(value: unknown) {
  const canonical = canonicalEvaluationPolicyText(value);
  if (!canonical) return false;
  const compact = compactFamilyPolicyText(canonical);
  if (/\d+(?:[.,]\d+)?\s*점(?:\s*만점)?/u.test(canonical)
    || /\d{1,3}\s*%/u.test(canonical)
    || /\d{1,4}\s*\/\s*\d{1,4}/u.test(canonical)
    || /\d+(?:[.,]\d+)?\s*(?:등급|등|위)/u.test(canonical)
    || /\d+(?:[.,]\d+)?\s*out\s*of\s*\d+(?:[.,]\d+)?/iu.test(canonical)
    || /(?:별|⭐)\s*\d+(?:[.,]\d+)?\s*개/u.test(canonical)
    || /\d+(?:[.,]\d+)?\s*stars?\b/iu.test(canonical)
    || /star\s*rating\s*[:：-]?\s*\d+(?:[.,]\d+)?/iu.test(canonical)
    || /(?:^|[^\p{L}\p{N}])[a-f]\s*[+-](?=$|[^\p{L}\p{N}])/iu.test(canonical)
    || /^[a-f]$/iu.test(canonical)
    || /(?:grade|등급|평가|학점)\s*[:：-]?\s*[a-f](?:\s*[+-])?(?=$|[^\p{L}\p{N}])/iu.test(canonical)
    || /(?:^|[^\p{L}\p{N}])[a-f](?:\s*[+-])?\s*(?:grade|등급|학점)/iu.test(canonical)) return true;
  if (/\d+(?:점|등급|등|위)/u.test(compact) || /(?:별\d+개|\d+stars?)/iu.test(compact)) return true;
  return ["grade", "rating", "stars", "outof", "percentile", "평가", "등급", "총점", "만점"].some((root) => compact.includes(root));
}

export function containsQualitativeEvaluation(value: unknown) {
  const canonical = canonicalEvaluationPolicyText(value);
  if (!canonical) return false;
  const compact = compactFamilyPolicyText(canonical);
  const koreanScore = new RegExp(`(?:${koreanNumberWord.source})점|(?:평점|별점)(?:은|이|을|를|도)?(?:${koreanNumberWord.source})`, "u");
  return koreanScore.test(compact)
    || englishNumberPoints.test(canonical)
    || /(?:[일이삼사오육칠팔구십]+등|첫번째|상위권)/u.test(compact)
    || /(?:firstplace|top(?:ofthe|of)?class|bestinclass|classrank)/u.test(compact)
    || /(?:타고난|재주)/u.test(compact)
    || /(?:born(?:artist|painter|illustrator)|natural(?:art|artistic|drawing)?ability|(?:artist|artistic|drawing|creative)?potential|exceptional(?:art|artistic|drawing)?ability)/u.test(compact)
    || /(?:연령보다발달(?:수준)?이?앞서|또래보다발달(?:수준)?이?앞서|발달(?:수준)?이?(?:앞서|빠르)|전문가(?:수준|급)|초보(?:수준|단계))/u.test(compact)
    || /(?:advancedfor(?:their|the)?age|developmentallyadvanced|(?:expert|beginner)level)/u.test(compact)
    || /(?:잘했(?:어요|어|습니다|다)|멋진(?:작품|그림)|칭찬할만(?:한)?(?:그림|작품)?)/u.test(compact)
    || /(?:excellent|amazing|brilliant)(?:drawing|work|picture|artwork|art)/u.test(compact);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactFamilyText(value: unknown, sensitiveValues: string[] = [], max = 240) {
  if (containsFamilyPii(value, sensitiveValues)) return "[개인정보 제외]".slice(0, max);
  let text = normalizeFamilyPolicyText(value);
  text = text.replace(emailAddress, "[개인정보 제외]").replace(internalIdentifier, "[내부 정보 제외]").replace(schoolOrClass, "[학교 정보 제외]");
  for (const sensitive of sensitiveValues.map(normalizeFamilyPolicyText).filter((item) => item.length >= 2)) {
    text = text.replace(new RegExp(escapeRegExp(sensitive), "giu"), "[개인정보 제외]");
  }
  return text.slice(0, max);
}

export function isAllowedFamilyEvidence(value: unknown, sensitiveValues: string[] = []) {
  if (containsFamilyPii(value, sensitiveValues)
    || containsQuantifiedEvaluation(value)
    || containsQualitativeEvaluation(value)) return false;
  const text = redactFamilyText(value, sensitiveValues, 220);
  if (!text || greekOrCyrillic.test(text)) return false;
  const normalized = normalizeFamilyPolicyText(text);
  if (/\d{1,3}\s*%/u.test(normalized)) return false;
  const compact = compactFamilyPolicyText(normalized);
  return !forbiddenCompactRoots.some((root) => compact.includes(root));
}

function safeEvidence(value: unknown, sensitiveValues: string[]) {
  return isAllowedFamilyEvidence(value, sensitiveValues) ? redactFamilyText(value, sensitiveValues, 220) : "";
}

function parseElements(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean).slice(0, 6) : [];
  } catch {
    return [];
  }
}

export async function buildWeeklyGrowthReport(DB: D1Database, input: {
  linkId: string;
  studentId: string;
  reportStartAt: string;
  reportEndAt: string;
  sensitiveValues?: string[];
}): Promise<FamilyGrowthReport> {
  const sensitiveValues = input.sensitiveValues ?? [];
  const artworks = await DB.prepare(`SELECT f.position, a.id AS artworkId, r.favorite_part AS favoritePart, r.favorite_reason AS favoriteReason,
      r.spoken_description AS spokenDescription, r.story_text AS storyText
    FROM family_share_artworks f
    JOIN artworks a ON a.id = f.artwork_id AND a.student_id = ? AND a.status = 'complete'
    LEFT JOIN reflections r ON r.artwork_id = a.id
    WHERE f.link_id = ? ORDER BY f.position ASC`)
    .bind(input.studentId, input.linkId)
    .all<{ position: number; artworkId: string; favoritePart: string | null; favoriteReason: string | null; spokenDescription: string | null; storyText: string | null }>();
  const events = await DB.prepare(`SELECT f.position, e.student_answer AS studentAnswer, d.new_elements_json AS newElementsJson
    FROM family_share_artworks f
    JOIN coaching_events e ON e.artwork_id = f.artwork_id
    LEFT JOIN coaching_event_details d ON d.event_id = e.id
    WHERE f.link_id = ? AND e.created_at >= ? AND e.created_at <= ?
    ORDER BY f.position ASC, e.created_at ASC`)
    .bind(input.linkId, input.reportStartAt, input.reportEndAt)
    .all<{ position: number; studentAnswer: string | null; newElementsJson: string | null }>();

  const observations: FamilyGrowthReport["observations"] = [];
  const childWords: FamilyGrowthReport["childWords"] = [];
  const seenObservation = new Set<string>();
  const addObservation = (position: number, text: string) => {
    const key = `${position}:${text}`;
    if (!seenObservation.has(key)) observations.push({ artworkAnchor: `#artwork-${position + 1}`, text });
    seenObservation.add(key);
  };
  const addChildWords = (position: number, value: unknown) => {
    const text = safeEvidence(value, sensitiveValues);
    if (text && !childWords.some((item) => item.artworkAnchor === `#artwork-${position + 1}` && item.text === text)) childWords.push({ artworkAnchor: `#artwork-${position + 1}`, text });
  };

  for (const artwork of artworks.results) {
    addObservation(artwork.position, "한 작품을 완성하고 마음에 드는 부분을 돌아봤어요.");
    if (safeEvidence(artwork.favoriteReason, sensitiveValues)) addObservation(artwork.position, "그림에서 마음에 드는 부분과 그 이유를 자기 말로 설명했어요.");
    if (safeEvidence(artwork.spokenDescription, sensitiveValues) || safeEvidence(artwork.storyText, sensitiveValues)) addObservation(artwork.position, "그림 속 생각이나 사건을 말 또는 글로 이어 갔어요.");
    addChildWords(artwork.position, artwork.spokenDescription || artwork.storyText || artwork.favoriteReason || artwork.favoritePart);
  }
  for (const event of events.results) {
    if (parseElements(event.newElementsJson).length) addObservation(event.position, "질문 뒤에 새로운 요소를 선택해 그림에 더했어요.");
    addChildWords(event.position, event.studentAnswer);
  }

  return {
    period: { start: input.reportStartAt, end: input.reportEndAt },
    summary: `이번 주에는 작품 ${artworks.results.length}개에서 남긴 과정 기록을 모았어요.`,
    observations: observations.slice(0, 12),
    childWords: childWords.slice(0, 8),
    verificationLinks: artworks.results.map((artwork) => ({ artworkAnchor: `#artwork-${artwork.position + 1}`, label: `작품 ${artwork.position + 1} 확인` })),
    note: "관찰 문장과 아이가 남긴 말을 실제 작품과 함께 확인해 주세요.",
  };
}
