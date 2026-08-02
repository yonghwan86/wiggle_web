// 실제 Chrome을 CDP로 띄워 CSS cascade 뒤의 computed size, 가로 스크롤, 가려진 버튼,
// 초점 이동을 측정한다. 소스 문자열 검사로는 잡히지 않는 UX 회귀를 잡기 위한 도구다.
// 사용: node scripts/browser-check.mjs [baseUrl]
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.argv[2] ?? "http://localhost:3000";
const CHROME_CANDIDATES = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const VIEWPORTS = [
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
    label(element) { return (element.getAttribute('aria-label') || element.textContent || element.className || element.tagName).replace(/\\s+/g, ' ').trim().slice(0, 44); },
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

async function stubCoaching(cdp, session) {
  cdp.on("Fetch.requestPaused", async (params, eventSession) => {
    const target = eventSession ?? session;
    try {
      if (params.request.url.includes("/api/ai/coaching")) {
        const body = Buffer.from(JSON.stringify(STUB_COACHING)).toString("base64");
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
    const created = await post({ action: 'createClassroom', displayName: '브라우저 점검반' });
    if (!created.data.classroom) return { error: 'classroom', detail: created };
    const classroomId = created.data.classroom.id;
    await post({ action: 'toggleAdmission', classroomId, open: true });
    const joined = await fetch('/api/student', { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store', body: JSON.stringify({
      action: 'join', entry: created.data.classroom.classCode, nickname: '점검 화가 ' + Math.floor(Math.random() * 100000), animal: '🐰', picturePassword: ['⭐', '🍎', '⭐'],
    }) });
    const student = await joined.json();
    if (!student.deviceToken) return { error: 'join', detail: student };
    const artwork = await fetch('/api/artworks', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + student.deviceToken }, cache: 'no-store', body: JSON.stringify({
      clientArtworkId: 'artwork_browsercheck' + Date.now(), learningMode: 'free', lessonSlug: null, title: '점검 그림', topic: '자유 창작', intent: '내 마음대로 그리고 싶다.',
    }) });
    const artworkData = await artwork.json();
    if (!artworkData.artwork) return { error: 'artwork', detail: artworkData };
    return { classroomId, classCode: created.data.classroom.classCode, studentId: student.student.id, deviceToken: student.deviceToken, expiresAt: student.expiresAt,
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
        // 1) 홈: 역할 선택
        await navigate(cdp, session, `${BASE}/`);
        await evaluate(cdp, session, MEASURE_HELPERS);
        const homeOverflow = await evaluate(cdp, session, "window.__wiggle.horizontalOverflow()");
        check(homeOverflow.overflow <= 0, `${viewport.name} 홈 가로 스크롤 없음`, homeOverflow);
        const roleSizes = await evaluate(cdp, session, `(() => {
          const student = document.querySelector('.role-button.student-role'); const teacher = document.querySelector('.role-button.teacher-role');
          return { student: student && window.__wiggle.box(student), teacher: teacher && window.__wiggle.box(teacher) };
        })()`);
        check(roleSizes.student && roleSizes.teacher && roleSizes.student.w * roleSizes.student.h > roleSizes.teacher.w * roleSizes.teacher.h,
          `${viewport.name} 홈에서 학생 입장 버튼이 가장 크게 보임`, roleSizes);
        const homeSmall = await evaluate(cdp, session, "window.__wiggle.smallTargets(44)");
        check(homeSmall.length === 0, `${viewport.name} 홈 터치 목표 44px 이상`, homeSmall);

        // 2) QR 입장 단계 화면
        await navigate(cdp, session, `${BASE}/join/${seeded.classCode}`);
        await evaluate(cdp, session, MEASURE_HELPERS);
        const qrEntry = await evaluate(cdp, session, `(() => ({
          hasCodeInput: Boolean([...document.querySelectorAll('label span')].find((item) => item.textContent.includes('수업 코드'))),
          heading: document.querySelector('h1')?.textContent ?? '',
          dots: document.querySelectorAll('.qr-step-dots span').length,
          hasNickname: Boolean([...document.querySelectorAll('label span')].find((item) => item.textContent.includes('그림 별명'))),
          animals: document.querySelectorAll('.chip-row .emoji-chip').length,
          passwordChips: document.querySelectorAll('.picture-chip').length,
          overflow: window.__wiggle.horizontalOverflow().overflow,
          small: window.__wiggle.smallTargets(44),
        }))()`);
        check(!qrEntry.hasCodeInput, `${viewport.name} QR 입장이 수업 코드 입력을 건너뜀`, qrEntry.heading);
        // 3학년 기본: 스테퍼 없이 별명·동물·비밀번호가 한 화면에 다 보인다.
        check(qrEntry.dots === 0 && qrEntry.hasNickname && qrEntry.animals >= 6 && qrEntry.passwordChips >= 8, `${viewport.name} QR 입장이 한 화면 폼으로 열림`, qrEntry);
        check(qrEntry.overflow <= 0, `${viewport.name} QR 입장 가로 스크롤 없음`, qrEntry.overflow);
        check(qrEntry.small.length === 0, `${viewport.name} QR 입장 터치 목표 44px 이상`, qrEntry.small);

        // 3) 공유 태블릿 잠금 해제: 틀린 그림 비밀번호 복구
        await installSession(cdp, session, seeded);
        await navigate(cdp, session, `${BASE}/join`);
        await evaluate(cdp, session, MEASURE_HELPERS);
        const unlockError = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          const click = (element) => { element.click(); return wait(90); };
          const profile = document.querySelector('.profile-button'); if (!profile) return { error: 'no-profile' };
          await click(profile);
          const chips = [...document.querySelectorAll('.picture-chip')];
          for (let index = 0; index < 3; index += 1) await click(chips[(index + 2) % chips.length]);
          const submit = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('내 그림 열기'));
          if (!submit) return { error: 'no-submit' };
          await click(submit);
          for (let attempt = 0; attempt < 60 && !document.querySelector('.child-error'); attempt += 1) await wait(120);
          const box = document.querySelector('.child-error');
          const reset = document.querySelector('.reset-pictures-button');
          const speak = box?.querySelector('.speak-button');
          const before = { icon: box?.querySelector('.child-error-icon')?.textContent ?? '', speak: Boolean(speak), resetAttention: reset?.className.includes('attention') ?? false, filled: document.querySelectorAll('.password-slots span.filled').length, resetBox: reset ? window.__wiggle.box(reset) : null, errorVisible: box ? window.__wiggle.reachable(box) : null };
          if (reset) await click(reset);
          const after = { filled: document.querySelectorAll('.password-slots span.filled').length, errorStillThere: Boolean(document.querySelector('.child-error')), chipsEnabled: [...document.querySelectorAll('.picture-chip')].every((chip) => !chip.disabled) };
          return { before, after };
        })()`);
        check(!unlockError.error, `${viewport.name} 잠금 해제 오류 흐름 재현`, unlockError.error);
        if (!unlockError.error) {
          check(unlockError.before.icon === "⚠️", `${viewport.name} 틀린 비밀번호가 그림(⚠️)으로 표시됨`, unlockError.before.icon);
          check(unlockError.before.speak, `${viewport.name} 오류를 소리로 들을 수 있음`);
          check(unlockError.before.resetAttention, `${viewport.name} 다시 골라요 버튼이 강조됨`);
          check(unlockError.before.resetBox && Math.min(unlockError.before.resetBox.w, unlockError.before.resetBox.h) >= 44, `${viewport.name} 다시 골라요 버튼 44px 이상`, unlockError.before.resetBox);
          check(unlockError.after.filled === 0, `${viewport.name} 한 번 눌러 세 칸 모두 초기화`, unlockError.after);
          check(!unlockError.after.errorStillThere, `${viewport.name} 다시 고르면 이전 오류 문구가 사라짐`);
          check(unlockError.after.chipsEnabled, `${viewport.name} 초기화 뒤 그림 버튼을 다시 누를 수 있음`);
        }

        // 4) 잘못된 수업 코드
        await navigate(cdp, session, `${BASE}/join`);
        await evaluate(cdp, session, MEASURE_HELPERS);
        const codeError = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          const setValue = (element, value) => { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); };
          const first = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('처음 왔어요'));
          if (first) { first.click(); await wait(120); }
          const inputs = [...document.querySelectorAll('input')];
          if (inputs.length < 2) return { error: 'no-inputs', count: inputs.length };
          setValue(inputs[0], '0000'); setValue(inputs[1], '점검 화가'); await wait(80);
          const chips = [...document.querySelectorAll('.picture-chip')];
          for (let index = 0; index < 3; index += 1) { chips[index].click(); await wait(60); }
          const submit = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('수업 들어가기'));
          submit.click();
          for (let attempt = 0; attempt < 60 && !document.querySelector('.child-error'); attempt += 1) await wait(120);
          const highlighted = Boolean(document.querySelector('input.input-error'));
          const callButton = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('선생님 불러요'));
          const callBox = callButton ? window.__wiggle.box(callButton) : null;
          if (callButton) { callButton.click(); await wait(150); }
          return { highlighted, hadCallButton: Boolean(callButton), callBox, noteShown: Boolean(document.querySelector('.teacher-call-note')) };
        })()`);
        check(!codeError.error, `${viewport.name} 잘못된 수업 코드 흐름 재현`, codeError.error);
        if (!codeError.error) {
          check(codeError.highlighted, `${viewport.name} 잘못된 코드 칸이 강조됨`);
          check(codeError.hadCallButton && codeError.callBox && Math.min(codeError.callBox.w, codeError.callBox.h) >= 44, `${viewport.name} 선생님 불러요 버튼 44px 이상`, codeError.callBox);
          check(codeError.noteShown, `${viewport.name} 선생님 부르기 안내가 표시됨`);
        }

        // 4-b) 직접 입력 입장 화면: 고정된 큰 버튼이 그림 비밀번호 칸을 가리지 않는가
        await navigate(cdp, session, `${BASE}/join`);
        await evaluate(cdp, session, MEASURE_HELPERS);
        const stickyOverlap = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          const first = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('처음 왔어요'));
          if (first) { first.click(); await wait(150); }
          const chips = [...document.querySelectorAll('.picture-chip')];
          if (!chips.length) return { error: 'no-chips' };
          chips[chips.length - 1].scrollIntoView({ block: 'end' });
          await wait(300);
          const blockedNow = () => chips.map((chip) => ({ label: window.__wiggle.label(chip), ...window.__wiggle.reachable(chip) })).filter((item) => item.onScreen && !item.hitsSelf);
          const blocked = blockedNow();
          const slots = [...document.querySelectorAll('.password-slots span')].map((slot) => ({ label: 'slot', ...window.__wiggle.reachable(slot) })).filter((item) => item.onScreen && !item.hitsSelf);
          // 세 칸을 다 고른 뒤(=버튼이 눌릴 수 있게 된 뒤)에도 다시 고르기 경로가 살아 있어야 한다.
          for (let index = 0; index < 3; index += 1) { chips[index].click(); await wait(80); }
          const reset = document.querySelector('.reset-pictures-button');
          reset?.scrollIntoView({ block: 'center' }); await wait(250);
          const resetReach = reset ? window.__wiggle.reachable(reset) : null;
          return { blocked, slots, resetReach };
        })()`);
        check(!stickyOverlap.error, `${viewport.name} 직접 입장 화면 재현`, stickyOverlap.error);
        if (!stickyOverlap.error) {
          check(stickyOverlap.blocked.length === 0, `${viewport.name} 그림 비밀번호 버튼이 고정 버튼에 가리지 않음`, stickyOverlap.blocked);
          check(stickyOverlap.slots.length === 0, `${viewport.name} 비밀번호 칸 표시가 가리지 않음`, stickyOverlap.slots);
          check(stickyOverlap.resetReach?.hitsSelf, `${viewport.name} 세 칸을 다 고른 뒤에도 다시 골라요를 누를 수 있음`, stickyOverlap.resetReach);
        }

        // 5) 그리기 화면과 그리미 패널
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
            canvasFullyVisible: canvasBox.top >= -1 && canvasBox.bottom <= innerHeight + 1,
            exitBox: exit ? window.__wiggle.box(exit) : null,
            canvasCenterHit: window.__wiggle.topElementAt(Math.round(canvasBox.left + canvasBox.w / 2), Math.round(canvasBox.top + canvasBox.h / 2)),
          };
        })()`);
        check(!studio.error, `${viewport.name} 그리기 화면 로드`, studio.error);
        if (!studio.error) {
          check(studio.overflow <= 0, `${viewport.name} 그리기 화면 가로 스크롤 없음`, studio.overflow);
          check(studio.small.length === 0, `${viewport.name} 그리기 화면 터치 목표 44px 이상`, studio.small);
          check(studio.exitBox && Math.min(studio.exitBox.w, studio.exitBox.h) >= 44, `${viewport.name} 나가기 버튼 44px 이상`, studio.exitBox);
          check(studio.canvasFullyVisible, `${viewport.name} 도화지가 잘리지 않음`, studio.canvasBox);
          check(studio.canvasCenterHit && String(studio.canvasCenterHit.cls).includes("draw-canvas"), `${viewport.name} 도화지 중앙이 다른 요소에 가려지지 않음`, studio.canvasCenterHit);
        }

        const tools = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          const body = document.querySelector('.studio-body');
          const targets = [...document.querySelectorAll('.tool-panel button')];
          if (!targets.length) return { error: 'no-tools' };
          const unreachable = [];
          for (const target of targets) {
            target.scrollIntoView({ block: 'center' });
            await wait(60);
            const reach = window.__wiggle.reachable(target);
            if (!reach.onScreen || !reach.hitsSelf) unreachable.push({ label: window.__wiggle.label(target), ...reach });
          }
          return { unreachable, scrolls: body ? body.scrollHeight - body.clientHeight : 0 };
        })()`);
        check(!tools.error, `${viewport.name} 도구 패널 재현`, tools.error);
        if (!tools.error) check(tools.unreachable.length === 0, `${viewport.name} 모든 그리기 도구에 닿을 수 있음`, tools.unreachable);

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
          const at = (rect, fx, fy) => ({ x: rect.left + rect.width * fx, y: rect.top + rect.height * fy });
          const clickPanelButton = (label) => evaluate(cdp, session, `(() => {
            const target = [...document.querySelectorAll('.tool-panel button')].find((item) => (item.textContent || item.getAttribute('aria-label') || '').includes(${JSON.stringify(label)}));
            if (!target) return false; target.scrollIntoView({ block: 'center' }); target.click(); return true;
          })()`);
          const pixel = (fx, fy) => evaluate(cdp, session, `(() => {
            const canvas = document.querySelector('.draw-canvas'); const context = canvas.getContext('2d');
            const data = context.getImageData(Math.round(${fx} * canvas.width), Math.round(${fy} * canvas.height), 1, 1).data;
            return [data[0], data[1], data[2]];
          })()`);
          // 이전 뷰포트에서 저장된 그림이 남아 있으므로 절대색이 아니라 "그리기 전과 달라졌는가"로 판정한다.
          const differs = (before, after) => Math.abs(before[0] - after[0]) + Math.abs(before[1] - after[1]) + Math.abs(before[2] - after[2]) > 24;

          // 뷰포트마다 다른 줄에 그린다. 같은 좌표를 재사용하면 앞 뷰포트에서 저장된 그림 위에
          // 같은 색을 다시 그려 "달라졌는가" 판정이 무력해진다.
          const rowShift = VIEWPORTS.findIndex((item) => item.name === viewport.name) * 0.07;
          const mirrorY = 0.85 - rowShift;

          // 대칭: 남색을 고르고 왼쪽에 그은 획이 오른쪽 반사 지점에도 나타난다.
          await evaluate(cdp, session, `(() => { const navy = [...document.querySelectorAll('.palette button')].find((item) => item.getAttribute('aria-label') === '남색'); if (navy) navy.click(); })()`);
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
          await evaluate(cdp, session, `(() => { const swatch = [...document.querySelectorAll('.palette button')].find((item) => item.getAttribute('aria-label') === ${JSON.stringify(fillPlan.label)}); if (swatch) swatch.click(); })()`);
          await sleep(120);
          const beforeFill = await pixel(0.9, 0.08);
          rect = await probeCanvas();
          await tapOn(at(rect, 0.9, 0.08)); await sleep(400);
          const filled = await pixel(0.9, 0.08);
          check(differs(beforeFill, filled) && fillPlan.ok(filled), `${viewport.name} 채우기 탭 한 번으로 영역이 채워짐`, { beforeFill, filled, color: fillPlan.label });

          // 도형 2탭: 남색으로 시작점 탭 → 안내 → 끝점 탭으로 네모가 그려진다 (드래그 대안 경로).
          await clickPanelButton("도형"); await sleep(150);
          await evaluate(cdp, session, `(() => { const shape = [...document.querySelectorAll('.shape-kind-row button')].find((item) => item.getAttribute('aria-label') === '네모'); if (shape) shape.click(); })()`);
          await evaluate(cdp, session, `(() => { const navy = [...document.querySelectorAll('.palette button')].find((item) => item.getAttribute('aria-label') === '남색'); if (navy) navy.click(); })()`);
          await sleep(120);
          // 세로 변이 뷰포트 간 겹치지 않도록 x도 함께 민다.
          const shapeLeft = 0.55 + rowShift; const shapeTop = 0.3 + rowShift; const shapeBottom = 0.5 + rowShift; const shapeProbeY = 0.4 + rowShift;
          const beforeEdge = await pixel(shapeLeft, shapeProbeY);
          rect = await probeCanvas();
          await tapOn(at(rect, shapeLeft, shapeTop));
          const hintShown = await evaluate(cdp, session, `Boolean([...document.querySelectorAll('.canvas-start-hint')].find((item) => item.textContent.includes('끝나는 곳')))`);
          check(hintShown, `${viewport.name} 도형 시작점 탭 뒤 끝점 안내가 보임`, hintShown);
          rect = await probeCanvas();
          await tapOn(at(rect, 0.8 + rowShift, shapeBottom)); await sleep(400);
          const shapeEdge = await pixel(shapeLeft, shapeProbeY);
          check(differs(beforeEdge, shapeEdge) && shapeEdge[2] > 40 && shapeEdge[0] < 120, `${viewport.name} 두 번째 탭으로 네모가 그려짐`, { beforeEdge, shapeEdge });

          // 핀치 폴백(펜 없는 기기): 한 손가락으로 긋다 두 번째 손가락이 합류하면
          // 진행 중 그리기를 버리고 핀치 확대가 실제로 시작돼야 한다.
          rect = await probeCanvas();
          const pinchCenter = at(rect, 0.5, 0.5);
          const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((point, index) => ({ x: Math.round(point.x), y: Math.round(point.y), id: index + 1 })) }, session);
          await touch("touchStart", [{ x: pinchCenter.x - 15, y: pinchCenter.y }]);
          await touch("touchMove", [{ x: pinchCenter.x - 25, y: pinchCenter.y }]);
          await touch("touchStart", [{ x: pinchCenter.x - 25, y: pinchCenter.y }, { x: pinchCenter.x + 25, y: pinchCenter.y }]);
          for (let step = 1; step <= 5; step += 1) await touch("touchMove", [{ x: pinchCenter.x - 25 - step * 14, y: pinchCenter.y }, { x: pinchCenter.x + 25 + step * 14, y: pinchCenter.y }]);
          await touch("touchEnd", []);
          await sleep(250);
          const zoomScale = await evaluate(cdp, session, `(() => { const stack = document.querySelector('.canvas-stack'); const matrix = new DOMMatrix(getComputedStyle(stack).transform); return matrix.a; })()`);
          check(zoomScale > 1.05, `${viewport.name} 손가락 두 개 핀치로 확대됨`, zoomScale);
          await evaluate(cdp, session, `(() => { const reset = document.querySelector('.zoom-reset'); if (reset) reset.click(); })()`);
          await sleep(200);

          // 다음 검증(그리미·소감)을 위해 연필로 되돌린다.
          await clickPanelButton("연필"); await sleep(120);
        }

        const grimi = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          const open = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('그리미 부르기'));
          if (!open) return { error: 'no-grimi-button' };
          open.click();
          for (let attempt = 0; attempt < 40 && !document.querySelector('.grimi-panel'); attempt += 1) await wait(120);
          const panel = document.querySelector('.grimi-panel');
          if (!panel) return { error: 'no-panel' };
          const scroll = panel.querySelector('.grimi-scroll');
          // AI 호출은 키 없이 실패할 수 있다. 패널 자체의 공간과 닫기·탈출 경로를 검증한다.
          for (let attempt = 0; attempt < 50; attempt += 1) { if (!document.querySelector('.grimi-thinking')) break; await wait(200); }
          const box = window.__wiggle.box(panel);
          const close = panel.querySelector('.grimi-head > button');
          const exit = panel.querySelector('.free-exit');
          const style = getComputedStyle(panel);
          return {
            box, position: style.position, maxHeightPx: box.h, viewportHeight: innerHeight,
            scrollHeight: scroll ? scroll.scrollHeight : panel.scrollHeight, clientHeight: scroll ? scroll.clientHeight : panel.clientHeight,
            closeBox: close ? window.__wiggle.box(close) : null,
            closeReachable: close ? window.__wiggle.reachable(close) : null,
            exitReachable: exit ? window.__wiggle.reachable(exit) : null,
            errorText: panel.querySelector('.error-box')?.textContent?.slice(0, 60) ?? '',
            guideRequestVisible: Boolean(panel.querySelector('.guide-request')) && window.__wiggle.visible(panel.querySelector('.guide-request')),
          };
        })()`);
        check(!grimi.error, `${viewport.name} 그리미 패널 열림`, grimi.error);
        if (!grimi.error) {
          check(grimi.position === "fixed", `${viewport.name} 그리미가 바텀시트로 열림`, grimi.position);
          // 시트는 내용에 맞춰 자란다. 내용이 잘리는 경우에만 화면의 절반 이상을 요구한다.
          const clipped = grimi.scrollHeight - grimi.clientHeight > 4;
          check(!clipped || grimi.box.h >= grimi.viewportHeight * 0.5, `${viewport.name} 그리미 표시 영역이 충분히 큼`, { h: grimi.box.h, viewport: grimi.viewportHeight, clipped });
          check(grimi.box.bottom <= grimi.viewportHeight + 1, `${viewport.name} 그리미 시트가 화면 안에 있음`, grimi.box);
          check(grimi.closeBox && Math.min(grimi.closeBox.w, grimi.closeBox.h) >= 44, `${viewport.name} 그리미 닫기 44px 이상`, grimi.closeBox);
          check(grimi.closeReachable?.hitsSelf, `${viewport.name} 그리미 닫기를 바로 누를 수 있음`, grimi.closeReachable);
          check(grimi.exitReachable?.onScreen, `${viewport.name} 그냥 그릴래 탈출 경로가 화면 안에 있음`, grimi.exitReachable);
        }

        // 5-b) 실제 코칭 응답 상태에서: 질문·선택지·다음 행동·확인 버튼이 모두 닿는가
        const coaching = await evaluate(cdp, session, `(async () => {
          const wait = (ms) => new Promise((done) => setTimeout(done, ms));
          const panel = document.querySelector('.grimi-panel');
          if (!panel) return { error: 'no-panel' };
          for (let attempt = 0; attempt < 60 && !panel.querySelector('.grimi-coaching'); attempt += 1) await wait(200);
          const scroll = panel.querySelector('.grimi-scroll');
          if (!panel.querySelector('.grimi-coaching') || !scroll) return { error: 'no-coaching', html: panel.innerText.slice(0, 120) };
          // 아이가 선택지를 골라야 다음 행동과 확인 버튼이 나타난다.
          panel.querySelector('.grimi-chips button')?.click();
          await wait(300);
          const question = panel.querySelector('.grimi-coaching h2');
          const chips = [...panel.querySelectorAll('.grimi-chips button')];
          const confirm = panel.querySelector('.next-action .child-primary-action');
          const exit = panel.querySelector('.free-exit');
          const close = panel.querySelector('.grimi-head > button');
          const reach = (element) => element ? window.__wiggle.reachable(element) : null;
          const startState = { question: reach(question), firstChip: reach(chips[0]), close: reach(close), exit: reach(exit) };
          // 아이가 확인 버튼까지 이동하는 경로: 시트 안쪽 스크롤 한 번
          confirm?.scrollIntoView({ block: 'center' });
          await wait(250);
          const afterScroll = { confirm: reach(confirm), close: reach(close), exit: reach(exit), confirmBox: confirm ? window.__wiggle.box(confirm) : null };
          const nestedScrollers = [...panel.querySelectorAll('*')].filter((element) => element !== scroll && element.scrollHeight - element.clientHeight > 4 && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY));
          return { startState, afterScroll, nestedScrollers: nestedScrollers.map((element) => window.__wiggle.label(element)), scrollerHeight: scroll.clientHeight, contentHeight: scroll.scrollHeight };
        })()`);
        check(!coaching.error, `${viewport.name} 코칭 내용 레이아웃 재현`, coaching.error);
        if (!coaching.error) {
          check(coaching.startState.question?.onScreen, `${viewport.name} 그리미 첫 질문이 바로 보임`, coaching.startState.question);
          check(coaching.startState.firstChip?.hitsSelf, `${viewport.name} 첫 선택지를 바로 누를 수 있음`, coaching.startState.firstChip);
          check(coaching.startState.close?.hitsSelf, `${viewport.name} 코칭 중에도 닫기가 고정되어 보임`, coaching.startState.close);
          check(coaching.startState.exit?.hitsSelf, `${viewport.name} 코칭 중에도 탈출 버튼이 고정되어 보임`, coaching.startState.exit);
          check(coaching.afterScroll.confirm?.hitsSelf, `${viewport.name} 한 번 스크롤로 확인 버튼에 닿음`, coaching.afterScroll.confirm);
          check(coaching.afterScroll.close?.hitsSelf && coaching.afterScroll.exit?.hitsSelf, `${viewport.name} 스크롤 뒤에도 닫기·탈출이 그대로 보임`, coaching.afterScroll);
          check(coaching.nestedScrollers.length === 0, `${viewport.name} 시트 안에 숨은 중첩 스크롤이 없음`, coaching.nestedScrollers);
        }

        // 5-c) 코칭을 유지한 채 그림을 그릴 수 있는가 (그리미가 "선을 하나 더 그어 보자"고 한 뒤)
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
          const canvasBox = window.__wiggle.box(canvas);
          const panelBox = window.__wiggle.box(panel);
          // 도화지 안에서 시트에 가리지 않은 지점이 실제로 그릴 수 있어야 한다.
          const probeY = Math.round(Math.min(canvasBox.bottom, panelBox.top) - 12);
          const probeX = Math.round(canvasBox.left + canvasBox.w / 2);
          const hit = window.__wiggle.topElementAt(probeX, probeY);
          const confirm = peek?.querySelector('.child-primary-action');
          const reExpand = document.querySelector('.grimi-collapse');
          return {
            peekShown: Boolean(peek),
            nextActionShown: Boolean(peek?.querySelector('b')?.textContent?.trim()),
            confirmReachable: confirm ? window.__wiggle.reachable(confirm) : null,
            drawableHeight: Math.round(Math.min(canvasBox.bottom, panelBox.top) - canvasBox.top),
            probeHitsCanvas: Boolean(hit && String(hit.cls).includes('draw-canvas')),
            reExpandReachable: reExpand ? window.__wiggle.reachable(reExpand) : null,
            panelTop: panelBox.top, viewportHeight: innerHeight,
          };
        })()`);
        check(!collapse.error, `${viewport.name} 그리미 접기 재현`, collapse.error);
        if (!collapse.error) {
          check(collapse.peekShown && collapse.nextActionShown, `${viewport.name} 접어도 다음 행동이 계속 보임`, collapse);
          check(collapse.confirmReachable?.hitsSelf, `${viewport.name} 접은 상태에서 '그렸어요'를 누를 수 있음`, collapse.confirmReachable);
          check(collapse.drawableHeight >= 140, `${viewport.name} 접으면 그릴 수 있는 도화지가 남음`, { drawableHeight: collapse.drawableHeight });
          check(collapse.probeHitsCanvas, `${viewport.name} 접은 상태에서 도화지에 실제로 그릴 수 있음`, collapse);
          check(collapse.reExpandReachable?.hitsSelf, `${viewport.name} 그리미를 다시 펼칠 수 있음`, collapse.reExpandReachable);
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
          return { focusedInside, backgroundInert, backgroundHidden, overflow, small, closed, focusRestored, inertCleared };
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
