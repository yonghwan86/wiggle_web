import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

/* 몽그리가 먼저 말을 거는 규칙 (2026-09-12 사용자 결정).
 * 종전 원칙은 "아이가 호출했을 때만 개입한다"였다. 저학년이 버튼을 먼저 찾지 않아
 * 기능이 없는 것과 같다는 판단으로 자동 개입으로 바꿨다. 대신 그리기를 막지 않는 것이 조건이다.
 * 이 시험은 "언제 뜨고 언제 안 뜨는가"를 코드에 묶어 둔다 — 숫자가 흔들리면 교실 경험이 흔들린다. */

test("자동 몽그리는 합의한 조건을 그대로 갖는다", async () => {
  const studio = await read("../app/components/DrawingStudio.tsx");
  assert.match(studio, /minOps: 8,/, "빈 도화지에서는 뜨지 않는다 — 확장할 것이 없다");
  assert.match(studio, /settleMs: 120_000,/, "시작하고 2분 안에는 말 걸지 않는다");
  assert.match(studio, /idleMs: 75_000,/, "손이 멈춘 뒤에만 뜬다");
  assert.match(studio, /afterManualMs: 30_000,/, "직접 부른 직후는 건너뛴다");
  assert.match(studio, /gapMs: 300_000,/, "자동끼리 최소 5분 간격");
  assert.match(studio, /maxPerArtwork: 2,/, "그림 한 장에 자동은 두 번까지");
});

test("그리는 중에는 절대 뜨지 않고, 완성·충돌·선생님 보기 중에도 멈춘다", async () => {
  const studio = await read("../app/components/DrawingStudio.tsx");
  const ready = studio.slice(studio.indexOf("const autoGrimiReady"), studio.indexOf("useEffect(() => {", studio.indexOf("const autoGrimiReady")));
  // 마지막 획에서 idleMs가 지나야 한다 = 획을 긋는 도중에는 조건이 성립하지 않는다.
  assert.match(ready, /now - lastStrokeAtRef\.current < AUTO_GRIMI\.idleMs\) return false/);
  assert.match(ready, /artwork\.status === "complete"\) return false/);
  assert.match(ready, /grimiLoading \|\| grimiOpen \|\| reflectionOpen \|\| interpretLoading\) return false/);
  // 2026-09-20: 손을 들고 선생님을 기다리는 아이도 자동 개입에서 뺐다. 손든 상태는 "손이 멈춘 상태"라
  // idleMs 조건에 그대로 걸려, 막지 않으면 선생님을 부른 직후 몽그리가 끼어든다.
  assert.match(ready, /conflictDraftRef\.current \|\| teacherViewing \|\| handRaised\) return false/);
  assert.match(ready, /ops\.length < AUTO_GRIMI\.minOps\) return false/);
  // 획을 그을 때마다 시계를 다시 잰다. 이것이 없으면 그리는 중에도 시간이 흐른다.
  assert.match(studio, /lastStrokeAtRef\.current = Date\.now\(\);/);
});

test("자동으로 열린 카드는 그리기를 막지 않는다", async () => {
  const [studio, css] = await Promise.all([read("../app/components/DrawingStudio.tsx"), read("../app/globals.css")]);
  // 다시 그리기 시작하면 스스로 접힌다.
  assert.match(studio, /if \(autoGrimi && grimiOpen && !grimiCollapsed\) setGrimiCollapsed\(true\);/);
  // 화면을 덮는 모달이 아니라 옆 패널이다 — 배경을 가리는 modal-backdrop을 쓰지 않는다.
  assert.match(studio, /<aside className=\{`grimi-panel\$\{grimiCollapsed \? " collapsed" : ""\}`\}/);
  // 누가 먼저 말을 걸었는지 아이에게 알린다.
  assert.match(studio, /내가 먼저 말 걸었어/);
  assert.match(css, /\.grimi-auto-tag \{/);
});

test("자동 호출도 수동과 같은 안전 규칙을 지난다", async () => {
  const [studio, route, prompts] = await Promise.all([
    read("../app/components/DrawingStudio.tsx"),
    read("../app/api/ai/coaching/route.ts"),
    read("../lib/openai-coaching.ts"),
  ]);
  // 자동이든 수동이든 같은 askGrimi를 지나 같은 API로 간다 — 안전 필터를 우회하는 두 번째 길을 만들지 않는다.
  assert.equal((studio.match(/action: "ask"/g) ?? []).length, 1);
  assert.match(studio, /void askGrimi\(\{ auto: true \}\)/);
  // 서버의 학생당 상한은 그대로다(10분에 8번).
  assert.match(route, /rateLimit\(`ai-create:\$\{student\.id\}`, 8, 10 \* 60\)/);
  // 평가·판정 금지는 프롬프트에 그대로 남아 있어야 한다.
  assert.match(prompts, /점수, 순위, 칭찬 판정, 평가, 재능 진단/);
});

test("프롬프트가 역할·대상과 어긋나지 않는다", async () => {
  const prompts = await read("../lib/openai-coaching.ts");
  const collaborator = prompts.slice(prompts.indexOf("STUDENT_COACHING_INSTRUCTIONS"), prompts.indexOf("STORY_INTERPRETATION_INSTRUCTIONS"));
  const interpreter = prompts.slice(prompts.indexOf("STORY_INTERPRETATION_INSTRUCTIONS"), prompts.indexOf("TEACHER_DRAFT_INSTRUCTIONS"));
  // 대상은 초등 3~6학년이다(2026-09-12 사용자 정정).
  assert.match(collaborator, /초등학교 3~6학년/);
  assert.doesNotMatch(prompts, /1~2학년|저학년/);
  // 스키마가 next_action을 필수로 강제하므로, "앞서 끌고 가지 않는다"로 부정하지 않는다.
  assert.doesNotMatch(collaborator, /앞서 끌고 가지 않는다/);
  assert.match(collaborator, /행동 하나만 제안하고, 새 주제로 옮기지 않는다/);
  // uncertain일 때 next_action도 단정하지 않아야 한다 — 플래그가 장식으로 남지 않게.
  assert.match(collaborator, /uncertain=true이면 next_action도/);
  // 누가 먼저 말을 걸었는지 모델이 알아야 말투를 고를 수 있다.
  assert.match(collaborator, /opened_by/);
  /* 틀리는 해석자(학습 과정 4항)를 2026-09-26에 「확신도로 갈린다」로 개정했다(P-014, 사용자 "가로 가자").
     종전에는 "일부러 덜 구체적으로 짐작한다 … 두 번째로 그럴듯한 읽기를 고른다"였는데, 그 전제인
     "그럴듯하게 살짝 빗나간 짐작"이 성립하려면 첫 짐작이 맞아야 한다. 그림이 작게 들어가 첫 짐작부터
     틀리던 상태에서는 완전히 무작위가 됐다(운영 제보 "집을 그리면 다른 걸로 추측해버린다").
     목적(아이가 자기 말로 고치게 하기)은 그대로다. */
  assert.match(interpreter, /짐작은 네가 실제로 본 것에서 나온다\. 일부러 빗나가게 고르지 않는다\./);
  assert.match(interpreter, /알아볼 수 있으면 본 대로 짐작하고 아이에게 확인을 청한다/);
  assert.match(interpreter, /알아보기 어려우면 아무 이름이나 대지 말고 갈래로 말한다/);
  assert.match(interpreter, /자기 말로 고칠 자리를 남기는 것이 목적이다/);
  assert.doesNotMatch(interpreter, /두 번째로 그럴듯한 읽기/, "일부러 빗나가게 시키던 규칙이 되살아나면 안 된다");
  assert.match(interpreter, /하나만 네 짐작과 같다는 답이고 나머지는 모두 다르다는 답이다/);
  // answer가 최상위가 아니라 각 choice의 필드임을 분명히 한다(스키마는 guess·choices만 받는다).
  assert.match(interpreter, /각 choice의 answer는/);
});

test("서버가 누가 열었는지 함께 보낸다", async () => {
  const [route, studio] = await Promise.all([read("../app/api/ai/coaching/route.ts"), read("../app/components/DrawingStudio.tsx")]);
  assert.match(route, /const openedBy = payload\.openedBy === "mongri" \? "mongri" : "child";/);
  assert.match(route, /childChoice, openedBy, currentStep/);
  assert.match(studio, /openedBy: auto \? "mongri" : "child"/);
});

/* 2026-09-23 사용자 결정: 몽그리 카드는 읽기 전용이다.
 * 아이가 답 칩을 고르고 `그린 뒤 했어요`를 눌러 답을 보내던 왕복을 없앴다. 그 왕복은
 * 같은 질문에 답을 두 번 보내면 409 `이미 처리한 도움 기록이에요`를 띄웠고(선택을 바꾸면
 * 단추가 다시 열렸다), 답을 골라야 `이제 그려 볼 일`이 나타나 아이가 무엇을 할지 늦게 알았다. */
test("몽그리 카드는 읽고 바로 그리러 간다 — 답을 보내는 길이 없다", async () => {
  const studio = await read("../app/components/DrawingStudio.tsx");
  const css = await read("../app/globals.css");

  // 관찰 한마디 → 궁금한 점 → 지금 그려 볼 일이 한 번에 보인다.
  assert.match(studio, /\{coaching\.growthEvent && <p className="grimi-observed">\{coaching\.growthEvent\}<\/p>\}/);
  assert.match(studio, /<p className="eyebrow">몽그리가 궁금해요<\/p>[\s\S]{0,200}<h2>\{coaching\.question\}<\/h2>/);
  // 다음 행동은 조건 없이 보인다 — 예전에는 `{answer && (` 뒤에 있었다.
  assert.match(studio, /<div className="next-action">\s*<small>이제 그려 볼 일<\/small>/);
  assert.match(studio, /className="button secondary full grimi-again"[\s\S]{0,240}다른 것도 물어보기/);
  assert.match(css, /\.grimi-observed \{/);

  // 답을 보내는 길이 남아 있으면 안 된다.
  assert.doesNotMatch(studio, /recordCoachingAnswer|answerSaved|answerLabel|grimi-chips|direct-answer/);
  assert.doesNotMatch(studio, /action: "answer"/);
  assert.doesNotMatch(studio, /그린 뒤 ‘했어요’|과정에 남겼어요/);

  // 다시 부르거나 닫을 때 앞 도움 기록은 dismiss로 닫는다 — 열린 채로 쌓이지 않는다.
  assert.match(studio, /function closeCoachingEvent\(eventId\?: string\)[\s\S]{0,320}action: "dismiss"/);
  assert.match(studio, /closeCoachingEvent\(coaching\?\.eventId\);\s*\n\s*setCoaching\(null\)/);
});
