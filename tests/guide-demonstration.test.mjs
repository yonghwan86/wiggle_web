import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const studio = await readFile(new URL("../app/components/DrawingStudio.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("stage-one guides demonstrate the path before dotted practice", () => {
  assert.match(studio, /type GuidePhase = "independent" \| "demo" \| "practice"/);
  assert.match(studio, /lesson\?\.stage === 1 && !aiGuide/);
  assert.match(studio, /requestAnimationFrame\(animate\)/);
  assert.match(studio, /drawPencil\(context, pencil\.point, pencil\.previous\)/);
  assert.match(studio, /"연필이 먼저 보여줄게!"/);
  assert.match(studio, /"이제 네 차례야\. 초록 점에서 시작해 봐\."/);
});

test("guide demonstrations are replayable, skippable and student scoped", () => {
  assert.match(studio, /wiggle:guide-demo:v1:\$\{profile\.studentId\}:\$\{guideSourceKey\}/);
  assert.match(studio, /"✏️ 다시 보기"/);
  assert.match(studio, />\s*점선만 보기\s*</);
  assert.match(studio, /"이제 혼자 해볼래"/);
  assert.match(studio, /if \(guidePhase === "demo"\) stopGuideDemoForPractice\(\)/);
  assert.match(studio, /stopGuideDemoForPractice[\s\S]*markCurrentGuideSeen\(\);\s*setGuidePhase\("practice"\)/);
  assert.match(studio, /prefers-reduced-motion: reduce/);
  assert.match(studio, /addEventListener\("change", stopForReducedMotion\)/);
  assert.match(studio, /removeEventListener\("change", stopForReducedMotion\)/);
});

test("detailed guided steps slow the pencil demo down for young children", () => {
  assert.match(studio, /Math\.min\(6800, 1600 \+ currentGuideTraces\.length \* 600\)/);
  assert.doesNotMatch(studio, /Math\.min\(3200,/);
});

test("the demonstration remains outside the child's artwork and timelapse", () => {
  assert.match(studio, /<canvas\s+ref=\{guideRef\}[\s\S]*<canvas\s+ref=\{canvasRef\}/);
  assert.match(css, /\.guide-canvas \{[^}]*pointer-events:none/);
  // 저장 이미지는 문서에서 직접 렌더한다(documentImage) — 가이드 레이어는 물론
  // 화면 캔버스의 미리보기 픽셀도 저장 이미지에 섞이지 않는다.
  assert.match(studio, /thumbnailDataUrl: documentImage\(/);
  assert.doesNotMatch(studio, /imageData\(guideRef\.current/);
  assert.doesNotMatch(studio, /thumbnailDataUrl: imageData\(/);
});

test("guide controls and notices remain touch friendly on mobile", () => {
  assert.match(css, /\.guide-actions \{[^}]*display:grid/);
  assert.match(css, /\.guide-notice \{[^}]*pointer-events:none/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*\.guide-actions \{[^}]*grid-template-columns:1fr 1fr/);
  assert.match(css, /\.guide-actions button \{[^}]*min-height:44px/);
  assert.match(css, /@media \(max-width:460px\) and \(orientation:portrait\)[\s\S]*min-height:min\(calc\(100vw - 16px\),320px\)/);
  assert.match(css, /@media \(max-width:900px\) and \(max-height:500px\) and \(orientation:landscape\)[\s\S]*grid-template-columns:180px minmax\(0,1fr\) 200px/);
  assert.ok(css.indexOf("@media (max-width:900px) and (max-height:500px) and (orientation:landscape)") > css.indexOf(".tool-panel { padding-right:max(7px,env(safe-area-inset-right))"), "landscape rules must win the mobile cascade");
  assert.match(css, /\.step-panel \{ display:block; order:initial; grid-column:1;/);
  assert.match(css, /\.grimi-panel \{ order:initial; grid-column:1;/);
  assert.match(css, /\.canvas-zone \{ order:initial; grid-column:2;/);
  assert.match(css, /\.tool-panel \{ display:flex; order:initial; grid-column:3;/);
});
