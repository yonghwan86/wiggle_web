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

test("the tool panel renders unconditionally and is never gated behind an open/closed toggle", async () => {
  const studio = await read("../app/components/DrawingStudio.tsx");
  const compact = studio.replace(/\s+/g, " ");
  // aside.tool-panel은 조건부 렌더({open && <aside...) 없이 항상 그려지고, ref로만
  // (mobile-tool-peek 버튼이 스크롤시켜 보여주는 용도로) 참조된다.
  assert.match(compact, /<aside className="tool-panel" ref=\{toolPanelRef\} aria-label="그리기 도구 모음">/);
  assert.doesNotMatch(compact, /\{toolTrayOpen && <aside/, "tool-panel이 조건부로만 렌더되면 안 된다");
  assert.doesNotMatch(compact, /className=\{`tool-panel\$\{/, "tool-panel에 열림 상태에 따른 동적 클래스가 남아 있으면 안 된다");
});

test("the mobile tool-panel peek button scrolls the always-visible panel into view, it does not open a hidden tray", async () => {
  const css = await read("../app/globals.css");
  const studio = await read("../app/components/DrawingStudio.tsx");
  const compact = studio.replace(/\s+/g, " ");
  assert.match(
    compact,
    /<button type="button" className="mobile-tool-peek" onClick=\{\(\) => toolPanelRef\.current\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)\}>/,
  );
  // 데스크톱/일반 화면에서는 숨기고, 세로가 짧은 좁은 폰 화면에서만 뜬 힌트로 보여준다.
  assert.match(css, /\.mobile-tool-peek \{ display:none; \}/);
  const shortNarrowStart = css.indexOf("@media (max-width:460px) and (max-height:650px)");
  const shortNarrow = css.slice(shortNarrowStart, css.indexOf("}", css.indexOf(".mobile-tool-peek {", shortNarrowStart)) + 1);
  assert.match(shortNarrow, /\.mobile-tool-peek \{ position:fixed;/);
});

test("narrow portrait canvas keeps an explicit floor so a tall tool panel can't squeeze it to nothing", async () => {
  const css = await read("../app/globals.css");
  const narrowPortraitStart = css.indexOf("@media (max-width:460px) and (orientation:portrait)");
  const narrowPortraitEnd = css.indexOf("@media (max-width:360px) and (orientation:portrait)", narrowPortraitStart);
  const narrowPortrait = css.slice(narrowPortraitStart, narrowPortraitEnd);
  // 회귀(2026-08-17): .studio-body는 flex-column이고 .canvas-zone은 flex:1(basis 0%)이라
  // 물려받는데, 320x568 자유그리기처럼 도구 패널 내용(492px)이 studio-body 높이(508px)에
  // 육박하면 캔버스의 성장분이 16px로 짜부라진다. container-type:size인 .canvas-wrap도
  // 컨테이너가 명시적 크기를 못 받으면 0으로 붕괴한다. 도화지에 명시적 최소 높이를 주고
  // flex 성장 경쟁에서 빼내야(flex:0 0 auto) 먼저 자리를 확보한다 — 순수 flex:1 + container
  // query 성장만으로는 이 폭에서 재현 가능하게 무너진다.
  assert.match(narrowPortrait, /\.canvas-zone \{ flex:0 0 auto; min-height:min\(calc\(100vw - 16px\),320px\); container-type:normal; \}/,
    "도화지가 명시적 최소 높이로 flex 성장 경쟁에서 자리를 먼저 확보해야 한다");
  assert.match(narrowPortrait, /\.canvas-zone \.canvas-wrap \{ width:min\(calc\(100vw - 16px\),320px\); height:auto; max-width:100%; max-height:none; \}/,
    "도화지 그림판은 컨테이너 쿼리가 아니라 뷰포트 폭 기반 고정 정사각형이어야 한다");
  assert.match(narrowPortrait, /\.tool-panel \{ flex:0 0 auto; \}/,
    "도구 패널은 flex 성장에 끼어들지 않고 자기 내용 높이만큼만 차지해야 한다");
});

test("the tool panel occupies a fixed grid row alongside the canvas instead of floating over it as a fixed-position dock", async () => {
  const css = await read("../app/globals.css");
  const mobileStart = css.indexOf("@media (max-width:720px) {\n  .entry-shell");
  const mobileEnd = css.indexOf("@media (max-width:460px) and (orientation:portrait)", mobileStart);
  const mobile = css.slice(mobileStart, mobileEnd);
  // 회귀: 이전에는 .tool-panel이 position:fixed 바텀시트 dock이라 캔버스 위에 떠 있었고,
  // 그 높이만큼 .canvas-zone에 padding-bottom을 항상 남겨둬야 했다. 지금은 도구 패널이
  // 캔버스와 나란히 문서 흐름에 자리 잡은 grid 셀이라 그런 예약 여백이 필요 없다.
  assert.doesNotMatch(mobile, /\.tool-panel \{[^}]*position:fixed/, "도구 패널이 다시 fixed dock이 되면 안 된다");
  assert.doesNotMatch(mobile, /var\(--tool-dock-height/, "고정 dock 높이 변수를 참조하는 예약 여백이 남아 있으면 안 된다");
  assert.match(mobile, /\.canvas-zone \{ container-type:size; \}/);
  assert.match(mobile, /\.tool-panel \{[^}]*display:grid;/, "도구 패널은 항상 보이는 grid 레이아웃이어야 한다");
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

test("dock and tool panel CSS still honor the 44px minimum touch target on phone-width portrait screens", async () => {
  const css = await read("../app/globals.css");
  const mobileStart = css.indexOf("@media (max-width:720px) {\n  .entry-shell");
  const mobileEnd = css.indexOf("@media (max-width:460px) and (orientation:portrait)", mobileStart);
  const mobile = css.slice(mobileStart, mobileEnd);
  assert.match(mobile, /\.tool-panel \.tool-group button \{ min-width:0; min-height:48px;/);
  assert.match(mobile, /\.tool-panel \.history-row button \{ min-width:0; min-height:44px;/);
});
