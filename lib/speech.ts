export type SpeechStatus = "idle" | "speaking" | "failed";

export type SpeechUtteranceLike = {
  lang: string;
  rate: number;
  pitch: number;
  voice: unknown;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export type SpeechEnvironment = {
  // 같은 발화 엔진을 감싼 환경 객체가 여럿이어도 소유권은 하나여야 한다.
  // 환경 객체 자체를 키로 쓰면 버튼마다 다른 소유자가 되어, 다른 버튼의 cancel이
  // 정상 중단이 아니라 실패로 보인다.
  engine?: object;
  createUtterance(text: string): SpeechUtteranceLike;
  speak(utterance: SpeechUtteranceLike): void;
  cancel(): void;
  koreanVoice(): unknown;
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(id: number): void;
};

export type SpeechSpeaker = {
  speak(text: string): void;
  stop(): void;
  dispose(): void;
};

export const SPEECH_START_TIMEOUT_MS = 4_000;

export function speechDurationCapMs(text: string) {
  return Math.min(20_000, Math.max(2_500, text.length * 180));
}

// 발화 엔진마다 지금 말하고 있는 utterance 토큰 하나.
// 발화별 콜백은 이 토큰과 자기 speaker의 activeToken을 함께 검사해서,
// 취소된 이전 발화의 onend/onerror가 새 발화의 타이머·UI 상태를 건드리지 못하게 한다.
const globalOwners = new WeakMap<object, { token: symbol | null }>();

function ownerBox(env: SpeechEnvironment) {
  const key = env.engine ?? env;
  let box = globalOwners.get(key);
  if (!box) { box = { token: null }; globalOwners.set(key, box); }
  return box;
}

export function createSpeechSpeaker(env: SpeechEnvironment, onStatus: (status: SpeechStatus) => void): SpeechSpeaker {
  const box = ownerBox(env);
  let disposed = false;
  let activeToken: symbol | null = null;
  let timer: number | null = null;

  function clearTimer() {
    if (timer !== null) { env.clearTimeout(timer); timer = null; }
  }

  function armTimer(ms: number, handler: () => void) {
    clearTimer();
    timer = env.setTimeout(handler, ms);
  }

  function finish(token: symbol, status: SpeechStatus) {
    if (activeToken !== token) return;
    activeToken = null;
    clearTimer();
    if (box.token === token) box.token = null;
    if (!disposed) onStatus(status);
  }

  return {
    speak(text: string) {
      if (disposed) return;
      const token = Symbol("wiggle-utterance");
      // 소유권을 먼저 선점한 뒤 취소해야, 취소된 이전 발화의 onerror가
      // "선점당한 취소"임을 box.token으로 구분할 수 있다.
      activeToken = token;
      box.token = token;
      env.cancel();
      let started = false;
      const utterance = env.createUtterance(text.replace(/\s+/g, " ").trim());
      utterance.lang = "ko-KR";
      utterance.rate = 0.82;
      utterance.pitch = 1.05;
      const voice = env.koreanVoice();
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        if (activeToken !== token) return;
        started = true;
        armTimer(speechDurationCapMs(text), () => { finish(token, "idle"); env.cancel(); });
      };
      utterance.onend = () => finish(token, "idle");
      // 다른 발화가 소유권을 가져가며 취소한 경우(interrupted/canceled)는 실패가 아니다.
      utterance.onerror = () => finish(token, box.token === token ? "failed" : "idle");
      onStatus("speaking");
      armTimer(SPEECH_START_TIMEOUT_MS, () => {
        if (activeToken !== token || started) return;
        finish(token, "failed");
        env.cancel();
      });
      env.speak(utterance);
    },
    stop() {
      const token = activeToken;
      if (!token) return;
      finish(token, "idle");
      env.cancel();
    },
    dispose() {
      const token = activeToken;
      disposed = true;
      activeToken = null;
      clearTimer();
      if (token && box.token === token) {
        box.token = null;
        env.cancel();
      }
    },
  };
}

let browserEnvironment: SpeechEnvironment | null = null;

export function browserSpeechEnvironment(): SpeechEnvironment | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return null;
  if (browserEnvironment) return browserEnvironment;
  browserEnvironment = {
    engine: window.speechSynthesis,
    createUtterance: (text) => new SpeechSynthesisUtterance(text) as unknown as SpeechUtteranceLike,
    speak: (utterance) => window.speechSynthesis.speak(utterance as SpeechSynthesisUtterance),
    cancel: () => window.speechSynthesis.cancel(),
    koreanVoice: () => window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("ko")) ?? null,
    setTimeout: (handler, ms) => window.setTimeout(handler, ms),
    clearTimeout: (id) => window.clearTimeout(id),
  };
  return browserEnvironment;
}
