import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const speechSource = await readFile(new URL("../lib/speech.ts", import.meta.url), "utf8");
const executableJavaScript = ts.transpileModule(speechSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const speech = await import(`data:text/javascript;base64,${Buffer.from(executableJavaScript).toString("base64")}`);
const { createSpeechSpeaker, selectKoreanVoice, SPEECH_START_TIMEOUT_MS, speechDurationCapMs } = speech;

// 실제 speechSynthesis처럼 전역 발화 하나만 유지하고, cancel 시 진행 중이던
// utterance에 interrupted 오류 이벤트를 비동기로 흉내 낼 수 있는 가짜 환경.
function fakeEnvironment() {
  let timerId = 0;
  let clock = 0;
  const timers = new Map();
  const utterances = [];
  let current = null;
  const pendingEvents = [];
  const engine = { name: "fake-speech-engine" };
  const env = {
    engine,
    createUtterance: (text) => {
      const utterance = { text, lang: "", rate: 0, pitch: 0, voice: null, onstart: null, onend: null, onerror: null };
      utterances.push(utterance);
      return utterance;
    },
    speak: (utterance) => { current = utterance; },
    cancel: () => {
      const interrupted = current;
      current = null;
      if (interrupted) pendingEvents.push(() => interrupted.onerror?.());
    },
    koreanVoice: () => ({ lang: "ko-KR", name: "가짜 한국어 음성" }),
    setTimeout: (handler, ms) => { timerId += 1; timers.set(timerId, { handler, at: clock + ms }); return timerId; },
    clearTimeout: (id) => { timers.delete(id); },
  };
  return {
    env,
    engine,
    utterances,
    speakingNow: () => current,
    flushEvents: () => { while (pendingEvents.length) pendingEvents.shift()(); },
    startCurrent: () => { current?.onstart?.(); },
    endCurrent: () => { const done = current; current = null; done?.onend?.(); },
    errorCurrent: () => { const failed = current; current = null; failed?.onerror?.(); },
    advance: (ms) => {
      clock += ms;
      for (const [id, timer] of [...timers.entries()].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= clock) { timers.delete(id); timer.handler(); }
      }
    },
  };
}

function trackedSpeaker(fake, env = fake.env) {
  const states = [];
  const speaker = createSpeechSpeaker(env, (state) => states.push(state));
  return { speaker, states, last: () => states.at(-1) ?? "idle" };
}

// 실제 SpeakButton은 각자 browserSpeechEnvironment()를 호출한다. 같은 엔진을 감싼
// 별개의 환경 객체를 만들어, 소유권이 환경 객체가 아니라 엔진 단위인지 확인한다.
function separateWrapper(fake) {
  return { engine: fake.engine, ...fake.env };
}

test("a completed utterance returns the button to idle", () => {
  const fake = fakeEnvironment();
  const { speaker, last } = trackedSpeaker(fake);
  speaker.speak("안녕");
  assert.equal(last(), "speaking");
  fake.startCurrent();
  fake.endCurrent();
  assert.equal(last(), "idle");
});

test("speech keeps the scenario text and uses natural Korean playback defaults", () => {
  const fake = fakeEnvironment();
  const { speaker } = trackedSpeaker(fake);
  speaker.speak("  동물을 고르고,   그림 비밀번호를 골라요.  ");
  assert.equal(fake.speakingNow()?.text, "동물을 고르고, 그림 비밀번호를 골라요.");
  assert.equal(fake.speakingNow()?.lang, "ko-KR");
  assert.equal(fake.speakingNow()?.rate, 0.96);
  assert.equal(fake.speakingNow()?.pitch, 1);
  assert.equal(fake.speakingNow()?.voice?.name, "가짜 한국어 음성");
});

test("the preferred Korean voice is chosen instead of the first arbitrary Korean voice", () => {
  const voices = [
    { lang: "en-US", name: "English" },
    { lang: "ko-KR", name: "Old Korean Network Voice", localService: false },
    { lang: "ko-KR", name: "Microsoft SunHi", localService: true },
  ];
  assert.equal(selectKoreanVoice(voices)?.name, "Microsoft SunHi");
});

test("rapid re-taps keep the newest utterance speaking even when the old cancellation lands late", () => {
  const fake = fakeEnvironment();
  const { speaker, last } = trackedSpeaker(fake);
  const secondText = "두 번째로 읽는 훨씬 더 길고 긴 안내 문장이에요";
  assert.ok(speechDurationCapMs(secondText) > SPEECH_START_TIMEOUT_MS + 1);
  speaker.speak("첫 번째 문장");
  fake.startCurrent();
  speaker.speak(secondText);
  // 이전 utterance의 interrupted 이벤트가 늦게 도착해도 새 발화 상태를 지우면 안 된다.
  fake.flushEvents();
  assert.equal(last(), "speaking");
  assert.equal(fake.speakingNow()?.text, secondText);
  fake.startCurrent();
  // 이전 발화의 시작 감시 타이머가 남아 있었다면 여기서 새 발화를 실패로 끝내 버린다.
  fake.advance(SPEECH_START_TIMEOUT_MS + 1);
  assert.equal(last(), "speaking");
  fake.endCurrent();
  assert.equal(last(), "idle");
});

test("starting another button stops the first one as idle, not failed", () => {
  const fake = fakeEnvironment();
  const first = trackedSpeaker(fake);
  const second = trackedSpeaker(fake);
  first.speaker.speak("첫 버튼");
  fake.startCurrent();
  second.speaker.speak("둘째 버튼");
  fake.flushEvents();
  assert.equal(first.last(), "idle");
  assert.equal(second.last(), "speaking");
  assert.equal(fake.speakingNow()?.text, "둘째 버튼");
});

test("buttons holding separate wrappers of one engine still share speech ownership", () => {
  const fake = fakeEnvironment();
  // 소유권이 엔진이 아니라 래퍼 객체 단위면 첫 버튼이 idle이 아니라 failed(⚠️)로 남는다.
  const first = trackedSpeaker(fake, separateWrapper(fake));
  const second = trackedSpeaker(fake, separateWrapper(fake));
  first.speaker.speak("첫 버튼");
  fake.startCurrent();
  second.speaker.speak("둘째 버튼");
  fake.flushEvents();
  assert.equal(first.last(), "idle", "다른 버튼이 가져간 발화는 실패가 아니라 정상 중단이다");
  assert.equal(second.last(), "speaking");
  fake.startCurrent();
  fake.endCurrent();
  assert.equal(second.last(), "idle");
});

test("a superseded button's stop never cancels the speech that replaced it", () => {
  const fake = fakeEnvironment();
  const first = trackedSpeaker(fake, separateWrapper(fake));
  const second = trackedSpeaker(fake, separateWrapper(fake));
  first.speaker.speak("첫 버튼");
  fake.startCurrent();
  second.speaker.speak("둘째 버튼");
  fake.startCurrent();
  // 취소 이벤트가 아직 도착하기 전에 이전 버튼이 뒤늦게 멈춰도 새 발화를 끊으면 안 된다.
  first.speaker.stop();
  assert.equal(fake.speakingNow()?.text, "둘째 버튼");
  assert.equal(second.last(), "speaking");
  assert.equal(first.last(), "idle");
});

test("a superseded button's start timeout never cancels the speech that replaced it", () => {
  const fake = fakeEnvironment();
  const first = trackedSpeaker(fake, separateWrapper(fake));
  const second = trackedSpeaker(fake, separateWrapper(fake));
  first.speaker.speak("시작하지 못한 첫 버튼");
  const longText = "둘째 버튼이 읽는 아주 길고 긴 안내 문장이에요";
  assert.ok(speechDurationCapMs(longText) > SPEECH_START_TIMEOUT_MS + 1);
  second.speaker.speak(longText);
  fake.startCurrent();
  // 첫 버튼의 시작 감시 타이머가 뒤늦게 터져도 남의 발화를 취소하면 안 된다.
  fake.advance(SPEECH_START_TIMEOUT_MS + 1);
  assert.equal(fake.speakingNow()?.text, longText);
  assert.equal(second.last(), "speaking");
  assert.notEqual(first.last(), "failed");
});

test("an idle button unmounting never cancels a speaking button that wraps the same engine", () => {
  const fake = fakeEnvironment();
  const speaking = trackedSpeaker(fake, separateWrapper(fake));
  const idle = trackedSpeaker(fake, separateWrapper(fake));
  speaking.speaker.speak("계속 읽는 중");
  fake.startCurrent();
  idle.speaker.dispose();
  fake.flushEvents();
  assert.equal(fake.speakingNow()?.text, "계속 읽는 중");
  assert.equal(speaking.last(), "speaking");
});

test("unmounting an idle button never cancels another button's speech", () => {
  const fake = fakeEnvironment();
  const speakingButton = trackedSpeaker(fake);
  const idleButton = trackedSpeaker(fake);
  speakingButton.speaker.speak("계속 읽는 중");
  fake.startCurrent();
  idleButton.speaker.dispose();
  fake.flushEvents();
  assert.equal(fake.speakingNow()?.text, "계속 읽는 중");
  assert.equal(speakingButton.last(), "speaking");
});

test("unmounting the speaking button cancels its own utterance without emitting more state", () => {
  const fake = fakeEnvironment();
  const { speaker, states } = trackedSpeaker(fake);
  speaker.speak("떠나는 버튼");
  fake.startCurrent();
  const before = states.length;
  speaker.dispose();
  fake.flushEvents();
  assert.equal(fake.speakingNow(), null);
  assert.equal(states.length, before);
});

test("tapping while speaking stops speech and returns to idle", () => {
  const fake = fakeEnvironment();
  const { speaker, last } = trackedSpeaker(fake);
  speaker.speak("멈출 문장");
  fake.startCurrent();
  speaker.stop();
  fake.flushEvents();
  assert.equal(last(), "idle");
  assert.equal(fake.speakingNow(), null);
});

test("an engine error while owning speech shows the failed fallback", () => {
  const fake = fakeEnvironment();
  const { speaker, last } = trackedSpeaker(fake);
  speaker.speak("오류 나는 문장");
  fake.startCurrent();
  fake.errorCurrent();
  assert.equal(last(), "failed");
});

test("speech that never starts times out into the failed fallback", () => {
  const fake = fakeEnvironment();
  const { speaker, last } = trackedSpeaker(fake);
  speaker.speak("무음 문장");
  assert.equal(last(), "speaking");
  fake.advance(SPEECH_START_TIMEOUT_MS + 1);
  assert.equal(last(), "failed");
  assert.equal(fake.speakingNow(), null);
});

test("speech that starts but never ends is capped back to idle", () => {
  const fake = fakeEnvironment();
  const { speaker, last } = trackedSpeaker(fake);
  const text = "끝나지 않는 아주 긴 문장";
  speaker.speak(text);
  fake.startCurrent();
  fake.advance(speechDurationCapMs(text) + 1);
  assert.equal(last(), "idle");
  assert.equal(fake.speakingNow(), null);
});

test("retrying after a failure can succeed", () => {
  const fake = fakeEnvironment();
  const { speaker, last } = trackedSpeaker(fake);
  speaker.speak("다시 시도");
  fake.errorCurrent();
  assert.equal(last(), "failed");
  speaker.speak("다시 시도");
  fake.startCurrent();
  fake.endCurrent();
  assert.equal(last(), "idle");
});
