import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// 이 파일은 실제 렌더링된 브라우저 계산값(computed style, getBoundingClientRect)을
// 증명하지 않는다 — CSS 소스에 특정 선택자·규칙이 존재/부재하는지만 정적으로 확인하는
// 계약 테스트다. 실제 화면 좌표·겹침·스크롤은 scripts/browser-check.mjs(실 Chrome)로만
// 확인할 수 있다.
const read = async (path) => (await readFile(new URL(path, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

test("compact header teacher-message button no longer inherits the floating bottom-pill offset", async () => {
  const css = await read("../app/globals.css");
  // 회귀: 이전에는 .student-message-button.floating { bottom:8px; ... }가 :not(.compact)
  // 없이 걸려 있어, 헤더 안의 컴팩트+floating 버튼(position:relative)까지 8px 위로
  // 밀려 옆 헤더 컨트롤과 세로로 어긋났다.
  assert.match(css, /\.student-message-button:not\(\.compact\) \{ width:100%; justify-content:center; \}/);
  assert.match(css, /\.student-message-button\.floating:not\(\.compact\) \{ top:auto;/);
  assert.doesNotMatch(css, /\.student-message-button\.floating \{ top:auto;/, "compact를 제외하지 않은 옛 규칙이 남아 있으면 안 된다");
});

test("the collapsible tool tray (toggle, backdrop, tray-open state) has been fully removed", async () => {
  const css = await read("../app/globals.css");
  const studio = await read("../app/components/DrawingStudio.tsx");
  // 회귀: 도구 패널을 좁은 화면에서 접힌 바텀시트로 감추던 옛 트레이 메커니즘이
  // 되살아나면 안 된다 — 도구 패널은 항상 그대로 보여야 한다(캔버스 지배적 레이아웃은
  // dominant-canvas 크기 계산으로만 확보한다, 패널을 숨겨서가 아니라).
  assert.doesNotMatch(css, /tool-tray-toggle/, "CSS에 트레이 토글 선택자가 남아 있으면 안 된다");
  assert.doesNotMatch(css, /tool-tray-backdrop/, "CSS에 트레이 배경 선택자가 남아 있으면 안 된다");
  assert.doesNotMatch(css, /tray-open/, "CSS에 tray-open 상태 선택자가 남아 있으면 안 된다");
  assert.doesNotMatch(studio, /toolTrayOpen/, "DrawingStudio에 트레이 열림 상태가 남아 있으면 안 된다");
  assert.doesNotMatch(studio, /setToolTrayOpen/, "DrawingStudio에 트레이 열림 상태 setter가 남아 있으면 안 된다");
  assert.doesNotMatch(studio, /tool-tray-toggle|tool-tray-backdrop|tool-tray-sheet/, "DrawingStudio에 트레이 관련 클래스/id가 남아 있으면 안 된다");
});

test("the tool dock always renders and folds like an accordion from its own handle", async () => {
  const studio = await read("../app/components/DrawingStudio.tsx");
  const css = await read("../app/globals.css");
  const compact = studio.replace(/\s+/g, " ");
  // 2026-09-15 사용자 요청: 막대를 접었다 펼친다. 접어도 aside는 남고 "도구" 단추 하나만 보인다(조건부 렌더로 사라지면 다시 펼 수 없다).
  assert.match(compact, /<aside className=\{`tool-dock\$\{dockOpen \? "" : " is-collapsed"\}`\} aria-label="그리기 도구 모음"/);
  assert.doesNotMatch(compact, /\{[a-zA-Z]+ && <aside className/, "도구 막대가 조건부로만 렌더되면 안 된다");
  assert.match(compact, /className="dock-toggle" aria-expanded=\{dockOpen\} aria-label=\{dockOpen \? "그리기 도구 접기" : "그리기 도구 펼치기"\}/);
  // "누르면 위로 올라가고 내리면 아래로 내려가는 느낌": 막대 자체가 화면 아래로 미끄러진다. 손잡이를 끌어도 된다.
  assert.match(css, /\.tool-dock\.is-collapsed \{ translate:0 calc\(100% \+ 12px \+ env\(safe-area-inset-bottom\)\); visibility:hidden;/);
  assert.match(css, /\.tool-dock \{ transition:translate/);
  assert.match(studio, /moved > 16 \? false : moved < -16 \? true : !open/);
  assert.match(css, /\.dock-toggle \{[^}]*height:44px; min-height:44px;/);
});

test("the tool dock is always on screen, so the old scroll-to-tools peek button is gone", async () => {
  const css = await read("../app/globals.css");
  const studio = await read("../app/components/DrawingStudio.tsx");
  // 도구가 도화지 아래 문서 흐름에 있던 시절에는 "도구로 스크롤" 버튼이 필요했다. 막대는 늘 화면 아래에 떠 있다.
  assert.doesNotMatch(studio, /mobile-tool-peek|toolPanelInView|scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.doesNotMatch(css, /mobile-tool-peek/);
  assert.match(css, /\.tool-dock \{[^}]*position:fixed;[^}]*bottom:calc\(10px \+ env\(safe-area-inset-bottom\)\);/);
});

test("the paper fills the screen edge to edge and the fixed dock floats over it", async () => {
  const css = await read("../app/globals.css");
  // 2026-09-15 사용자 결정: 도화지는 어떤 기기든 화면을 꽉 채운다. 막대는 흐름에서 자리를 뺏지 않고 도화지 위에 뜨며 접을 수 있다.
  // 실측(2026-09-15): 1440·1180·1024·820×1180·768×1024·844×390·390·320에서 새 도화지와 화면 사이 여백 0.
  assert.match(css, /\.studio \{ --dock-space:calc\(126px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.doesNotMatch(css, /\.studio-body \{ padding-bottom:var\(--dock-space\); \}/);
  assert.match(css, /\.canvas-zone \{ padding:0; \}/);
  assert.match(css, /\.tool-dock \{[^}]*height:106px;/);
  // 옛 320px 고정 도화지(도구 판이 흐름에 있을 때의 우회)는 없어야 막대 위 남은 공간을 도화지가 다 쓴다.
  assert.doesNotMatch(css, /min-height:min\(calc\(100vw - 16px\),320px\)/);
});

test("small-screen Mongri sheet covers the dock from the bottom edge", async () => {
  const css = await read("../app/globals.css");
  // 판을 막대 위로 올리면 접은 판과 막대가 겹쳐 쌓여 좁은 화면에서 그릴 도화지가 사라진다(2026-09-14 실측).
  assert.doesNotMatch(css, /\.grimi-panel \{ bottom:var\(--dock-space\)/);
  assert.match(css, /\.step-panel,\.grimi-panel \{ max-height:calc\(100% - 28px - var\(--dock-space\)\); \}/);
});

test("the tool panel keeps every tool reachable at once on phone-width portrait screens, none are hidden behind nth-child dock-collapse rules", async () => {
  const css = await read("../app/globals.css");
  const mobileStart = css.indexOf("@media (max-width:720px) {\n  .entry-shell");
  const mobileEnd = css.indexOf("@media (max-width:460px) and (orientation:portrait)", mobileStart);
  const mobile = css.slice(mobileStart, mobileEnd);
  // 회귀: 접힌 dock 시절에는 브러시군 3번째 이후, 만들기군 2번째 이후, 고치기군 2번째
  // 이후 버튼을 nth-child로 숨겨 트레이를 펼쳐야만 다시 보였다. 지금은 항상 보이는
  // grid 레이아웃이라 그런 숨김 규칙이 있으면 안 된다.
  assert.doesNotMatch(mobile, /nth-child\(n\+\d\)\s*\{\s*display:none/, "숨겨진 도구가 있으면 안 된다 — 도구 패널은 항상 전체가 보여야 한다");
});

test("dock controls honor the 44px minimum touch target", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /\.dock-tool \{[^}]*min-width:44px;[^}]*min-height:44px;/);
  assert.match(css, /\.dock-history button,\.dock-more \{[^}]*width:48px; height:48px; min-height:48px;/);
  assert.match(css, /\.dock-color,\.dock-current-color,\.dock-more-colors \{ width:44px; height:44px; min-width:44px; min-height:44px;/);
  assert.match(css, /\.dock-width button \{[^}]*width:44px; height:44px; min-height:44px;/);
  assert.match(css, /\.dock-width input\[type="range"\] \{[^}]*height:44px;/);
  assert.match(css, /@media \(max-height:500px\) and \(orientation:landscape\) \{[\s\S]*?\.dock-history button,\.dock-more \{ width:44px; height:44px; min-height:44px; \}/);
});

test("몽그리 머리의 원형 규칙은 닫기(×)만 잡고 글자 단추인 접기는 건드리지 않는다", async () => {
  const css = await read("../app/globals.css");
  /* 회귀(2026-09-23 재발): .grimi-head>button의 원형 규칙은 × 전용인데 :not()이 없으면
     글자 단추인 .grimi-collapse까지 폭 48px에 가둔다. 「✏️ 그리러 가기」는 135px이 필요해
     844×390에서 글자가 잘렸다(실측 폭 48 / 필요 135). 같은 수정이 한 번 원격 main에서
     사라졌기 때문에 이 시험으로 묶어 둔다 — 세 규칙 모두 접기를 빼야 한다. */
  for (const rule of [
    /\.grimi-head>button:not\(\.grimi-collapse\) \{ border:0; background:#f5edcf; width:34px; height:34px;/,
    /\.grimi-head>button:not\(\.grimi-collapse\) \{ width:44px; height:44px; \}/,
    /\.studio-body>\.grimi-panel>\.grimi-head>button:not\(\.grimi-collapse\) \{ width:48px; height:48px; \}/,
  ]) assert.match(css, rule);
  // 접기를 빼지 않은 옛 규칙이 하나라도 남으면 다시 잘린다.
  assert.doesNotMatch(css, /\.grimi-head>button \{/, "접기를 제외하지 않은 원형 규칙이 남아 있으면 안 된다");
  // 접기 단추는 글자가 줄바꿈되지 않고 제 폭을 가져야 한다.
  assert.match(css, /\.grimi-collapse \{[^}]*white-space:nowrap;/);
});

test("보관함의 세 겹 그리드는 줄어들 수 있는 칼럼을 가진다", async () => {
  const css = await read("../app/globals.css");
  /* 회귀(2026-09-23 실측): 칼럼을 적지 않으면 암묵 `auto` 칼럼이 안쪽 썸네일 줄의
     max-content(886px)까지 부푼다. html이 잘라 내므로 가로 스크롤은 생기지 않고
     내용만 오른쪽으로 사라진다 — 390px에서 머리·무대가 882px로 잡혀 단추가 화면 밖에 있었다.
     browser-check가 /student/archive를 방문하지 않아 게이트에 걸리지 않았으므로 여기서 묶는다. */
  for (const rule of [
    /\.archive-book-page \{ min-height:100dvh; display:grid; grid-template-columns:minmax\(0,1fr\);/,
    /\.archive-stage \{ display:grid; grid-template-columns:minmax\(0,1fr\); place-items:center;/,
    /\.archive-book \{ width:min\(1500px,100%\); display:grid; grid-template-columns:minmax\(0,1fr\);/,
  ]) assert.match(css, rule);
  // 썸네일 줄이 가로 스크롤러라는 전제가 깨지면 위 칼럼만으로는 부족해진다.
  assert.match(css, /\.archive-book-list>ul \{ display:flex;[^}]*overflow-x:auto;/);
});
