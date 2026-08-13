import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path) =>
  (await readFile(new URL(path, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const compactSource = (text) => text.replace(/\s+/g, " ");

test("Korean text wraps by word while code, passwords, emoji and canvas surfaces stay intact", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /body \{ word-break:keep-all; overflow-wrap:break-word; word-wrap:break-word; \}/);
  assert.match(css, /code,pre,\.personal-card code \{[^}]*white-space:nowrap;[^}]*word-break:normal;[^}]*overflow-wrap:normal;[^}]*word-wrap:normal;/);
  assert.match(css, /\.password-preview,\.emoji-chip,\.picture-chip,\.class-code strong,\.qr-panel strong,\.large-qr-code strong,\.draw-canvas,\.guide-canvas \{ word-break:normal; overflow-wrap:normal; word-wrap:normal; \}/);
  assert.match(css, /\.password-preview \{ overflow-x:auto; white-space:nowrap; \}/);
  assert.match(css, /@supports \(overflow-wrap:anywhere\) \{[^}]*overflow-wrap:anywhere;/);
});

test("mobile forms, actions and overlays honor iPhone zoom, touch and safe-area constraints", async () => {
  const [css, layout] = await Promise.all([read("../app/globals.css"), read("../app/layout.tsx")]);
  assert.match(layout, /export const viewport: Viewport = \{ width: "device-width", initialScale: 1, viewportFit: "cover" \}/);
  assert.match(css, /input,textarea,select \{ font-size:16px; \}/);
  assert.match(css, /button \{ min-height:44px; touch-action:manipulation; \}/);
  assert.match(css, /\.direct-answer input,\.guide-request input \{ font-size:16px; \}/);
  assert.match(css, /\.entry-shell \{ min-height:100dvh; padding:[^}]*safe-area-inset-bottom/);
  assert.match(css, /\.entry-card>\.button\.primary\.full \{ position:sticky; bottom:calc\(8px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.modal-backdrop \{ padding:[^}]*safe-area-inset-top[^}]*safe-area-inset-bottom/);
  assert.match(css, /\.app-shell \{[^}]*safe-area-inset-right[^}]*safe-area-inset-bottom[^}]*safe-area-inset-left/);
  assert.match(css, /\.app-header \{ min-height:calc\(74px \+ env\(safe-area-inset-top\)\); padding-top:env\(safe-area-inset-top\); \}/);
  assert.match(css, /\.reflection-modal,\.text-composer-modal,\.teacher-preview,\.timelapse-modal,\.large-qr-dialog \{[^}]*max-height:calc\(100dvh - max\(16px,env\(safe-area-inset-top\)\) - max\(16px,env\(safe-area-inset-bottom\)\)\);/);
  assert.doesNotMatch(css.slice(css.lastIndexOf("@media (max-width:460px)")), /max-height:calc\(100dvh - 24px\)/);
  assert.match(css, /\.palette button \{ width:44px; min-width:44px; height:44px; \}/);
  assert.match(css, /\.width-row button \{ width:44px; min-width:44px; height:44px; \}/);
  assert.ok(css.lastIndexOf("bottom:max(8px,env(safe-area-inset-bottom))") > css.lastIndexOf(".student-footer { bottom:8px"));
});

test("mobile lesson cards keep the picture, copy and start action readable", async () => {
  const css = await read("../app/globals.css");
  const mobileStart = css.indexOf("@media (max-width:720px) {\n  .lesson-card");
  const mobile = css.slice(mobileStart, css.indexOf("@media (max-width:460px)", mobileStart));

  assert.match(mobile, /\.lesson-card \{ display:grid; grid-template-columns:112px minmax\(0,1fr\);/);
  assert.match(mobile, /\.lesson-card>:is\(\.lesson-illustration,\.lesson-finished-illustration\) \{ grid-column:1; grid-row:1\/span 2;/);
  assert.match(mobile, /\.lesson-card>\.observation-reference \{ grid-column:1; grid-row:1\/span 2;/);
  assert.match(mobile, /\.lesson-card>div:not\(\.lesson-finished-illustration\):not\(\.observation-reference\) \{ grid-column:2; grid-row:1;/);
  assert.match(mobile, /\.lesson-card>b \{ grid-column:2; grid-row:2;/);
});

test("mobile studio and teacher layouts finish in two rows without horizontal text overflow", async () => {
  const [css, studioRaw, teacher] = await Promise.all([read("../app/globals.css"), read("../app/components/DrawingStudio.tsx"), read("../app/components/TeacherApp.tsx")]);
  const studio = compactSource(studioRaw);
  // 첫 720px 블록은 레거시, 두 번째가 최종 모바일 도구 배치다. 뒤에 학생 홈 전용
  // 720px 블록도 있으므로 고유한 entry-shell 시작점을 기준으로 자른다.
  const finalMobileStart = css.indexOf("@media (max-width:720px) {\n  .entry-shell");
  const finalMobile = css.slice(finalMobileStart, css.indexOf("@media (max-width:460px) and (orientation:portrait)", finalMobileStart));
  assert.ok(css.lastIndexOf("grid-template-rows:calc(60px + env(safe-area-inset-top)) minmax(0,1fr)") > css.lastIndexOf("grid-template-rows:60px 1fr 92px"));
  assert.match(css, /\.canvas-message,\.save-conflict,\.teacher-viewing,\.voice-speaking \{[^}]*max-width:calc\(100vw - max\(12px,env\(safe-area-inset-left\)\) - max\(12px,env\(safe-area-inset-right\)\)\);[^}]*overflow-wrap:break-word;/);
  assert.match(css, /\.canvas-message \{[^}]*grid-template-columns:minmax\(0,1fr\) 44px 44px;/);
  assert.match(css, /\.canvas-message>\.canvas-message-close \{ grid-column:3; grid-row:1 \/ span 2; \}/);
  assert.match(css, /\.artwork-name b,\.artwork-name small \{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; \}/);
  assert.match(css, /\.teacher-room \.teacher-header \{ display:grid; grid-template-columns:auto minmax\(0,1fr\) auto;/);
  assert.match(css, /\.message-history p,\.family-link-history p \{ display:grid; grid-template-columns:minmax\(0,1fr\) auto;/);
  assert.match(css, /html,body \{ width:100%; max-width:100%; overflow-x:hidden; \}/);
  assert.match(studio, /className="button ghost compact"/);
  assert.match(studio, /className="button grimi-button compact"/);
  assert.match(studio, /className="button primary compact"/);
  assert.match(css, /\.studio-header>\.button\.ghost\.compact:before \{ content:"⏱"; \}/);
  assert.match(css, /\.studio-header>\.grimi-button:before \{ content:"✨"; \}/);
  assert.match(css, /\.studio-header>\.button\.primary\.compact:before \{ content:"✓"; \}/);
  assert.match(css, /\.save-conflict \{ top:auto; bottom:calc\(72px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(studio, /aria-label="연필" title="연필"[\s\S]*?<span className="tool-icon" aria-hidden="true">\s*✏️\s*<\/span>\s*<span className="tool-name" aria-hidden="true">\s*연필\s*<\/span>/);
  assert.doesNotMatch(studio, /✒️|>펜<|>펜<\/button>/);
  // 도구 그룹은 브러시(4)·만들기(2)·고치기(지우개+대칭)로 재편됐다. aria-pressed는 studioTool 기준.
  assert.match(studio, /className="tool-group brush-group" role="group" aria-label="브러시"[\s\S]*aria-pressed=\{studioTool === "pencil"\}[\s\S]*aria-pressed=\{studioTool === "crayon"\}[\s\S]*aria-pressed=\{studioTool === "marker"\}[\s\S]*aria-pressed=\{studioTool === "watercolor"\}/);
  assert.match(studio, /className="tool-group make-group" role="group" aria-label="채우기와 도형"/);
  assert.match(studio, /className="tool-group edit-group" role="group" aria-label="고치기"[\s\S]*aria-pressed=\{studioTool === "eraser"\}/);
  assert.match(css, /\.tool-group \.tool-name \{ display:none; \}/);
  assert.match(studio, /className="width-row" role="group" aria-label="선 굵기"/);
  assert.match(studio, /className="palette" role="group" aria-label="색 고르기"/);
  assert.match(studio, /className="history-row" role="group" aria-label="그리기 기록"[\s\S]*<b>되돌리기<\/b>[\s\S]*<b>다시하기<\/b>/);
  // 캔버스가 화면을 지배하도록, 좁은 세로 화면의 도구 패널은 화면 아래 뜬 compact dock
  // (도구 선택만 상시 노출)과 ✕/🎨 토글로 여는 tray(부가 컨트롤)로 나뉜다.
  assert.match(finalMobile, /\.tool-panel \{[^}]*position:fixed; left:0; right:0; bottom:0;[^}]*display:flex; flex-wrap:nowrap;/);
  assert.match(finalMobile, /\.tool-panel \.tool-tray-toggle \{[^}]*width:48px; min-width:48px; height:48px; min-height:48px;/);
  assert.match(finalMobile, /\.tool-panel:not\(\.tray-open\)>\.tool-section-label,\.tool-panel:not\(\.tray-open\) \.shape-options,\.tool-panel:not\(\.tray-open\) \.text-options,\.tool-panel:not\(\.tray-open\) \.width-row,\.tool-panel:not\(\.tray-open\) \.selected-color,\.tool-panel:not\(\.tray-open\) \.more-colors-button,\.tool-panel:not\(\.tray-open\) \.palette,/);
  assert.match(finalMobile, /\.tool-panel \.tool-group \{ flex:0 0 auto; display:flex; gap:6px; \}/);
  assert.match(finalMobile, /\.tool-tray-backdrop \{ display:block; position:fixed; inset:0; z-index:8;/);
  // 트레이가 펼쳐지면(.tray-open) 부가 컨트롤이 전부 나타난다.
  assert.match(finalMobile, /\.tool-panel\.tray-open \{[^}]*flex-direction:column;/);
  assert.match(finalMobile, /\.tool-panel\.tray-open>\.tool-section-label,\.tool-panel\.tray-open \.shape-options,\.tool-panel\.tray-open \.text-options,\.tool-panel\.tray-open \.width-row,\.tool-panel\.tray-open \.selected-color,\.tool-panel\.tray-open \.more-colors-button,\.tool-panel\.tray-open \.palette,\.tool-panel\.tray-open \.input-mode-control,\.tool-panel\.tray-open \.history-row,\.tool-panel\.tray-open \.pen-mode-note,\.tool-panel\.tray-open \.palette-shade \{ display:block; width:100%;/);
  assert.match(finalMobile, /\.tool-panel\.tray-open \.shape-kind-row \{[^}]*grid-template-columns:repeat\(5,minmax\(44px,1fr\)\)/);
  // 굵기 5단이 한 줄에 44px 이상으로 들어간다.
  assert.match(finalMobile, /\.tool-panel\.tray-open \.width-row \{[^}]*grid-template-columns:repeat\(5,minmax\(44px,1fr\)\)/);
  assert.match(finalMobile, /\.tool-panel\.tray-open \.palette \{[^}]*grid-template-columns:repeat\(6,minmax\(44px,1fr\)\)/);
  // 가로 모드 블록(폰 랜드스케이프)은 그대로 슬림 사이드 레일을 유지한다 — 지우개 아이콘 붕괴 방지 + 굵기 5버튼 flex 랩 배치.
  const landscapeStart = css.indexOf("@media (max-width:900px) and (max-height:500px) and (orientation:landscape)");
  const landscape = css.slice(landscapeStart, css.indexOf("@media", landscapeStart + 10));
  assert.match(landscape, /\.tool-panel \.edit-group \.eraser-icon \{ width:22px; min-width:22px; \}/);
  assert.match(landscape, /\.tool-panel \.width-row \{[^}]*display:flex; flex-wrap:wrap; justify-content:center;/);
  assert.doesNotMatch(landscape, /\.tool-panel \{[^}]*position:fixed/);
  assert.match(finalMobile, /\.tool-panel\.tray-open \.history-row \{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  // 도구 패널이 화면 아래 뜬 dock이 됐으니, 캔버스가 그 뒤에 가려지지 않게 여백을 뺀다.
  assert.match(finalMobile, /\.canvas-zone \{ container-type:size; padding-bottom:calc\(8px \+ var\(--tool-dock-height,66px\) \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(finalMobile, /@supports \(width:1cqh\) \{ \.canvas-zone \.canvas-wrap \{ width:min\(100cqw,100cqh\); height:auto; max-width:100%; max-height:100%; \} \}/);
  assert.match(finalMobile, /@supports not \(width:1cqh\) \{ \.canvas-zone \.canvas-wrap \{ width:auto; height:100%; max-width:100%; max-height:100%; \} \}/);
  // 예전 "도구 패널로 스크롤" 임시방편은 dock이 상시 보이므로 더는 필요 없다.
  assert.doesNotMatch(css, /mobile-tool-peek/);
  assert.doesNotMatch(studio, /mobile-tool-peek/);
  assert.match(studio, /const \[toolTrayOpen, setToolTrayOpen\] = useState\(false\);/);
  assert.match(studio, /className=\{`tool-panel\$\{toolTrayOpen \? " tray-open" : ""\}`\}/);
  assert.match(studio, /className="tool-tray-toggle"[\s\S]{0,200}aria-expanded=\{toolTrayOpen\}[\s\S]{0,300}onClick=\{\(\) => setToolTrayOpen\(\(value\) => !value\)\}/);
  assert.match(studio, /\{toolTrayOpen && <div className="tool-tray-backdrop" onClick=\{\(\) => setToolTrayOpen\(false\)\}/);
  assert.ok(css.lastIndexOf(".step-panel .choice-chips { display:flex") > css.lastIndexOf(".step-panel .choice-chips,.step-panel .step-actions,.step-panel>.text-button { display:none"));
  // 숨김은 수업 패널에만 적용해야 한다. 범위를 넓히면 그리미 AI 가이드의 이전·다음 버튼까지 사라진다.
  assert.doesNotMatch(css, /,\.step-actions,[^{]*\{ display:none/);
  assert.match(css, /\.step-panel \.choice-chips \{ display:flex; grid-column:1\/-1;[^}]*overflow-x:auto;/);
  assert.match(css, /\.step-panel \.choice-chips button \{[^}]*min-height:50px;/);
  assert.match(css, /\.step-panel \.step-actions \{ display:grid; grid-column:1\/-1;[^}]*overflow:visible;/);
  assert.match(css, /\.step-panel:has\(\.lesson-finished-illustration\) \.reference-tile \{ display:block;[^}]*width:84px;/);
  assert.match(teacher, /className="modal-close" aria-label="학생 그림 미리보기 닫기" onClick=\{closePreview\}/);
  const ipadStart = css.indexOf("@media (min-width:721px) and (max-width:1024px) and (orientation:portrait)");
  const ipad = css.slice(ipadStart, css.indexOf("@media (max-width:720px)", ipadStart));
  // 아이패드 세로도 같은 dock+tray 계약을 쓴다 — 도구 패널이 상시 자리를 차지하지 않는다.
  assert.match(ipad, /\.studio-body,\.studio-body\.without-step-panel,\.studio-body:has\(\.step-panel \.observation-reference\) \{[^}]*grid-template-columns:1fr;[^}]*grid-template-rows:auto minmax\(380px,1fr\); /);
  assert.match(ipad, /\.tool-panel \{[^}]*position:fixed; left:0; right:0; bottom:0;[^}]*display:flex;/);
  assert.match(ipad, /\.tool-panel\.tray-open \.palette \{[^}]*grid-template-columns:repeat\(8,minmax\(44px,1fr\)\)/);
  assert.match(ipad, /\.canvas-zone \{ grid-row:2; min-height:380px; padding:10px; padding-bottom:calc\(10px \+ var\(--tool-dock-height,74px\)\);/);
});

test("desktop teacher controls use a compact two-row layout without changing smaller breakpoints", async () => {
  const css = await read("../app/globals.css");
  const desktop = css.match(/@media \(min-width:1001px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const tablet = css.match(/@media \(max-width:1000px\) \{([^}]*(?:\}[^@]*)?)/)?.[1] ?? "";
  const mobileStart = css.indexOf("@media (max-width:720px)");

  assert.match(desktop, /\.room-controls \{ grid-template-columns:390px minmax\(0,1fr\); grid-template-rows:min-content min-content; align-items:start; \}/);
  assert.match(desktop, /\.qr-panel \{ grid-row:1 \/ span 2; align-self:stretch; \}/);
  assert.match(desktop, /\.control-stack,\.message-compose \{ grid-column:2; align-self:start; \}/);
  assert.match(css, /\.room-controls \{ padding:20px 24px; display:grid; grid-template-columns:390px 1fr 1\.3fr; align-items:start;/);
  assert.match(css, /\.room-controls>div,\.message-compose \{ min-width:0;/);
  assert.match(tablet, /\.room-controls \{ grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\); \}/);
  assert.match(tablet, /\.qr-code-teacher \{ width:clamp\(160px,18vw,190px\); min-width:160px; \}/);
  assert.ok(mobileStart >= 0);
  assert.match(css.slice(mobileStart), /\.room-controls \{ grid-template-columns:1fr; padding:14px; \}/);
  assert.match(css, /\.control-stack select,\.message-compose select \{ min-height:44px;/);
  assert.match(css, /input,textarea,select \{ font-size:16px; \}/);
  assert.match(css, /button \{ min-height:44px; touch-action:manipulation; \}/);
});
