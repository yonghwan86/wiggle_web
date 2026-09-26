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
  // 10분 20회(2026-09-26 사용자 결정으로 8 → 20). 답 뒤 제안을 다시 쓰는 호출은 이 예산을
  // 쓰지 않는다 — 도움 기록당 첫 답 한 번으로 묶여 있어 ask 횟수를 넘을 수 없다.
  assert.match(route, /rateLimit\(`ai-create:\$\{student\.id\}`, 20, 10 \* 60\)/);
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
  /* 2026-09-26 사용자 결정: 「깊이로(그 대상을 더)」와 「옆으로(어울리는 것을 하나 더)」 중
     어느 쪽을 줘도 상관없다. 새 주제를 막던 줄은 뺐다. 지켜야 할 것은 **한 번에 하나**와
     출발점이 아이라는 것뿐이다. */
  assert.match(collaborator, /행동 하나만 제안한다/);
  assert.match(collaborator, /아이가 그린 것이나 아이가 알려 준 답에서 출발해/);
  assert.doesNotMatch(collaborator, /새 주제로 옮기지 않는다|새 소재나 새 주제를 네가 가져오지 않는다/);
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
  const [route, studio, interpreterAsk] = await Promise.all([read("../app/api/ai/coaching/route.ts"), read("../app/components/DrawingStudio.tsx"), read("../lib/openai-coaching.ts")]);
  assert.match(route, /const openedBy = payload\.openedBy === "mongri" \? "mongri" : "child";/);
  assert.match(route, /childChoice, openedBy, firstTurn, currentStep/);
  /* 첫 만남이면 알아맞히지 말고 무엇을 그리는지 묻는다(2026-09-26 사용자 결정, P-014의 뿌리).
     지시문이 참조하는 이름과 실제 맥락 키가 같아야 모델이 찾는다 — opened_by/openedBy처럼 어긋나면 안 된다. */
  assert.match(route, /const firstTurn = recentEvents\.length === 0;/);
  assert.match(interpreterAsk, /맥락의 firstTurn이 true면/);
  assert.match(interpreterAsk, /무엇을 그리고 있는지 아이에게 묻는다/);
  assert.match(studio, /openedBy: auto \? "mongri" : "child"/);
});

/* 2026-09-23에 몽그리 카드를 읽기 전용으로 바꿨다가, 2026-09-26 사용자 결정으로 답하기를 되살렸다
 * (인계 mongri-floating-handoff). 되살리되 **읽기 전용으로 바꾸게 만든 세 이유를 설계로 막는다**:
 *   ① 답을 골라야 `이제 그려 볼 일`이 나타나 무엇을 할지 늦게 알았다 → 처음부터 보인다.
 *   ② 답을 바꿔 두 번 보내면 409 `이미 처리한 도움 기록이에요`였다 → 새 `reply`가 같은 줄을 덮어쓴다.
 *   ③ 칩을 눌러도 반응이 없어 아무 일도 없어 보였다 → 고른 표시(체크+aria-pressed)가 즉시 뜬다. */
test("몽그리 카드에서 바로 답하되, 읽기 전용으로 갔던 세 이유를 다시 만들지 않는다", async () => {
  const studio = await read("../app/components/DrawingStudio.tsx");
  const css = await read("../app/globals.css");

  // 관찰 한마디 → 궁금한 점 → 지금 그려 볼 일이 한 번에 보인다.
  assert.match(studio, /\{coaching\.growthEvent && <p className="grimi-observed">\{coaching\.growthEvent\}<\/p>\}/);
  assert.match(studio, /<p className="eyebrow">몽그리가 궁금해요<\/p>[\s\S]{0,200}<h2>\{coaching\.question\}<\/h2>/);
  // 다음 행동은 조건 없이 보인다 — 예전에는 `{answer && (` 뒤에 있었다.
  assert.match(studio, /<div className="next-action">\s*<small>이제 그려 볼 일<\/small>/);
  /* 「다른 것도 물어보기」는 2026-09-26에 없앴다 — 머리 줄 「몽그리 부르기」와 같은 askGrimi()였다.
     다시 묻는 길이 사라지면 안 되므로, 그 길이 머리 줄에 하나 남아 있는지를 대신 지킨다. */
  assert.doesNotMatch(studio, /className="button secondary full grimi-again"/);
  assert.match(studio, /className="studio-action is-helper"[\s\S]{0,400}몽그리 부르기/);
  assert.match(css, /\.grimi-observed \{/);

  // ③ 칩을 고르면 즉시 표가 난다. 색만으로 구분하지 않는다.
  assert.match(studio, /aria-pressed=\{on\}/);
  assert.match(studio, /\{on && <span className="grimi-chip-check" aria-hidden="true">✓<\/span>\}/);
  // 선택지와 직접 쓰기 중 **하나만** 나간다 — 한쪽을 고르면 다른 쪽을 비운다.
  assert.match(studio, /setPickedAnswer\(on \? "" : choice\.answer\); setOwnAnswer\(""\);/);
  assert.match(studio, /setOwnAnswer\(event\.target\.value\); setPickedAnswer\(""\);/);
  assert.match(studio, /const replyText = \(pickedAnswer \|\| ownAnswer\)\.trim\(\);/);
  // 빈 답은 보내지 않고, 보내는 중에 두 번 눌러도 한 번만 나간다.
  assert.match(studio, /disabled=\{!replyText \|\| replyState === "sending"\}/);
  /* 상태(replyState)만으로는 연속 탭을 못 막는다 — setState가 비동기라 같은 틱에 두 번 누르면 둘 다
     통과한다(2026-09-26 실측: 요청이 2번 나갔다). 완성 저장과 같은 ref 잠금을 쓴다. */
  assert.match(studio, /if \(!artwork \|\| !coaching \|\| !replyText \|\| replyingRef\.current\) return;/);
  assert.match(studio, /replyingRef\.current = true;/);
  assert.match(studio, /\} finally \{\s*replyingRef\.current = false;/);
  // ② 즉시 답하기는 그린 뒤 기록용 `answer`가 아니라 덮어쓰는 `reply`로 간다.
  assert.match(studio, /action: "reply", artworkId: artwork\.id, eventId: coaching\.eventId, answer: replyText/);
  assert.doesNotMatch(studio, /action: "answer"/, "그린 뒤 기록 경로에 즉시 답을 붙이면 409가 돌아온다");
  assert.doesNotMatch(studio, /그린 뒤 ‘했어요’|과정에 남겼어요/);

  // 다시 부르거나 닫을 때 앞 도움 기록은 dismiss로 닫는다 — 열린 채로 쌓이지 않는다.
  assert.match(studio, /function closeCoachingEvent\(eventId\?: string\)[\s\S]{0,320}action: "dismiss"/);
  assert.match(studio, /closeCoachingEvent\(coaching\?\.eventId\);\s*\n\s*setCoaching\(null\)/);
});

test("즉시 답하기는 그린 뒤 기록과 다른 경로이고, 답을 바꿔도 막히지 않는다", async () => {
  const route = await read("../app/api/ai/coaching/route.ts");
  /* 2026-09-26: 카드에서 바로 답하는 `reply`를 새로 만들었다. 기존 `answer`에 붙이지 않은 이유가 셋이다.
     ① `answer`는 "답하고 그린 뒤"를 기록해 document·image·newElements를 요구한다 — 즉시 답에는 그린 것이 없다.
     ② `answer`는 한 번 기록되면 409를 낸다. 아이가 고른 답을 바꾸면 그대로 막혔다.
     ③ 답은 다음 질문의 맥락으로만 쓰여 새 작품 버전을 만들 이유가 없다. */
  assert.match(route, /if \(action === "reply"\)/);
  assert.match(route, /const answer = cleanText\(payload\.answer, 80\);/);
  // 즉시 답에는 그림을 요구하지 않는다.
  const reply = route.slice(route.indexOf('if (action === "reply")'), route.indexOf('if (action === "answer")'));
  assert.doesNotMatch(reply, /validateDrawDocument|parseImageDataUrl|newElements/, "즉시 답에 그림·요소를 요구하면 안 된다");
  // 같은 줄을 덮어쓴다 — 두 번째 답이 409로 막히지 않는다.
  assert.match(reply, /UPDATE coaching_events SET student_answer = \? WHERE id = \?/);
  assert.match(reply, /status <> 'dismissed'/);
  assert.doesNotMatch(reply, /already_recorded|COACHING_ALREADY_HANDLED/);
  // 그린 뒤 기록 경로는 그대로 남아 있다.
  assert.match(route, /kind: "question_answer"/);
});

test("답을 들으면 「이제 그려 볼 일」 한 줄을 아이 말에 맞춰 다시 쓴다", async () => {
  const route = await read("../app/api/ai/coaching/route.ts");
  const prompts = await read("../lib/openai-coaching.ts");
  const studio = await read("../app/components/DrawingStudio.tsx");
  const reply = route.slice(route.indexOf('if (action === "reply")'), route.indexOf('if (action === "answer")'));

  /* 2026-09-26 사용자 결정. 물어만 보고 답을 쓰지 않으면 아이 눈에는 답해도 아무 일이 없는 것과 같다.
     화면에 떠 있는 「이제 그려 볼 일」은 아이가 답하기 **전에** 만들어진 말이라 그 한 줄만 다시 받는다. */
  assert.match(reply, /kind: "reply_next_action"/);
  // 새 질문을 하지 않는다 — 카드가 도화지를 가리고 있고 "한 번에 하나만 묻는다"가 제품 원칙이다.
  assert.doesNotMatch(prompts.slice(prompts.indexOf("REPLY_NEXT_ACTION_INSTRUCTIONS"), prompts.indexOf("export const STORY_INTERPRETATION")), /질문은 정확히 하나|choices/);
  assert.match(prompts, /새로 묻지 말고/);

  // 예산: 도움 기록당 첫 답 한 번만 부른다. 답을 고쳐 보내면 글자만 덮어쓴다.
  assert.match(reply, /const firstAnswer = before\?\.status !== "answered";/);
  assert.match(reply, /if \(!firstAnswer\) return noStoreJson\(\{ ok: true, answer \}\);/);

  // 몽그리가 쉬어도 답은 이미 저장됐다 — 실패는 화면의 종전 줄을 그대로 둔다.
  assert.match(reply, /\} catch \{\s*\n\s*return noStoreJson\(\{ ok: true, answer \}\);/);

  // 안전 검사는 코칭의 next_action과 같은 것을 쓴다(규칙이 갈라지면 한쪽에 구멍이 남는다).
  assert.match(prompts, /drawingActionPattern\.test\(nextAction\) \|\| !isChildSafeCoachingText\(nextAction\)/);

  // 그림을 싣지 않는다 — 아이가 「이렇게 답할래」를 누른 뒤 기다리지 않아야 한다.
  assert.doesNotMatch(reply, /imageDataUrl/);

  // 화면은 그 자리에서 줄만 바꾼다. 오지 않으면 그대로 둔다.
  assert.match(studio, /if \(data\.nextAction\) setCoaching\(\(current\) => current \? \{ \.\.\.current, nextAction: data\.nextAction as string \} : current\);/);
});
