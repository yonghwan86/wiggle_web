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

test("tool tray backdrop wins over the global display:none default regardless of source order", async () => {
  const css = await read("../app/globals.css");
  // 회귀: .tool-tray-backdrop { display:block } 규칙이 전역 기본값
  // (.tool-tray-toggle,.tool-tray-backdrop { display:none })과 특정성이 같아(둘 다 클래스
  // 하나), 나중에 나오는 전역 기본값이 소스 순서로 이겨 배경이 항상 display:none이었다.
  // .studio-body> 스코프로 특정성을 두 클래스로 올려 항상 이기게 한다.
  const activeRuleCount = css.match(/\.studio-body>\.tool-tray-backdrop \{ display:block; position:fixed; inset:0;/g)?.length ?? 0;
  assert.equal(activeRuleCount, 2, "폰 세로·아이패드 세로 두 구간 모두에 특정성이 올라간 규칙이 있어야 한다");
  assert.doesNotMatch(css, /(?<!\.studio-body>)\.tool-tray-backdrop \{ display:block;/, "특정성을 올리지 않은 옛 규칙이 남아 있으면 안 된다");
  const globalDefaultIndex = css.indexOf(".tool-tray-toggle,.tool-tray-backdrop { display:none; }");
  assert.ok(globalDefaultIndex > 0, "전역 기본값 규칙 자체는 그대로 있어야 한다(데스크톱에서 숨김)");
  // 배경은 뷰포트 전체를 덮고, 누르면 트레이를 닫는다(클릭 바깥 닫기).
  assert.match(css, /\.studio-body>\.tool-tray-backdrop \{ display:block; position:fixed; inset:0; z-index:8;/);
  const studio = await read("../app/components/DrawingStudio.tsx");
  assert.match(studio, /\{toolTrayOpen && <div className="tool-tray-backdrop" onClick=\{\(\) => setToolTrayOpen\(false\)\}/);
});

test("narrow portrait canvas is no longer capped at a fixed 320px square", async () => {
  const css = await read("../app/globals.css");
  const narrowPortraitStart = css.indexOf("@media (max-width:460px) and (orientation:portrait)");
  const narrowPortraitEnd = css.indexOf("@media (max-width:360px) and (orientation:portrait)", narrowPortraitStart);
  const narrowPortrait = css.slice(narrowPortraitStart, narrowPortraitEnd);
  // 회귀: 390x844처럼 실제로는 세로 공간이 넉넉한 화면에서도 도화지가 320px 정사각형으로
  // 고정돼, 그 아래 390px 가까이가 빈 공간으로 낭비됐다.
  assert.doesNotMatch(narrowPortrait, /min\(calc\(100vw - 16px\),320px\)/, "고정 320px 캡이 남아 있으면 안 된다");
  assert.doesNotMatch(narrowPortrait, /\.canvas-zone \{ flex:0 0 auto;/, "flex:0 0 auto로 도화지 성장을 막던 옛 규칙이 남아 있으면 안 된다");
  assert.doesNotMatch(narrowPortrait, /container-type:normal/, "container-type:normal이 남아 있으면 cq 기반 크기 계산(100cqh)이 깨진다");
  // 720px 블록에서 물려받는 flex:1 + container query 기반 정사각형 크기 계산이 그대로 적용된다.
  assert.match(css, /\.canvas-zone \{ order:2; padding:8px; flex:1; \}/);
  assert.match(css, /@supports \(width:1cqh\) \{ \.canvas-zone \.canvas-wrap \{ width:min\(100cqw,100cqh\);/);
});

test("initial guided-activity viewport leaves room for a dock-clear canvas on short narrow phones", async () => {
  const css = await read("../app/globals.css");
  const narrowPortraitStart = css.indexOf("@media (max-width:460px) and (orientation:portrait)");
  const narrowPortraitEnd = css.indexOf("@media (max-width:360px) and (orientation:portrait)", narrowPortraitStart);
  const narrowPortrait = css.slice(narrowPortraitStart, narrowPortraitEnd);
  // 캔버스 영역은 여전히 고정 dock 높이만큼 아래 여백을 남겨(720px 블록에서 상속),
  // 뜬 dock이 도화지를 가리지 않는다. 레슨 패널도 이 구간에서 더 압축해 도화지가
  // 초기 화면 안에서 온전히 보일 여지를 넉넉히 남긴다.
  const mobileStart = css.indexOf("@media (max-width:720px) {\n  .entry-shell");
  const mobile = css.slice(mobileStart, css.indexOf("@media (max-width:460px) and (orientation:portrait)", mobileStart));
  assert.match(mobile, /\.canvas-zone \{ container-type:size; padding-bottom:calc\(8px \+ var\(--tool-dock-height,66px\) \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(narrowPortrait, /\.step-panel \{ padding:6px 8px; \}/);
  assert.match(narrowPortrait, /\.step-panel \.guide-actions button \{ min-height:44px;/);
  assert.match(narrowPortrait, /\.step-panel \.choice-chips button \{ min-height:44px;/);
});

test("collapsed dock keeps only pencil, crayon, fill and eraser visible on phone-width portrait screens", async () => {
  const css = await read("../app/globals.css");
  const mobileStart = css.indexOf("@media (max-width:720px) {\n  .entry-shell");
  const mobile = css.slice(mobileStart, css.indexOf("@media (max-width:460px) and (orientation:portrait)", mobileStart));
  // 회귀: 닫힌 dock에 브러시(4)+채우기그룹(3)+고치기그룹(2) = 9개 도구 버튼과 토글까지
  // 10개가 한 줄에 다 들어가려 해 scrollWidth가 뷰포트보다 훨씬 넓었다(가로 스크롤 발생,
  // 핵심 도구 일부가 화면 밖으로 밀림). 닫힌 dock에는 연필·크레용(브러시군 1~2번째),
  // 채우기(만들기군 1번째), 지우개(고치기군 1번째)만 남기고 나머지는 트레이 전용으로 뺀다.
  assert.match(mobile, /\.tool-panel:not\(\.tray-open\) \.brush-group button:nth-child\(n\+3\),\n\s*\.tool-panel:not\(\.tray-open\) \.make-group button:nth-child\(n\+2\),\n\s*\.tool-panel:not\(\.tray-open\) \.edit-group button:nth-child\(n\+2\) \{ display:none; \}/);
  // 아이패드 세로(768x1024)는 이미 통과한 레이아웃이라 건드리지 않는다 — 같은 규칙이
  // 그 블록에는 없어야 한다.
  const ipadStart = css.indexOf("@media (min-width:721px) and (max-width:1024px) and (orientation:portrait)");
  const ipad = css.slice(ipadStart, css.indexOf("@media (max-width:720px)", ipadStart));
  assert.doesNotMatch(ipad, /nth-child\(n\+3\)/, "이미 통과한 아이패드 세로 dock은 그대로 둔다");
});

test("expanding the tray reveals every tool and secondary control again", async () => {
  const css = await read("../app/globals.css");
  const mobileStart = css.indexOf("@media (max-width:720px) {\n  .entry-shell");
  const mobile = css.slice(mobileStart, css.indexOf("@media (max-width:460px) and (orientation:portrait)", mobileStart));
  // .tray-open 상태에서는 nth-child로 숨겼던 마커·수채붓·도형·글씨·대칭을 포함해 모든
  // 부가 컨트롤(굵기, 색, 펼친 팔레트, 입력 방법, 되돌리기)이 다시 보인다.
  assert.doesNotMatch(mobile, /\.tool-panel\.tray-open[^{]*nth-child/, "펼친 트레이에는 nth-child 숨김이 적용되면 안 된다");
  assert.match(mobile, /\.tool-panel\.tray-open>\.tool-section-label,\.tool-panel\.tray-open \.shape-options,\.tool-panel\.tray-open \.text-options,\.tool-panel\.tray-open \.width-row,\.tool-panel\.tray-open \.selected-color,\.tool-panel\.tray-open \.more-colors-button,\.tool-panel\.tray-open \.palette,\.tool-panel\.tray-open \.input-mode-control,\.tool-panel\.tray-open \.history-row,\.tool-panel\.tray-open \.pen-mode-note,\.tool-panel\.tray-open \.palette-shade \{ display:block;/);
});

test("dock and tray CSS still honor the 44px minimum touch target on phone-width portrait screens", async () => {
  const css = await read("../app/globals.css");
  const mobileStart = css.indexOf("@media (max-width:720px) {\n  .entry-shell");
  const mobile = css.slice(mobileStart, css.indexOf("@media (max-width:460px) and (orientation:portrait)", mobileStart));
  assert.match(mobile, /\.tool-panel \.tool-tray-toggle \{[^}]*width:48px; min-width:48px; height:48px; min-height:48px;/);
  assert.match(mobile, /\.tool-panel \.tool-group button \{ min-width:48px; min-height:48px;/);
});
