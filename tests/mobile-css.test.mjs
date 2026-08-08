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
  const mobileStart = css.lastIndexOf("@media (max-width:720px)");
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
  assert.match(studio, /className="history-row" role="group" aria-label="그리기 기록"[\s\S]*↶ 되돌리기[\s\S]*↷ 다시하기/);
  assert.match(finalMobile, /\.tool-panel \{[^}]*display:grid;[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);[^}]*overflow:hidden;/);
  assert.match(finalMobile, /\.tool-panel \.tool-group \{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(finalMobile, /\.tool-panel \.brush-group \{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  // shape-options가 make/edit 사이에 끼어들 때 sparse 구멍이 생기지 않게 dense 백필을 쓴다.
  assert.match(finalMobile, /\.tool-panel \{[^}]*grid-auto-flow:row dense;/);
  assert.match(finalMobile, /\.tool-panel \.shape-options \{[^}]*grid-column:1\/-1/);
  assert.match(finalMobile, /\.tool-panel \.shape-kind-row \{[^}]*grid-template-columns:repeat\(5,minmax\(44px,1fr\)\)/);
  // 굵기 5단이 한 줄에 44px 이상으로 들어간다.
  assert.match(finalMobile, /\.tool-panel \.width-row \{[^}]*grid-template-columns:repeat\(5,minmax\(44px,1fr\)\)/);
  assert.match(finalMobile, /\.tool-panel \.palette \{[^}]*grid-template-columns:repeat\(6,minmax\(44px,1fr\)\)/);
  // 가로 모드 블록: 지우개 아이콘 붕괴 방지 + 굵기 5버튼 flex 랩 배치.
  const landscapeStart = css.indexOf("@media (max-width:900px) and (max-height:500px) and (orientation:landscape)");
  const landscape = css.slice(landscapeStart, css.indexOf("@media", landscapeStart + 10));
  assert.match(landscape, /\.tool-panel \.edit-group \.eraser-icon \{ width:22px; min-width:22px; \}/);
  assert.match(landscape, /\.tool-panel \.width-row \{[^}]*display:flex; flex-wrap:wrap; justify-content:center;/);
  assert.match(finalMobile, /\.tool-panel \.history-row \{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(finalMobile, /\.tool-panel \{[^}]*overflow-x:auto|\.tool-panel \{[^}]*display:flex/);
  assert.match(finalMobile, /\.canvas-zone \{ container-type:size; \}/);
  assert.match(finalMobile, /@supports \(width:1cqh\) \{ \.canvas-zone \.canvas-wrap \{ width:min\(100cqw,100cqh\); height:auto; max-width:100%; max-height:100%; \} \}/);
  assert.match(finalMobile, /@supports not \(width:1cqh\) \{ \.canvas-zone \.canvas-wrap \{ width:auto; height:100%; max-width:100%; max-height:100%; \} \}/);
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
  assert.match(ipad, /\.studio-body,\.studio-body\.without-step-panel,\.studio-body:has\(\.step-panel \.observation-reference\) \{[^}]*grid-template-columns:1fr;[^}]*grid-template-rows:auto minmax\(380px,1fr\) auto/);
  assert.match(ipad, /\.tool-panel \{[^}]*grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(ipad, /\.tool-panel \.palette \{[^}]*grid-template-columns:repeat\(12,minmax\(44px,1fr\)\)/);
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
