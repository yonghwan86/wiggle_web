import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

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
  assert.match(css, /\.reflection-modal,\.teacher-preview,\.timelapse-modal,\.large-qr-dialog \{[^}]*max-height:calc\(100dvh - max\(16px,env\(safe-area-inset-top\)\) - max\(16px,env\(safe-area-inset-bottom\)\)\);/);
  assert.doesNotMatch(css.slice(css.lastIndexOf("@media (max-width:460px)")), /max-height:calc\(100dvh - 24px\)/);
  assert.match(css, /\.palette button \{ width:44px; min-width:44px; height:44px; \}/);
  assert.match(css, /\.width-row button \{ width:44px; min-width:44px; height:44px; \}/);
  assert.ok(css.lastIndexOf("bottom:max(8px,env(safe-area-inset-bottom))") > css.lastIndexOf(".student-footer { bottom:8px"));
});

test("mobile studio and teacher layouts finish in two rows without horizontal text overflow", async () => {
  const [css, studio, teacher] = await Promise.all([read("../app/globals.css"), read("../app/components/DrawingStudio.tsx"), read("../app/components/TeacherApp.tsx")]);
  const finalMobile = css.slice(css.lastIndexOf("@media (max-width:720px)"), css.lastIndexOf("@media (max-width:460px) and (orientation:portrait)"));
  assert.ok(css.lastIndexOf("grid-template-rows:calc(60px + env(safe-area-inset-top)) minmax(0,1fr)") > css.lastIndexOf("grid-template-rows:60px 1fr 92px"));
  assert.match(css, /\.canvas-message,\.save-conflict,\.teacher-viewing,\.voice-speaking \{[^}]*max-width:calc\(100vw - max\(12px,env\(safe-area-inset-left\)\) - max\(12px,env\(safe-area-inset-right\)\)\);[^}]*overflow-wrap:break-word;/);
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
  assert.match(studio, /<span className="tool-icon" aria-hidden="true">✏️<\/span>연필/);
  assert.doesNotMatch(studio, /✒️|>펜<|>펜<\/button>/);
  assert.match(studio, /className="tool-group" role="group" aria-label="그리기 도구"[\s\S]*aria-pressed=\{tool === "pen"\}[\s\S]*aria-pressed=\{tool === "crayon"\}[\s\S]*aria-pressed=\{tool === "eraser"\}/);
  assert.match(studio, /className="width-row" role="group" aria-label="선 굵기"/);
  assert.match(studio, /className="palette" role="group" aria-label="색 고르기"/);
  assert.match(studio, /className="history-row" role="group" aria-label="그리기 기록"[\s\S]*↶ 되돌리기[\s\S]*↷ 다시하기/);
  assert.match(finalMobile, /\.tool-panel \{[^}]*display:grid;[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);[^}]*overflow:hidden;/);
  assert.match(finalMobile, /\.tool-panel \.tool-group \{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(finalMobile, /\.tool-panel \.width-row \{[^}]*grid-template-columns:repeat\(3,minmax\(44px,1fr\)\)/);
  assert.match(finalMobile, /\.tool-panel \.palette \{[^}]*grid-template-columns:repeat\(6,minmax\(44px,1fr\)\)/);
  assert.match(finalMobile, /\.tool-panel \.history-row \{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(finalMobile, /\.tool-panel \{[^}]*overflow-x:auto|\.tool-panel \{[^}]*display:flex/);
  assert.match(finalMobile, /\.canvas-zone \{ container-type:size; \}/);
  assert.match(finalMobile, /@supports \(width:1cqh\) \{ \.canvas-zone \.canvas-wrap \{ width:min\(100cqw,100cqh\); height:auto; max-width:100%; max-height:100%; \} \}/);
  assert.match(finalMobile, /@supports not \(width:1cqh\) \{ \.canvas-zone \.canvas-wrap \{ width:auto; height:100%; max-width:100%; max-height:100%; \} \}/);
  assert.ok(css.lastIndexOf(".step-panel .choice-chips { display:flex") > css.lastIndexOf(".step-panel .choice-chips,.step-actions,.step-panel>.text-button { display:none"));
  assert.match(css, /\.step-panel \.choice-chips \{ display:flex; grid-column:1\/-1;[^}]*overflow-x:auto;/);
  assert.match(css, /\.step-panel \.choice-chips button \{[^}]*min-height:44px;/);
  assert.match(css, /\.step-panel \.step-actions \{ display:grid; grid-column:1\/-1;[^}]*overflow:visible;/);
  assert.match(teacher, /className="modal-close" aria-label="학생 그림 미리보기 닫기" onClick=\{\(\) => \{ setViewingStudent\(null\)/);
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
