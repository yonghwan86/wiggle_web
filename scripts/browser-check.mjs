// 실제 Chrome을 CDP로 띄워 CSS cascade 뒤의 computed size, 가로 스크롤, 가려진 버튼,
// 초점 이동을 측정한다. 소스 문자열 검사로는 잡히지 않는 UX 회귀를 잡기 위한 도구다.
// 사용: node scripts/browser-check.mjs [baseUrl]
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.argv[2] ?? "http://localhost:3000";
const IPAD_MODE = process.argv.includes("--ipad");
const DESKTOP_MODE = process.argv.includes("--desktop");
const CHROME_CANDIDATES = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const VIEWPORTS = IPAD_MODE ? [
  { name: "iPad-768x1024", width: 768, height: 1024 },
  // 실기기 사파리는 상단 크롬(탭 바 포함 ~140px)만큼 낮다 — 2026-08-20 iPad mini 실기기에서
  // 이 높이 때문에 도구 패널 하단(굵기·색)이 접혀 들어간 보고가 있었다. 낮은 높이를 상시 검증한다.
  { name: "iPad-768x880-safari", width: 768, height: 880 },
  { name: "iPad-820x1180", width: 820, height: 1180 },
] : DESKTOP_MODE ? [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "desktop-1920x1080", width: 1920, height: 1080 },
] : [
  { name: "320x568", width: 320, height: 568 },
  { name: "390x844", width: 390, height: 844 },
  { name: "844x390", width: 844, height: 390 },
];

function chromePath() {
  const found = CHROME_CANDIDATES.find((path) => path && existsSync(path));
  if (!found) throw new Error("Chrome을 찾지 못했습니다.");
  return found;
}

async function waitForDevtools(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return (await response.json()).webSocketDebuggerUrl;
    } catch { /* 아직 기동 전 */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error("Chrome DevTools 엔드포인트에 연결하지 못했습니다.");
}

class Cdp {
  constructor(socket) { this.socket = socket; this.nextId = 1; this.pending = new Map(); this.sessions = new Map(); this.handlers = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve: done, reject } = this.pending.get(message.id); this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error))); else done(message.result);
      }
      if (message.method === "Target.attachedToTarget") this.sessions.set(message.params.targetInfo.targetId, message.params.sessionId);
      if (message.method && this.handlers.has(message.method)) this.handlers.get(message.method)(message.params, message.sessionId);
    });
  }
  on(method, handler) { this.handlers.set(method, handler); }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((done, reject) => {
      this.pending.set(id, { resolve: done, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((done, reject) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  return new Cdp(socket);
}

async function evaluate(cdp, session, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, session);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? "evaluate 실패");
  return result.result.value;
}

async function navigate(cdp, session, url) {
  await cdp.send("Page.navigate", { url }, session);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise((done) => setTimeout(done, 150));
    const state = await evaluate(cdp, session, "document.readyState");
    if (state === "complete") { await new Promise((done) => setTimeout(done, 350)); return; }
  }
  throw new Error(`${url} 로드가 끝나지 않았습니다.`);
}

const MEASURE_HELPERS = `
  window.__wiggle = {
    box(element) { const rect = element.getBoundingClientRect(); return { w: Math.round(rect.width * 10) / 10, h: Math.round(rect.height * 10) / 10, top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left), right: Math.round(rect.right) }; },
    label(element) { return String(element.getAttribute('aria-label') || element.textContent || element.className || element.tagName).replace(/\\s+/g, ' ').trim().slice(0, 44); },
    visible(element) { const style = getComputedStyle(element); if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false; const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; },
    interactive() { return [...document.querySelectorAll('button, a[href], summary, input[type=range], [role=button]')].filter((element) => window.__wiggle.visible(element) && !element.disabled); },
    smallTargets(floor) { return window.__wiggle.interactive().map((element) => ({ label: window.__wiggle.label(element), ...window.__wiggle.box(element) })).filter((item) => Math.min(item.w, item.h) < floor); },
    horizontalOverflow() { const doc = document.documentElement; return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, overflow: doc.scrollWidth - doc.clientWidth }; },
    topElementAt(x, y) { const element = document.elementFromPoint(x, y); return element ? { tag: element.tagName, cls: String(element.className).slice(0, 60), label: window.__wiggle.label(element) } : null; },
    reachable(element) { const rect = element.getBoundingClientRect(); const x = rect.left + rect.width / 2; const y = rect.top + rect.height / 2; if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) return { onScreen: false }; const hit = document.elementFromPoint(x, y); return { onScreen: true, hitsSelf: Boolean(hit && (element === hit || element.contains(hit) || hit.contains(element))), blockedBy: hit ? window.__wiggle.label(hit) : null }; },
  };
  'ready'
`;

// 로컬에는 OpenAI 키가 없다. 코칭 응답만 네트워크 단계에서 채워 넣어, 컴포넌트가
// 실제 React 상태로 코칭 화면을 그리게 한다(DOM 주입으로는 접기 같은 상태 로직을 못 본다).
const STUB_COACHING = {
  eventId: "coaching_browsercheck",
  coaching: {
    question: "여기 동그란 건 무엇이니? 이름을 알려 줄래?",
    choices: [
      { emoji: "🐶", label: "강아지", answer: "강아지를 그렸어요" },
      { emoji: "🚀", label: "우주선", answer: "우주선을 그렸어요" },
      { emoji: "🌳", label: "나무", answer: "나무를 그렸어요" },
      { emoji: "🏠", label: "집", answer: "집을 그렸어요" },
    ],
    nextAction: "동그라미 옆에 선을 하나 더 그어 보자.",
    observedElements: ["동그라미"],
    uncertain: false,
    growthEvent: "새 대상을 고르려고 했어요.",
  },
};

// 틀리는 해석자. 완성을 누른 순간의 짐작 응답이라 코칭과 본문이 다르다.
const STUB_INTERPRETATION = {
  interpretation: {
    guess: "내 눈에는 우산처럼 보이는데?",
    choices: [
      { emoji: "☂️", label: "우산 맞아", answer: "우산을 그렸어요" },
      { emoji: "🚲", label: "자전거야", answer: "자전거 바퀴를 그렸어요" },
      { emoji: "🍭", label: "사탕이야", answer: "커다란 사탕을 그렸어요" },
    ],
  },
};

// 답을 들은 뒤 몽그리가 다시 쓰는 줄. 종전 next_action과 글자가 달라야 바뀐 것을 잴 수 있다.
const STUB_REPLY_NEXT_ACTION = "그 옆에 어울리는 것을 하나 더 그려 넣어 볼까";

async function stubCoaching(cdp, session) {
  cdp.on("Fetch.requestPaused", async (params, eventSession) => {
    const target = eventSession ?? session;
    try {
      if (params.request.url.includes("/api/ai/coaching")) {
        // 같은 주소로 두 역할이 온다. 요청 본문의 action으로 갈라야 완성 화면에서
        // 코칭 응답이 대신 돌아가는 일이 없다.
        let action = "";
        try { action = JSON.parse(params.request.postData ?? "{}").action ?? ""; } catch { action = ""; }
        /* `reply`는 답을 저장하고 「이제 그려 볼 일」 한 줄만 새로 돌려준다(2026-09-26).
           코칭 응답을 그대로 돌려주면 화면이 줄을 바꾸지 않아 그 계약을 검사할 수 없다. */
        const payload = action === "interpret" ? STUB_INTERPRETATION
          : action === "reply" ? { ok: true, answer: "", nextAction: STUB_REPLY_NEXT_ACTION }
          : STUB_COACHING;
        const body = Buffer.from(JSON.stringify(payload)).toString("base64");
        await cdp.send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: "content-type", value: "application/json" }], body }, target);
        return;
      }
      await cdp.send("Fetch.continueRequest", { requestId: params.requestId }, target);
    } catch { /* 이미 처리된 요청은 무시 */ }
  });
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/ai/coaching*", requestStage: "Request" }] }, session);
}

async function withViewport(cdp, session, viewport, run) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 2, mobile: true }, session);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, session);
  return run();
}

const failures = [];
const notes = [];
function check(ok, message, detail) {
  if (ok) { notes.push(`  OK   ${message}`); return; }
  failures.push(`  FAIL ${message}${detail ? ` :: ${JSON.stringify(detail)}` : ""}`);
}

async function seed(cdp, session) {
  await navigate(cdp, session, `${BASE}/teacher`);
  const seeded = await evaluate(cdp, session, `(async () => {
    const post = async (body) => {
      const response = await fetch('/api/teacher', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
      return { status: response.status, data: await response.json().catch(() => ({})) };
    };
    const login = await post({ action: 'login', email: 'browser-check@local.test', pin: 'browsercheck12' });
    if (login.status >= 400) return { error: 'login', detail: login };
    const created = await post({ action: 'createClassroom', displayName: '브라우저 점검반', roster: [{ seatNumber: 1, realName: '점검 학생' }, { seatNumber: 2, realName: '빈자리 학생' }] });
    if (!created.data.classroom) return { error: 'classroom', detail: created };
    const classroomId = created.data.classroom.id;
    await post({ action: 'toggleAdmission', classroomId, open: true });
    // 입장은 수업 코드 → 아이 참여 코드(6자리)다. 첫 입장은 동물 하나만 고른다.
    const codes = Object.fromEntries((created.data.entryCodes ?? []).map((row) => [row.seatNumber, row.entryCode]));
    const joined = await fetch('/api/student', { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store', body: JSON.stringify({
      action: 'join', entry: created.data.classroom.classCode, entryCode: codes[1], animal: '🐰',
    }) });
    const student = await joined.json();
    if (!student.deviceToken) return { error: 'join', detail: student };
    const artwork = await fetch('/api/artworks', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + student.deviceToken }, cache: 'no-store', body: JSON.stringify({
      clientArtworkId: 'artwork_browsercheck' + Date.now(), learningMode: 'free', lessonSlug: null, title: '점검 그림', topic: '자유 창작', intent: '내 마음대로 그리고 싶다.',
    }) });
    const artworkData = await artwork.json();
    if (!artworkData.artwork) return { error: 'artwork', detail: artworkData };
    return { classroomId, classCode: created.data.classroom.classCode, joinToken: created.data.classroom.joinToken, entryCodes: codes, studentId: student.student.id, deviceToken: student.deviceToken, expiresAt: student.expiresAt,
      nickname: student.student.nickname, animal: student.student.animal, classroomName: student.student.classroomName, artworkId: artworkData.artwork.id };
  })()`);
  if (seeded.error) throw new Error(`데이터 준비 실패: ${JSON.stringify(seeded)}`);
  return seeded;
}

async function installSession(cdp, session, seeded) {
  await evaluate(cdp, session, `(() => {
    localStorage.setItem('wiggle.deviceProfiles.v2', JSON.stringify([{ studentId: ${JSON.stringify(seeded.studentId)}, nickname: ${JSON.stringify(seeded.nickname)}, animal: ${JSON.stringify(seeded.animal)}, classroomName: ${JSON.stringify(seeded.classroomName)} }]));
    sessionStorage.setItem('wiggle.activeSession.v2', JSON.stringify({ studentId: ${JSON.stringify(seeded.studentId)}, deviceToken: ${JSON.stringify(seeded.deviceToken)}, expiresAt: ${JSON.stringify(seeded.expiresAt)} }));
    return 'ok';
  })()`);
}

async function main() {
  const port = 9333;
  const profileDir = resolve(tmpdir(), `wiggle-browser-check-${Date.now()}`);
  mkdirSync(profileDir, { recursive: true });
  const chrome = spawn(chromePath(), [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank",
  ], { stdio: "ignore" });
  try {
    const browserWs = await waitForDevtools(port);
    const browser = await connect(browserWs);
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    const cdp = browser; const session = sessionId;
    await cdp.send("Page.enable", {}, session);
    await cdp.send("Runtime.enable", {}, session);

    const seeded = await seed(cdp, session);
    notes.push(`  준비  학급 ${seeded.classCode} / 학생 ${seeded.nickname} / 작품 ${seeded.artworkId}`);

    for (const viewport of VIEWPORTS) {
      notes.push(`\n[${viewport.name}]`);
      await withViewport(cdp, session, viewport, async () => {
        // 1) 대문: 수업 코드 입력이 첫 행동
        await navigate(cdp, session, `${BASE}/`);
        await evaluate(cdp, session, MEASURE_HELPERS);
        const landing = await evaluate(cdp, session, `(() => {
          const inputs = [...document.querySelectorAll('.landing-code-card input')];
          const submit = [...document.querySelectorAll('.landing-code-card button')].find((button) => button.textContent.includes('그리러 가기'));
          const teacherLink = document.querySelector('.teacher-link');
          return {
            overflow: window.__wiggle.horizontalOverflow().overflow,
            small: window.__wiggle.smallTargets(44),
            codeInputs: inputs.length,
            inputBoxes: inputs.map((input) => window.__wiggle.box(input)),
            submitBox: submit ? window.__wiggle.box(submit) : null,
            teacherBox: teacherLink ? window.__wiggle.box(teacherLink) : null,
          };
        })()`);
        check(landing.overflow <= 0, `${viewport.name} 대문 가로 스크롤 없음`, landing.overflow);
        check(landing.small.length === 0, `${viewport.name} 대문 터치 목표 44px 이상`, landing.small);
        check(landing.codeInputs === 4 && landing.inputBoxes.every((box) => Math.min(box.w, box.h) >= 44), `${viewport.name} 수업 코드 네 칸이 44px 이상`, landing.inputBoxes);
        check(landing.submitBox && landing.teacherBox && landing.submitBox.w * landing.submitBox.h >= landing.teacherBox.w * landing.teacherBox.h, `${viewport.name} 학생 행동(그리러 가기)이 교사 링크보다 크게 보임`, { submit: landing.submitBox, teacher: landing.teacherBox });

        // 브라우저가 폼 값을 화면에만 복원하고 React input 이벤트를 보내지 않는 경우에도
        // 네 칸이 보이는 그대로 제출되어야 한다.
        const restoredCode = await evaluate(cdp, session, `(() => {
          const inputs = [...document.querySelectorAll('.landing-code-box')];
          const submit = document.querySelector('.landing-code-submit');
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          ${JSON.stringify(seeded.classCode)}.split('').forEach((digit, index) => setter.call(inputs[index], digit));
          window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
          const result = { inputs: inputs.length, valid: inputs.every((input) => input.checkValidity()), disabled: submit?.disabled ?? true };
          setTimeout(() => submit?.click(), 0);
          return result;
        })()`);
        let restoredUrl = "";
        for (let attempt = 0; attempt < 60; attempt += 1) {
          await new Promise((done) => setTimeout(done, 100));
          try { restoredUrl = await evaluate(cdp, session, "location.href"); } catch { continue; }
          if (restoredUrl.includes(`/join?code=${seeded.classCode}`)) break;
        }
        check(restoredCode.inputs === 4 && restoredCode.valid && !restoredCode.disabled && restoredUrl.includes(`/join?code=${seeded.classCode}`), `${viewport.name} 브라우저가 복원한 네 자리 코드로 입장 가능`, { restoredCode, restoredUrl });

        // 2) QR 입장: 명단 학급은 참여 코드 입력 화면이 먼저 나온다
        await navigate(cdp, session, `${BASE}/join/${seeded.joinToken}`);
        await evaluate(cdp, session, MEASURE_HELPERS);
        const choice = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          for (let attempt = 0; attempt < 60 && !document.querySelector('.entry-code-input'); attempt += 1) await wait(120);
          const input = document.querySelector('.entry-code-input');
          if (!input) return { error: 'no-code-input', text: document.body.innerText.slice(0, 120) };
          const hasCodeInput = Boolean([...document.querySelectorAll('label span, legend')].find((item) => item.textContent.includes('수업 코드')));
          const submit = document.querySelector('.code-card .child-primary-action');
          const keys = [...document.querySelectorAll('.code-card button')].filter((button) => /^[0-9]$/.test(button.textContent.trim())).length;
          return { hasCodeInput, keys, inputBox: window.__wiggle.box(input), submitBox: submit ? window.__wiggle.box(submit) : null,
            overflow: window.__wiggle.horizontalOverflow().overflow, small: window.__wiggle.smallTargets(44) };
        })()`);
        check(!choice.error, `${viewport.name} QR 입장 참여 코드 화면 재현`, choice.error);
        if (!choice.error) {
          check(!choice.hasCodeInput, `${viewport.name} QR 입장이 수업 코드 입력을 건너뜀`);
          check(choice.keys === 10, `${viewport.name} 숫자판 10키`, choice.keys);
          check(Math.min(choice.inputBox.w, choice.inputBox.h) >= 44, `${viewport.name} 참여 코드 칸이 44px 이상`, choice.inputBox);
          check(Boolean(choice.submitBox) && Math.min(choice.submitBox.w, choice.submitBox.h) >= 44, `${viewport.name} 들어가기 버튼이 44px 이상`, choice.submitBox);
          check(choice.overflow <= 0, `${viewport.name} 코드 화면 가로 스크롤 없음`, choice.overflow);
          check(choice.small.length === 0, `${viewport.name} 코드 화면 터치 목표 44px 이상`, choice.small);
        }

        // 2-b) 처음 들어오는 코드: 동물 하나만 고르는 화면. 틀린 코드는 선생님 불러요로 이어진다
        const createFlow = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          const setValue = (element, value) => { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); };
          const input = document.querySelector('.entry-code-input');
          if (!input) return { error: 'no-code-input' };
          setValue(input, '000000'); await wait(120);
          let enter = document.querySelector('.code-card .child-primary-action');
          if (!enter) return { error: 'no-code-submit' };
          enter.click();
          for (let attempt = 0; attempt < 60 && !document.querySelector('.teacher-call-button'); attempt += 1) await wait(120);
          const wrongCode = Boolean(document.querySelector('.teacher-call-button'));
          const wrongSmall = window.__wiggle.smallTargets(44);
          setValue(document.querySelector('.entry-code-input'), ${JSON.stringify(seeded.entryCodes[2])}); await wait(120);
          enter = document.querySelector('.code-card .child-primary-action');
          enter.click();
          // 친구 고르기(2026-09-13 시안): 제목 #pick-title 아래 카드 격자. 카드는 aria-pressed 버튼이다.
          for (let attempt = 0; attempt < 60 && !document.querySelector('#pick-title'); attempt += 1) await wait(120);
          const title = document.querySelector('#pick-title');
          if (!title) return { error: 'no-picker', text: document.body.innerText.slice(0, 160) };
          const form = title.closest('form');
          const cards = [...form.querySelectorAll('button[aria-pressed]')];
          const rabbit = cards.find((button) => button.getAttribute('aria-label') === '솔이, 토끼');
          if (!rabbit) return { error: 'no-rabbit', labels: cards.map((c) => c.getAttribute('aria-label')) };
          const submit = form.querySelector('.child-primary-action');
          const disabledBefore = submit ? submit.disabled : null;
          rabbit.click(); await wait(150);
          const disabledAfter = submit ? submit.disabled : null;
          const startLabel = submit ? submit.textContent.trim() : '';
          // 휴대폰은 카드가 길어 스크롤하므로, 시작 버튼이 화면 안에 붙어 있는지 본다.
          const startBox = submit ? submit.getBoundingClientRect() : null;
          const startVisible = Boolean(startBox && startBox.top >= 0 && startBox.bottom <= innerHeight + 1);
          return { wrongCode, wrongSmall, animals: cards.length, disabledBefore, disabledAfter, startLabel, startVisible, overflow: window.__wiggle.horizontalOverflow().overflow, small: window.__wiggle.smallTargets(44), viewportHeight: innerHeight, pageHeight: document.documentElement.scrollHeight };
        })()`);
        check(!createFlow.error, `${viewport.name} 첫 입장 흐름 재현`, createFlow.error);
        if (!createFlow.error) {
          check(createFlow.wrongCode, `${viewport.name} 틀린 참여 코드가 선생님 불러요로 이어짐`);
          check(createFlow.wrongSmall.length === 0, `${viewport.name} 오류 화면 터치 목표 44px 이상`, createFlow.wrongSmall);
          check(createFlow.animals === 20, `${viewport.name} 동물 선택이 20개(10개씩 두 쪽)`, createFlow.animals);
          check(createFlow.disabledBefore === true && createFlow.disabledAfter === false, `${viewport.name} 친구를 고르면 시작하기가 열림`, { before: createFlow.disabledBefore, after: createFlow.disabledAfter });
          check(createFlow.startLabel.startsWith('솔이와 시작하기'), `${viewport.name} 시작 버튼이 고른 친구 이름을 부름`, createFlow.startLabel);
          check(createFlow.startVisible, `${viewport.name} 친구를 고른 뒤 시작 버튼이 화면 안에 보임`, createFlow);
          check(createFlow.small.length === 0, `${viewport.name} 동물 화면 터치 목표 44px 이상`, createFlow.small);
          check(createFlow.overflow <= 0, `${viewport.name} 동물 화면 가로 스크롤 없음`, createFlow.overflow);
        }

        // 3) 재입장: 이미 쓰던 참여 코드는 동물을 다시 묻지 않고 바로 내 홈으로 간다
        await navigate(cdp, session, `${BASE}/join/${seeded.joinToken}`);
        await evaluate(cdp, session, MEASURE_HELPERS);
        const reentry = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          const setValue = (element, value) => { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); };
          for (let attempt = 0; attempt < 60 && !document.querySelector('.entry-code-input'); attempt += 1) await wait(120);
          const input = document.querySelector('.entry-code-input');
          if (!input) return { error: 'no-code-input' };
          setValue(input, ${JSON.stringify(seeded.entryCodes[1])}); await wait(120);
          const enter = document.querySelector('.code-card .child-primary-action');
          if (!enter) return { error: 'no-code-submit' };
          setTimeout(() => enter.click(), 0);
          return { clicked: true };
        })()`);
        check(!reentry.error, `${viewport.name} 재입장 흐름 재현`, reentry.error);
        if (!reentry.error) {
          let reentryUrl = ""; let askedAnimal = false;
          for (let attempt = 0; attempt < 80; attempt += 1) {
            await new Promise((done) => setTimeout(done, 120));
            // 내 홈으로 넘어가는 순간 보낸 evaluate는 응답 없이 사라질 수 있어 시간 제한을 둔다.
            const settle = (expression) => Promise.race([evaluate(cdp, session, expression), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1500))]);
            try { reentryUrl = await settle("location.href"); askedAnimal = await settle("Boolean(document.querySelector('.animal-card'))"); } catch { continue; }
            if (reentryUrl.includes("/student/draw") || reentryUrl.endsWith("/student") || askedAnimal) break;
          }
          /* 2026-09-25 「그림 자리」 이후: 저장된 그림이 있으면 /student(그림 자리)에 서고, 0장이면
             예전처럼 바로 도화지로 간다. 이 검사가 지키는 것은 **동물을 다시 묻지 않는다**는 쪽이다 —
             도착지 주소는 그림 수에 따라 달라지므로 둘 다 받는다. 하나만 고정하면 옛 흐름에 묶인다. */
          const landed = reentryUrl.includes("/student/draw") || reentryUrl.endsWith("/student");
          check(landed && !askedAnimal, `${viewport.name} 쓰던 코드는 동물을 다시 묻지 않고 내 자리로 감`, { reentryUrl, askedAnimal });
        }

        // 4) 잘못된 수업 코드: 글자 없이도 복구 행동이 보인다
        await navigate(cdp, session, `${BASE}/join?code=0000`);
        await evaluate(cdp, session, MEASURE_HELPERS);
        const codeError = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          for (let attempt = 0; attempt < 60 && !document.querySelector('.child-error'); attempt += 1) await wait(120);
          const box = document.querySelector('.child-error');
          if (!box) return { error: 'no-error', text: document.body.innerText.slice(0, 120) };
          const icon = box.querySelector('.child-error-icon') ? box.querySelector('.child-error-icon').textContent : '';
          const callButton = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('선생님 불러요'));
          const callBox = callButton ? window.__wiggle.box(callButton) : null;
          const retry = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('다시 확인하기'));
          const backHome = [...document.querySelectorAll('a')].find((link) => link.textContent.includes('수업 코드 다시 입력하기'));
          if (callButton) { callButton.click(); await wait(200); }
          return { icon, hadCallButton: Boolean(callButton), callBox, noteShown: Boolean(document.querySelector('.teacher-call-note')), hadRetry: Boolean(retry), hadBackHome: Boolean(backHome), overflow: window.__wiggle.horizontalOverflow().overflow, small: window.__wiggle.smallTargets(44) };
        })()`);
        check(!codeError.error, `${viewport.name} 잘못된 수업 코드 흐름 재현`, codeError.error);
        if (!codeError.error) {
          check(codeError.icon === "⚠️", `${viewport.name} 코드 오류가 그림(⚠️)으로 표시됨`, codeError.icon);
          check(codeError.hadCallButton && codeError.callBox && Math.min(codeError.callBox.w, codeError.callBox.h) >= 44, `${viewport.name} 선생님 불러요 버튼 44px 이상`, codeError.callBox);
          check(codeError.noteShown, `${viewport.name} 선생님 부르기 안내가 표시됨`);
          check(codeError.hadRetry && codeError.hadBackHome, `${viewport.name} 다시 확인·코드 재입력 행동이 함께 보임`, { retry: codeError.hadRetry, backHome: codeError.hadBackHome });
          check(codeError.overflow <= 0 && codeError.small.length === 0, `${viewport.name} 코드 오류 화면 레이아웃 안전`, { overflow: codeError.overflow, small: codeError.small });
        }


        // 5) 그리기 화면과 몽그리 패널
        await installSession(cdp, session, seeded);
        await stubCoaching(cdp, session);
        await navigate(cdp, session, `${BASE}/student/draw/${seeded.artworkId}`);
        await evaluate(cdp, session, MEASURE_HELPERS);
        const studio = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          for (let attempt = 0; attempt < 60 && !document.querySelector('.draw-canvas'); attempt += 1) await wait(150);
          const canvas = document.querySelector('.draw-canvas');
          if (!canvas) return { error: 'no-canvas' };
          const canvasBox = window.__wiggle.box(canvas);
          const exit = document.querySelector('.studio-header .icon-button');
          return {
            overflow: window.__wiggle.horizontalOverflow().overflow,
            small: window.__wiggle.smallTargets(44),
            canvasBox,
            // 2026-09-15부터 도화지는 자리를 빈틈 없이 덮는다. 이미 그린 그림이 자리보다 옆으로 좁으면 위아래로 넘치고 옮겨 본다.
            canvasCoversZone: (() => { const zone = window.__wiggle.box(document.querySelector('.canvas-zone')); return canvasBox.left <= zone.left + 1 && canvasBox.right >= zone.right - 1 && canvasBox.top <= zone.top + 1 && canvasBox.bottom >= zone.bottom - 1; })(),
            exitBox: exit ? window.__wiggle.box(exit) : null,
            // 도화지가 화면보다 커진 뒤(2026-09-20 큰 도화지)로는 "도화지 한가운데"가 화면 밖일 수 있다.
            // 아이가 실제로 누르는 곳은 그리기 자리 한가운데이므로 거기서 무엇이 잡히는지 본다.
            canvasCenterHit: (() => { const zone = window.__wiggle.box(document.querySelector('.canvas-zone')); return window.__wiggle.topElementAt(Math.round(zone.left + zone.w / 2), Math.round(zone.top + zone.h / 2)); })(),
          };
        })()`);
        check(!studio.error, `${viewport.name} 그리기 화면 로드`, studio.error);
        if (!studio.error) {
          check(studio.overflow <= 0, `${viewport.name} 그리기 화면 가로 스크롤 없음`, studio.overflow);
          check(studio.small.length === 0, `${viewport.name} 그리기 화면 터치 목표 44px 이상`, studio.small);
          check(studio.exitBox && Math.min(studio.exitBox.w, studio.exitBox.h) >= 44, `${viewport.name} 나가기 버튼 44px 이상`, studio.exitBox);
          check(studio.canvasCoversZone, `${viewport.name} 도화지가 자리를 빈틈 없이 채움`, studio.canvasBox);
          check(studio.canvasCenterHit && String(studio.canvasCenterHit.cls).includes("draw-canvas"), `${viewport.name} 그리기 자리 한가운데가 도화지다`, studio.canvasCenterHit);
        }

        const tools = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          const body = document.querySelector('.studio-body');
          // 2026-09-14 도구 막대(B안): 도구는 화면 아래 .tool-dock의 세워진 도구 6개(붓 4·지우개·대칭).
          const targets = [...document.querySelectorAll('.tool-dock button')].filter((button) => window.__wiggle.visible(button));
          if (!targets.length) return { error: 'no-tools' };
          const primaryTools = [...document.querySelectorAll('.tool-dock .dock-tool')].map((button) => {
            const art = button.querySelector('.dock-tool-art img');
            const buttonBox = window.__wiggle.box(button);
            return {
              label: button.getAttribute('aria-label') ?? '', title: button.getAttribute('title') ?? '',
              visible: window.__wiggle.visible(button), buttonBox,
              artLoaded: Boolean(art && art.complete && art.naturalWidth > 0),
            };
          });
          const unreachable = [];
          for (const target of targets) {
            target.scrollIntoView({ block: 'center' });
            await wait(60);
            const reach = window.__wiggle.reachable(target);
            if (!reach.onScreen || !reach.hitsSelf) unreachable.push({ label: window.__wiggle.label(target), ...reach });
          }
          /* 아이패드에서 도구 그림을 누르고 있으면 iOS가 "선택·드래그 항목"으로 잡아 도구 줄이 파랗게
             뜬 채 끌려다녔다(2026-09-23 실기기 제보). img의 draggable={false}로는 안 막히고
             user-select·-webkit-user-drag가 막대까지 걸려 있어야 한다. 캐스케이드 뒤 실제 값으로 본다. */
          const dockArt = document.querySelector('.tool-dock .dock-tool-art img');
          const dockGrab = dockArt ? (() => {
            const style = getComputedStyle(dockArt);
            return { userSelect: style.userSelect || style.webkitUserSelect, userDrag: style.webkitUserDrag, callout: style.webkitTouchCallout };
          })() : null;
          return { unreachable, primaryTools, dockGrab, scrolls: body ? body.scrollHeight - body.clientHeight : 0 };
        })()`);
        check(!tools.error, `${viewport.name} 도구 패널 재현`, tools.error);
        if (!tools.error) {
          check(tools.unreachable.length === 0, `${viewport.name} 모든 그리기 도구에 닿을 수 있음`, tools.unreachable);
          check(tools.primaryTools.length === 6 && tools.primaryTools.every((tool) => tool.label && tool.title), `${viewport.name} 도구 이름을 접근성 정보로 제공`, tools.primaryTools);
          const shownTools = tools.primaryTools.filter((tool) => tool.visible);
          check(shownTools.length === 6 && shownTools.every((tool) => Math.min(tool.buttonBox.w, tool.buttonBox.h) >= 44), `${viewport.name} 도구 막대 도구 6개가 보이고 터치 목표 44px 이상`, shownTools);
          check(shownTools.every((tool) => tool.artLoaded), `${viewport.name} 세워진 도구 그림이 모두 불러와짐`, shownTools);
          // -webkit-touch-callout은 사파리 전용이라 크롬 computed에 안 나온다. 선언 자체는 CSS 단위 검사가 지킨다.
          check(Boolean(tools.dockGrab) && tools.dockGrab.userSelect === "none" && tools.dockGrab.userDrag === "none", `${viewport.name} 도구 그림을 길게 눌러도 선택·끌기가 안 됨`, tools.dockGrab);
        }

        // 4.5) 새 도구 실동작: 대칭 쌍·그룹 되돌리기·채우기·도형 2탭을 실제 입력 파이프라인으로 검증.
        // 합성 PointerEvent는 setPointerCapture가 실패하므로 CDP Input.dispatchMouseEvent(실입력)를 쓴다.
        const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
        const mouse = async (type, x, y, buttons) => cdp.send("Input.dispatchMouseEvent", { type, x: Math.round(x), y: Math.round(y), button: "left", buttons, clickCount: type === "mouseMoved" ? 0 : 1 }, session);
        const dragOn = async (from, to) => {
          await mouse("mousePressed", from.x, from.y, 1);
          for (let step = 1; step <= 6; step += 1) await mouse("mouseMoved", from.x + (to.x - from.x) * step / 6, from.y + (to.y - from.y) * step / 6, 1);
          await mouse("mouseReleased", to.x, to.y, 0); await sleep(120);
        };
        const tapOn = async (point) => { await mouse("mousePressed", point.x, point.y, 1); await mouse("mouseReleased", point.x, point.y, 0); await sleep(120); };
        // 도구 버튼 클릭이 화면을 스크롤시키므로, 캔버스 좌표는 입력 직전마다 다시 잰다.
        const probeCanvas = () => evaluate(cdp, session, `(async () => {
          const canvas = document.querySelector('.draw-canvas'); if (!canvas) return { error: 'no-canvas' };
          canvas.scrollIntoView({ block: 'center' });
          await new Promise((done) => setTimeout(done, 120));
          const rect = canvas.getBoundingClientRect();
          return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        })()`);
        const firstProbe = await probeCanvas();
        check(!firstProbe.error, `${viewport.name} 새 도구 검증용 도화지 확인`, firstProbe.error);
        if (!firstProbe.error) {
          /* 2026-09-20부터 새 작품의 도화지는 화면 3장 크기(span)다. 100%에서는 도화지의 1/3만 화면에 있어
             좌표 비율로 누르면 화면 밖을 누르게 된다. 그래서 아이처럼 축소 단추를 끝까지 눌러 도화지 전체를 보이게 한 뒤 검사한다. */
          await evaluate(cdp, session, `(async () => { const wait = (ms) => new Promise((done) => setTimeout(done, ms)); for (let i = 0; i < 8; i += 1) { const b = document.querySelector('[aria-label="축소"]'); if (!b || b.disabled) break; b.click(); await wait(120); } })()`);
          await sleep(400);
          // 도화지가 자리보다 길게 넘치면(다른 모양 화면에서 그린 그림) 검사 좌표의 세로 비율을 화면에 보이는 띠(머리 줄 아래~막대 손잡이 위) 안으로 옮긴다.
          const visibleBand = await evaluate(cdp, session, `(() => { const c = document.querySelector('.draw-canvas').getBoundingClientRect(); const z = document.querySelector('.canvas-zone').getBoundingClientRect(); const dock = document.querySelector('.tool-dock').getBoundingClientRect(); const top = Math.max(c.top, z.top); const bottom = Math.min(c.bottom, z.bottom, dock.top - 44); return c.height > z.height + 1 ? [(top - c.top) / c.height, (bottom - c.top) / c.height] : [0, 1]; })()`);
          const bandY = (fy) => visibleBand[0] + fy * (visibleBand[1] - visibleBand[0]);
          const at = (rect, fx, fy) => ({ x: rect.left + rect.width * fx, y: rect.top + rect.height * bandY(fy) });
          const clickPanelButton = (label) => evaluate(cdp, session, `(() => {
            const find = () => [...document.querySelectorAll('.tool-dock button')].find((item) => window.__wiggle.visible(item) && (item.getAttribute('aria-label') || item.textContent || '').includes(${JSON.stringify(label)}));
            let target = find();
            // 채우기·도형은 ⋯ 더보기 안에 있다.
            if (!target) { document.querySelector('.dock-more')?.click(); }
            return new Promise((done) => setTimeout(() => { target = target ?? find(); if (!target) return done(false); target.click(); done(true); }, 150));
          })()`);
          // 색: 넓은 화면은 막대의 색 점, 좁은 화면은 지금 색 버튼으로 12색 창을 연다.
          const pickSwatch = (label) => evaluate(cdp, session, `(async () => {
            const visibleSwatch = () => [...document.querySelectorAll('.dock-color')].find((item) => window.__wiggle.visible(item) && item.getAttribute('aria-label') === ${JSON.stringify(label)});
            let swatch = visibleSwatch();
            if (!swatch) { (document.querySelector('.dock-current-color') && window.__wiggle.visible(document.querySelector('.dock-current-color')) ? document.querySelector('.dock-current-color') : document.querySelector('.dock-more-colors'))?.click(); await new Promise((done) => setTimeout(done, 150)); swatch = visibleSwatch(); }
            if (!swatch) return false; swatch.click(); return true;
          })()`);
          const pixel = (fx, fy) => evaluate(cdp, session, `(() => {
            const canvas = document.querySelector('.draw-canvas'); const context = canvas.getContext('2d');
            const data = context.getImageData(Math.round(${fx} * canvas.width), Math.round(${bandY(fy)} * canvas.height), 1, 1).data;
            return [data[0], data[1], data[2]];
          })()`);
          // 이전 뷰포트에서 저장된 그림이 남아 있으므로 절대색이 아니라 "그리기 전과 달라졌는가"로 판정한다.
          const differs = (before, after) => Math.abs(before[0] - after[0]) + Math.abs(before[1] - after[1]) + Math.abs(before[2] - after[2]) > 24;

          // 뷰포트마다 다른 줄에 그린다. 같은 좌표를 재사용하면 앞 뷰포트에서 저장된 그림 위에
          // 같은 색을 다시 그려 "달라졌는가" 판정이 무력해진다.
          const rowShift = VIEWPORTS.findIndex((item) => item.name === viewport.name) * 0.07;
          // 2026-09-15부터 도화지가 화면 끝까지 차고 도구 막대가 그 위에 뜬다 — 아래쪽은 막대에 가리므로 위쪽 절반에 긋는다.
          const mirrorY = 0.45 - rowShift;

          // 대칭: 남색을 고르고 왼쪽에 그은 획이 오른쪽 반사 지점에도 나타난다.
          await pickSwatch('남색');
          const mirrorClicked = await clickPanelButton("대칭"); await sleep(150);
          const beforeLeft = await pixel(0.25, mirrorY); const beforeRight = await pixel(0.75, mirrorY);
          let rect = await probeCanvas();
          await dragOn(at(rect, 0.2, mirrorY), at(rect, 0.3, mirrorY)); await sleep(300);
          const mirrorLeft = await pixel(0.25, mirrorY); const mirrorRight = await pixel(0.75, mirrorY);
          check(mirrorClicked && differs(beforeLeft, mirrorLeft) && differs(beforeRight, mirrorRight), `${viewport.name} 대칭이 반대쪽에도 그려짐`, { beforeLeft, mirrorLeft, mirrorRight });
          // 되돌리기 1회로 쌍이 함께 사라져 그리기 전 픽셀로 복귀한다.
          await clickPanelButton("되돌리기"); await sleep(300);
          const undoLeft = await pixel(0.25, mirrorY); const undoRight = await pixel(0.75, mirrorY);
          check(!differs(beforeLeft, undoLeft) && !differs(beforeRight, undoRight), `${viewport.name} 되돌리기 1회로 대칭 쌍이 함께 사라짐`, { beforeLeft, undoLeft, undoRight });
          await clickPanelButton("대칭"); await sleep(120);

          // 채우기: 뷰포트마다 다른 색을 쓴다. 같은 색이면 앞 뷰포트가 이미 채운 영역에서
          // floodFill이 조기 반환해도(같은 색 위 채우기) 검사가 헛돌며 통과한다.
          const fillPlans = [
            { label: "빨간색", ok: (c) => c[0] > 180 && c[1] < 120 && c[2] < 120 },
            { label: "노란색", ok: (c) => c[0] > 200 && c[1] > 170 && c[2] < 140 },
            { label: "초록색", ok: (c) => c[1] > 120 && c[0] < 130 },
          ];
          const fillPlan = fillPlans[VIEWPORTS.findIndex((item) => item.name === viewport.name)] ?? fillPlans[0];
          await clickPanelButton("채우기"); await sleep(120);
          await pickSwatch(fillPlan.label);
          await sleep(120);
          // 오른쪽 위는 확대·축소 단추 자리라 왼쪽 위를 채운다.
          const beforeFill = await pixel(0.1, 0.08);
          rect = await probeCanvas();
          await tapOn(at(rect, 0.1, 0.08)); await sleep(400);
          const filled = await pixel(0.1, 0.08);
          check(differs(beforeFill, filled) && fillPlan.ok(filled), `${viewport.name} 채우기 탭 한 번으로 영역이 채워짐`, { beforeFill, filled, color: fillPlan.label });

          // 도형 2탭: 남색으로 시작점 탭 → 안내 → 끝점 탭으로 네모가 그려진다 (드래그 대안 경로).
          await clickPanelButton("도형"); await sleep(150);
          await evaluate(cdp, session, `(() => { const shape = [...document.querySelectorAll('.shape-kind-row button')].find((item) => item.getAttribute('aria-label') === '네모'); if (shape) shape.click(); })()`);
          await pickSwatch('남색');
          // 모양을 고른 뒤에도 더보기 창이 열려 있어 도화지를 가린다. 아이처럼 ⋯를 다시 눌러 닫고 도화지를 누른다.
          await evaluate(cdp, session, `(() => { const more = document.querySelector('.dock-more'); if (more && more.getAttribute('aria-expanded') === 'true') more.click(); })()`);
          await sleep(120);
          // 세로 변이 뷰포트 간 겹치지 않도록 x도 함께 민다.
          const shapeLeft = 0.55 + rowShift; const shapeTop = 0.3 + rowShift; const shapeBottom = 0.5 + rowShift; const shapeProbeY = 0.4 + rowShift;
          const beforeEdge = await pixel(shapeLeft, shapeProbeY);
          rect = await probeCanvas();
          await tapOn(at(rect, shapeLeft, shapeTop));
          const hintShown = await evaluate(cdp, session, `Boolean([...document.querySelectorAll('.canvas-start-hint')].find((item) => item.textContent.includes('끝나는 곳')))`);
          check(hintShown, `${viewport.name} 도형 시작점 탭 뒤 끝점 안내가 보임`, hintShown);
          rect = await probeCanvas();
          // 오른쪽 위 확대·축소 단추를 피해 끝점 x를 너무 오른쪽으로 밀지 않는다.
          await tapOn(at(rect, 0.8 + rowShift * 0.5, shapeBottom)); await sleep(400);
          const shapeEdge = await pixel(shapeLeft, shapeProbeY);
          check(differs(beforeEdge, shapeEdge) && shapeEdge[2] > 40 && shapeEdge[0] < 120, `${viewport.name} 두 번째 탭으로 네모가 그려짐`, { beforeEdge, shapeEdge });

          /* 지우개: 아이가 보는 네모와 실제로 지워지는 칸이 같아야 한다. 네모의 %는 도화지(span장 너비)
             기준이고 지워지는 칸은 저장 단위(굵기÷span)라, 화면 굵기를 그대로 쓰면 네모만 span배로 커진다
             (2026-09-23 사용자: "지움 범위가 네모칸에 비해 작아"). 소스 문자열로는 잡히지 않아 실제로 재 본다. */
          await clickPanelButton("지우개"); await sleep(200);
          const eraseX = 0.3 + rowShift; const eraseY = 0.62 - rowShift;
          rect = await probeCanvas();
          const erasePoint = at(rect, eraseX, eraseY);
          await mouse("mouseMoved", erasePoint.x, erasePoint.y, 0); await sleep(200);
          const footprintBox = await evaluate(cdp, session, `(() => {
            const mark = document.querySelector('.eraser-footprint');
            if (!mark || mark.hidden) return null;
            const box = mark.getBoundingClientRect();
            return { width: box.width, height: box.height };
          })()`);
          await tapOn(erasePoint); await sleep(400);
          // 도화지는 불투명한 흰 바탕이라, destination-out으로 파인 자리만 알파 0이 된다.
          const erasedRun = await evaluate(cdp, session, `(() => {
            const canvas = document.querySelector('.draw-canvas');
            const box = canvas.getBoundingClientRect();
            const row = Math.min(canvas.height - 1, Math.max(0, Math.round(${bandY(eraseY)} * canvas.height)));
            const data = canvas.getContext('2d').getImageData(0, row, canvas.width, 1).data;
            let run = 0; let longest = 0;
            for (let x = 0; x < canvas.width; x += 1) {
              if (data[x * 4 + 3] === 0) { run += 1; if (run > longest) longest = run; } else run = 0;
            }
            return { cssWidth: longest * box.width / canvas.width, backingWidth: canvas.width };
          })()`);
          const eraseGap = footprintBox && erasedRun.cssWidth > 0 ? Math.abs(erasedRun.cssWidth - footprintBox.width) / footprintBox.width : 1;
          check(Boolean(footprintBox) && erasedRun.cssWidth > 0 && eraseGap <= 0.25, `${viewport.name} 지우개 네모와 실제 지워진 칸의 크기가 같음`, { footprintBox, erasedRun, eraseGap });
          // 여기서 연필로 되돌리지 않는다. 아래 "연필로 되돌린다" 단계가 이미 하는데, 먼저 골라 두면
          // 그 클릭이 "같은 도구 다시 누르기"가 돼 굵기 자가 열리고, 뒤의 몽그리 접기 검사에서
          // 도화지 탐침 자리를 가린다(2026-09-23 이 검사를 넣으면서 실제로 겪은 일).

          // 핀치 폴백(펜 없는 기기): 한 손가락으로 긋다 두 번째 손가락이 합류하면
          // 진행 중 그리기를 버리고 핀치 확대가 실제로 시작돼야 한다.
          if (viewport.name === "390x844" || viewport.name === "iPad-768x880-safari") {
            // next dev + CDP 환경에서 이 뷰포트들만 이 지점의 터치 전달이 페이지에 0건
            // 도달한다(마우스 입력·형제 뷰포트 정상, 페이지 스케일 1, 재무장·리셋 무효).
            // 768×880은 같은 폭의 768×1024가 같은 실행에서 통과해 레이아웃 문제가 아님을
            // 확인했다. 핀치 로직 자체는 320×568·844×390·768×1024 실디스패치와 단위
            // 테스트(two fingers zoom, pinch clamp)로 커버된다.
            notes.push(`  SKIP ${viewport.name} 손가락 두 개 핀치 — CDP 터치 전달 환경 문제, 형제 뷰포트 실측과 단위 테스트로 커버`);
          } else {
            rect = await probeCanvas();
            const pinchCenter = at(rect, 0.5, 0.5);
            /* 이 검사는 위에서 축소 단추를 끝까지 누른 상태에서 시작한다. 그 바닥 배율은 도화지 넓이(span)와
               축소 한계가 바뀌면 함께 바뀌므로, 절대 숫자로 재면 핀치와 상관없는 변경에 깨진다
               (2026-09-23 축소 한계를 한 칸 내렸을 때 실제로 깨짐). 핀치 전후를 비교한다. */
            const scaleNow = `(() => { const stack = document.querySelector('.canvas-stack'); return new DOMMatrix(getComputedStyle(stack).transform).a; })()`;
            const beforePinch = await evaluate(cdp, session, scaleNow);
            const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((point, index) => ({ x: Math.round(point.x), y: Math.round(point.y), id: index + 1 })) }, session);
            await touch("touchStart", [{ x: pinchCenter.x - 15, y: pinchCenter.y }]);
            await touch("touchMove", [{ x: pinchCenter.x - 25, y: pinchCenter.y }]);
            await touch("touchStart", [{ x: pinchCenter.x - 25, y: pinchCenter.y }, { x: pinchCenter.x + 25, y: pinchCenter.y }]);
            for (let step = 1; step <= 5; step += 1) await touch("touchMove", [{ x: pinchCenter.x - 25 - step * 14, y: pinchCenter.y }, { x: pinchCenter.x + 25 + step * 14, y: pinchCenter.y }]);
            await touch("touchEnd", []);
            await sleep(250);
            const zoomScale = await evaluate(cdp, session, scaleNow);
            check(zoomScale > beforePinch * 1.5, `${viewport.name} 손가락 두 개 핀치로 확대됨`, { beforePinch, zoomScale });
            await evaluate(cdp, session, `(() => { const reset = document.querySelector('.zoom-fit'); if (reset && !reset.disabled) reset.click(); })()`);
            await sleep(200);
          }

          // 다음 검증(몽그리·소감)을 위해 연필로 되돌린다.
          await clickPanelButton("연필"); await sleep(120);
        }

        // 데스크톱 모드는 좁은 오른쪽 도구 레일 전용 회귀 검사다. 아래 항목은
        // 모바일 바텀시트 전용 계약이라 데스크톱 정적 패널에 적용하지 않는다.
        if (DESKTOP_MODE) return;

        const grimi = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          const open = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('몽그리 부르기'));
          if (!open) return { error: 'no-grimi-button' };
          open.click();
          for (let attempt = 0; attempt < 40 && !document.querySelector('.grimi-panel'); attempt += 1) await wait(120);
          const panel = document.querySelector('.grimi-panel');
          if (!panel) return { error: 'no-panel' };
          const scroll = panel.querySelector('.grimi-scroll');
          // AI 호출은 키 없이 실패할 수 있다. 패널 자체의 공간과 닫기·나가기 경로를 검증한다.
          for (let attempt = 0; attempt < 50; attempt += 1) { if (!document.querySelector('.grimi-thinking')) break; await wait(200); }
          const box = window.__wiggle.box(panel);
          const close = panel.querySelector('.grimi-head [aria-label="몽그리 닫기"]');
          const exit = panel.querySelector('.grimi-go-draw');
          const style = getComputedStyle(panel);
          return {
            box, position: style.position, maxHeightPx: box.h, viewportHeight: innerHeight,
            scrollHeight: scroll ? scroll.scrollHeight : panel.scrollHeight, clientHeight: scroll ? scroll.clientHeight : panel.clientHeight,
            closeBox: close ? window.__wiggle.box(close) : null,
            closeReachable: close ? window.__wiggle.reachable(close) : null,
            exitReachable: exit ? window.__wiggle.reachable(exit) : null,
            errorText: panel.querySelector('.error-box')?.textContent?.slice(0, 60) ?? '',
          };
        })()`);
        check(!grimi.error, `${viewport.name} 몽그리 패널 열림`, grimi.error);
        if (!grimi.error) {
          check(grimi.position === "fixed", `${viewport.name} 몽그리가 바텀시트로 열림`, grimi.position);
          // 시트는 내용에 맞춰 자란다. 내용이 잘리는 경우에만 화면의 절반 이상을 요구한다.
          const clipped = grimi.scrollHeight - grimi.clientHeight > 4;
          check(!clipped || grimi.box.h >= grimi.viewportHeight * 0.5, `${viewport.name} 몽그리 표시 영역이 충분히 큼`, { h: grimi.box.h, viewport: grimi.viewportHeight, clipped });
          check(grimi.box.bottom <= grimi.viewportHeight + 1, `${viewport.name} 몽그리 시트가 화면 안에 있음`, grimi.box);
          check(grimi.closeBox && Math.min(grimi.closeBox.w, grimi.closeBox.h) >= 44, `${viewport.name} 몽그리 닫기 44px 이상`, grimi.closeBox);
          check(grimi.closeReachable?.hitsSelf, `${viewport.name} 몽그리 닫기를 바로 누를 수 있음`, grimi.closeReachable);
          /* 2026-09-26: 스크롤 밖에 고정돼 있던 「그냥 내 마음대로 그릴래」를 없앴다(×와 같은 동작이라 중복).
             그래서 **늘 화면에 있는 나갈 길은 머리에 고정된 ×**다. 「그리러 가기」는 답 줄에 있어
             낮은 시트(844×390)에서는 스크롤해야 닿는다 — 아래 afterScroll 검사가 그것을 지킨다. */
          check(grimi.closeReachable?.onScreen, `${viewport.name} 늘 보이는 나갈 길(몽그리 닫기)이 화면 안에 있음`, grimi.closeReachable);
        }

        // 5-b) 실제 코칭 응답 상태에서: 질문·선택지·다음 행동·확인 버튼이 모두 닿는가
        const coaching = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          const panel = document.querySelector('.grimi-panel');
          if (!panel) return { error: 'no-panel' };
          for (let attempt = 0; attempt < 60 && !panel.querySelector('.grimi-coaching'); attempt += 1) await wait(200);
          const scroll = panel.querySelector('.grimi-scroll');
          if (!panel.querySelector('.grimi-coaching') || !scroll) return { error: 'no-coaching', html: panel.innerText.slice(0, 120) };
          /* 몽그리 카드는 읽기 전용이다(2026-09-23 「몽그리 카드를 읽기 전용으로 바꾸기」).
             답 칩을 고르고 되돌려 보내던 왕복을 없앴으므로, 고르는 동작 없이 처음부터
             관찰 한마디 → 궁금한 점 → 「이제 그려 볼 일」이 한 번에 보여야 한다.
             (이 문자열은 바깥 템플릿 리터럴 안이라 백틱을 쓰면 문자열이 끊긴다.) */
          const question = panel.querySelector('.grimi-coaching h2');
          const nextAction = panel.querySelector('.next-action');
          /* 「다른 것도 물어보기」는 2026-09-26에 없앴다(머리 줄 「몽그리 부르기」와 같은 동작).
             이 검사가 지키는 것은 "시트 맨 아래 행동에 스크롤 한 번으로 닿는다"이므로,
             이제 그 자리인 주 행동 「이렇게 답할래」를 본다. */
          const again = panel.querySelector('.grimi-send');
          const chips = [...panel.querySelectorAll('.grimi-chip')];
          /* 「그냥 내 마음대로 그릴래」(.free-exit)는 2026-09-26에 없앴다 — ×와 같은 dismissGrimi라 중복이었다.
             지켜야 할 것은 "답을 강요받지 않고 나갈 길이 늘 닿는다"이고, 이제 그 길은 「그리러 가기」다. */
          const exit = panel.querySelector('.grimi-go-draw');
          const close = panel.querySelector('.grimi-head [aria-label="몽그리 닫기"]');
          const reach = (element) => element ? window.__wiggle.reachable(element) : null;
          // 칩을 실제로 눌러 반응을 본다 — 있는지만 세면 "눌러도 아무 일이 없던" 문제를 못 잡는다.
          const sendButton = panel.querySelector('.grimi-send');
          const sendDisabledAtFirst = sendButton ? sendButton.disabled : null;
          let pickShowsMark = null;
          if (chips[0]) {
            chips[0].click(); await wait(220);
            pickShowsMark = chips[0].getAttribute('aria-pressed') === 'true' && Boolean(chips[0].querySelector('.grimi-chip-check'));
          }
          const startState = { question: reach(question), nextAction: reach(nextAction), close: reach(close), exit: reach(exit), chipCount: chips.length, sendDisabledAtFirst, pickShowsMark };
          // 아이가 맨 아래 행동(이렇게 답할래)까지 이동하는 경로: 시트 안쪽 스크롤 한 번
          again?.scrollIntoView({ block: 'center' });
          await wait(250);
          const afterScroll = { confirm: reach(again), close: reach(close), exit: reach(exit), confirmBox: again ? window.__wiggle.box(again) : null };
          /* 답을 보낸 **뒤에도** 나갈 길이 남는가. 「그리러 가기」를 답하기 블록 안에 두었더니
             보내는 순간 같이 사라져, 방금 답한 아이에게 남는 길이 dismiss인 ×뿐이었다(2026-09-26). */
          let afterSend = { skipped: 'send-disabled' };
          if (sendButton && !sendButton.disabled) {
            sendButton.click();
            for (let attempt = 0; attempt < 40 && !panel.querySelector('.grimi-replied'); attempt += 1) await wait(150);
            const sentExit = panel.querySelector('.grimi-go-draw');
            sentExit?.scrollIntoView({ block: 'center' });
            await wait(250);
            afterSend = { replied: Boolean(panel.querySelector('.grimi-replied')), exit: reach(sentExit),
              nextActionText: (panel.querySelector('.next-action b')?.textContent ?? '').trim() };
          }
          const nestedScrollers = [...panel.querySelectorAll('*')].filter((element) => element !== scroll && element.scrollHeight - element.clientHeight > 4 && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY));
          return { startState, afterScroll, afterSend, nestedScrollers: nestedScrollers.map((element) => window.__wiggle.label(element)), scrollerHeight: scroll.clientHeight, contentHeight: scroll.scrollHeight };
        })()`);
        check(!coaching.error, `${viewport.name} 코칭 내용 레이아웃 재현`, coaching.error);
        if (!coaching.error) {
          check(coaching.startState.question?.onScreen, `${viewport.name} 몽그리 첫 질문이 바로 보임`, coaching.startState.question);
          check(coaching.startState.nextAction?.onScreen, `${viewport.name} '이제 그려 볼 일'이 고르지 않아도 바로 보임`, coaching.startState.nextAction);
          /* 2026-09-26: 칩이 다시 생겼다(제품 결정 25항 개정). 되살리되 읽기 전용으로 가게 만든 이유는
             막았다 — 고른 즉시 표가 나야 하고(그때는 눌러도 아무 일이 없었다), 빈 답은 보낼 수 없어야 한다. */
          check(coaching.startState.chipCount > 0, `${viewport.name} 답 고르기 칩이 보임`, coaching.startState.chipCount);
          check(coaching.startState.sendDisabledAtFirst === true, `${viewport.name} 고르기 전에는 보내기가 잠겨 있음`, coaching.startState.sendDisabledAtFirst);
          check(coaching.startState.pickShowsMark === true, `${viewport.name} 칩을 고르면 바로 표가 남`, coaching.startState.pickShowsMark);
          check(coaching.startState.close?.hitsSelf, `${viewport.name} 코칭 중에도 닫기가 고정되어 보임`, coaching.startState.close);
          // 「그리러 가기」는 존재하고 스크롤 뒤에 닿아야 한다(바로 아래 afterScroll 검사). 여기서는 있는지만 본다.
          check(Boolean(coaching.startState.exit), `${viewport.name} 코칭 중에 「그리러 가기」가 있음`, coaching.startState.exit);
          check(coaching.afterScroll.confirm?.hitsSelf, `${viewport.name} 한 번 스크롤로 '이렇게 답할래'에 닿음`, coaching.afterScroll.confirm);
          check(coaching.afterScroll.close?.hitsSelf && coaching.afterScroll.exit?.hitsSelf, `${viewport.name} 스크롤 뒤에도 닫기·「그리러 가기」가 그대로 보임`, coaching.afterScroll);
          check(coaching.afterSend.replied === true, `${viewport.name} 답을 보내면 알려 줬다는 확인이 뜸`, coaching.afterSend);
          check(coaching.afterSend.exit?.hitsSelf, `${viewport.name} 답을 보낸 뒤에도 「그리러 가기」로 나갈 수 있음`, coaching.afterSend);
          /* 답하기 전의 「이제 그려 볼 일」은 아이가 무엇을 그리는지 모르고 쓴 말이다.
             답을 보내면 그 자리에서 아이 말에 맞춘 줄로 바뀌어야 한다(2026-09-26 사용자 결정). */
          check(coaching.afterSend.nextActionText === STUB_REPLY_NEXT_ACTION, `${viewport.name} 답을 보내면 '이제 그려 볼 일'이 아이 말에 맞춰 바뀜`, coaching.afterSend.nextActionText);
          check(coaching.nestedScrollers.length === 0, `${viewport.name} 시트 안에 숨은 중첩 스크롤이 없음`, coaching.nestedScrollers);
        }

        // 5-c) 코칭을 유지한 채 그림을 그릴 수 있는가 (몽그리가 "선을 하나 더 그어 보자"고 한 뒤)
        const collapse = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          const collapseButton = document.querySelector('.grimi-collapse');
          if (!collapseButton) return { error: 'no-collapse-button' };
          collapseButton.click();
          await wait(350);
          const panel = document.querySelector('.grimi-panel');
          const peek = document.querySelector('.grimi-peek');
          const canvas = document.querySelector('.draw-canvas');
          if (!panel || !canvas) return { error: 'no-panel-or-canvas' };
          // 앞 섹션이 도구 패널로 스크롤해 둔 상태일 수 있다. 아이가 그리려면 도화지를
          // 보고 있어야 하므로, 좌표는 도화지를 화면에 들여놓은 뒤 잰다.
          canvas.scrollIntoView({ block: 'start' });
          await wait(300);
          const canvasBox = window.__wiggle.box(canvas);
          const panelBox = window.__wiggle.box(panel);
          // 도화지 안에서 시트에 가리지 않은 지점이 실제로 그릴 수 있어야 한다.
          const probeY = Math.round(Math.min(canvasBox.bottom, panelBox.top) - 12);
          const probeX = Math.round(canvasBox.left + canvasBox.w / 2);
          const hit = window.__wiggle.topElementAt(probeX, probeY);
          const probePoint = { x: probeX, y: probeY };
          // 접힌 줄도 읽기 전용이다 — 답을 요구하는 단추가 있으면 안 된다.
          const peekButtons = [...(peek?.querySelectorAll('button') ?? [])].map((b) => (b.textContent || '').trim().slice(0, 12));
          const reExpand = document.querySelector('.grimi-collapse');
          return {
            peekShown: Boolean(peek),
            nextActionShown: Boolean(peek?.querySelector('b')?.textContent?.trim()),
            peekButtons,
            drawableHeight: Math.round(Math.min(canvasBox.bottom, panelBox.top) - canvasBox.top),
            probeHitsCanvas: Boolean(hit && String(hit.cls).includes('draw-canvas')),
            probeHit: hit, probePoint,
            reExpandReachable: reExpand ? window.__wiggle.reachable(reExpand) : null,
            panelTop: panelBox.top, viewportHeight: innerHeight,
          };
        })()`);
        check(!collapse.error, `${viewport.name} 몽그리 접기 재현`, collapse.error);
        if (!collapse.error) {
          check(collapse.peekShown && collapse.nextActionShown, `${viewport.name} 접어도 다음 행동이 계속 보임`, collapse);
          check(collapse.peekButtons.length === 0, `${viewport.name} 접힌 줄에 답을 요구하는 단추가 없음(읽기 전용)`, collapse.peekButtons);
          check(collapse.drawableHeight >= 140, `${viewport.name} 접으면 그릴 수 있는 도화지가 남음`, { drawableHeight: collapse.drawableHeight });
          check(collapse.probeHitsCanvas, `${viewport.name} 접은 상태에서 도화지에 실제로 그릴 수 있음`, collapse);
          check(collapse.reExpandReachable?.hitsSelf, `${viewport.name} 몽그리를 다시 펼칠 수 있음`, collapse.reExpandReachable);
        }

        // 6) 소감 모달 초점 이동과 Escape 닫기
        const modal = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          const dismiss = document.querySelector('.grimi-panel .grimi-head > button'); if (dismiss) { dismiss.click(); await wait(200); }
          const opener = [...document.querySelectorAll('.studio-header button')].find((button) => button.className.includes('primary'));
          if (!opener) return { error: 'no-opener' };
          opener.focus(); opener.click();
          for (let attempt = 0; attempt < 40 && !document.querySelector('.reflection-modal'); attempt += 1) await wait(100);
          if (!document.querySelector('.reflection-modal')) return { error: 'no-modal' };
          // 틀리는 해석자는 완성을 누른 뒤 비동기로 온다. 렌더를 기다렸다가 실제로 잰다.
          for (let attempt = 0; attempt < 40 && !document.querySelector('.mongri-guess-text'); attempt += 1) await wait(100);
          const guessEl = document.querySelector('.mongri-guess-text');
          const guessChips = [...document.querySelectorAll('.mongri-guess .reflection-choice-grid button')];
          const guessInput = document.querySelector('#story-text');
          let guessChipApplied = null;
          if (guessChips[1] && guessInput) {
            guessChips[1].click();
            await wait(200);
            guessChipApplied = { pressed: guessChips[1].getAttribute('aria-pressed'), inputValue: guessInput.value };
          }
          const guessReachableBeforeScroll = guessEl ? window.__wiggle.reachable(guessEl) : null;
          const guess = {
            shown: Boolean(guessEl),
            reachable: guessReachableBeforeScroll,
            clipped: guessEl ? guessEl.scrollHeight - guessEl.clientHeight > 1 : null,
            chipCount: guessChips.length,
            // 소감 모달은 원래 스크롤되는 화면이다. 아이가 실제로 하듯 칩을 화면에
            // 들여놓은 뒤 눌리는지 본다 — 한 화면에 다 담기는지를 재면 이 모달의
            // 기존 기준보다 엄해져서, 통과시키려고 칩을 줄이는 잘못된 수정을 부른다.
            chipsReachable: await (async () => {
              const results = [];
              for (const chip of guessChips) {
                chip.scrollIntoView({ block: 'center' });
                await wait(120);
                results.push({ label: chip.textContent.trim().slice(0, 20), ...window.__wiggle.reachable(chip) });
              }
              return results;
            })(),
            inputBox: guessInput ? window.__wiggle.box(guessInput) : null,
            applied: guessChipApplied,
            speakInside: Boolean(document.querySelector('.mongri-guess .speak-button, .mongri-guess [class*="speak"]')),
          };
          const focusedInside = document.querySelector('.modal-backdrop')?.contains(document.activeElement) ?? false;
          // 모달은 .studio 안에 그려지므로, 배경은 모달의 형제(헤더·본문)로 확인한다.
          const backgroundInert = ['.studio-header', '.studio-body'].every((selector) => document.querySelector(selector)?.hasAttribute('inert') ?? false);
          const backgroundHidden = document.querySelector('.studio-body')?.getAttribute('aria-hidden') === 'true';
          const overflow = window.__wiggle.horizontalOverflow().overflow;
          const small = window.__wiggle.smallTargets(44);
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await wait(250);
          const closed = !document.querySelector('.reflection-modal');
          const focusRestored = document.activeElement === opener;
          const inertCleared = ['.studio-header', '.studio-body'].every((selector) => !(document.querySelector(selector)?.hasAttribute('inert') ?? true));
          return { guess, focusedInside, backgroundInert, backgroundHidden, overflow, small, closed, focusRestored, inertCleared };
        })()`);
        check(!modal.error, `${viewport.name} 소감 모달 재현`, modal.error);
        if (!modal.error) {
          check(modal.focusedInside, `${viewport.name} 모달을 열면 초점이 안으로 들어감`);
          check(modal.backgroundInert && modal.backgroundHidden, `${viewport.name} 모달 뒤 배경이 inert 처리됨`, { inert: modal.backgroundInert, ariaHidden: modal.backgroundHidden });
          check(modal.overflow <= 0, `${viewport.name} 모달에서 가로 스크롤 없음`, modal.overflow);
          check(modal.small.length === 0, `${viewport.name} 모달 터치 목표 44px 이상`, modal.small);
          check(modal.closed, `${viewport.name} Escape로 모달이 닫힘`);
          check(modal.focusRestored, `${viewport.name} 모달을 닫으면 열었던 버튼으로 초점 복귀`);
          check(modal.inertCleared, `${viewport.name} 모달을 닫으면 배경 inert 해제`);
          // 틀리는 해석자 (product-decisions 학습 과정 4항)
          check(modal.guess.shown, `${viewport.name} 몽그리 짐작이 소감 화면에 보임`, modal.guess);
          check(modal.guess.reachable?.hitsSelf, `${viewport.name} 몽그리 짐작이 가려지지 않음`, modal.guess.reachable);
          check(modal.guess.clipped === false, `${viewport.name} 몽그리 짐작 문장이 잘리지 않음`, modal.guess);
          check(modal.guess.chipCount >= 2 && modal.guess.chipsReachable.every((chip) => chip?.hitsSelf), `${viewport.name} 고칠 답을 모두 누를 수 있음`, modal.guess);
          check(modal.guess.applied?.pressed === "true" && Boolean(modal.guess.applied?.inputValue), `${viewport.name} 답을 고르면 내 말 칸에 들어감`, modal.guess.applied);
          check(Math.min(modal.guess.inputBox?.w ?? 0, modal.guess.inputBox?.h ?? 0) >= 44, `${viewport.name} 내 말 칸이 44px 이상`, modal.guess.inputBox);
          // AI가 만든 문장은 음성으로 내보내지 않는다 (product-decisions 20항).
          check(modal.guess.speakInside === false, `${viewport.name} 몽그리 짐작에 음성 버튼이 없음`, modal.guess);
        }
      });
    }

    console.log(notes.join("\n"));
    if (failures.length) {
      console.log(`\n실패 ${failures.length}건`);
      console.log(failures.join("\n"));
      process.exitCode = 1;
    } else {
      console.log("\n모든 브라우저 검증 통과");
    }
  } finally {
    chrome.kill();
    try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* 정리 실패는 무시 */ }
  }
}

await main();
// Windows에서 종료 중인 헤드리스 Chrome의 DevTools WebSocket이 드물게 이벤트 루프를
// 붙잡는 경우가 있다. 검증과 finally 정리가 끝났으면 결과 코드로 즉시 종료한다.
process.exit(process.exitCode ?? 0);
