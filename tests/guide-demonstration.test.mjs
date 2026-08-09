import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { lockGuideTrace, snapGuideTrace } from "../lib/trace-guidance.mjs";

const studio = await readFile(new URL("../app/components/DrawingStudio.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const lessons = await readFile(new URL("../lib/lesson-content.ts", import.meta.url), "utf8");

test("children choose help before the pencil demonstration and dotted practice", () => {
  assert.match(studio, /type GuidePhase = "independent" \| "demo" \| "practice"/);
  assert.match(studio, /guideChoiceStorageKey\(currentArtwork\.id, currentArtwork\.currentStep\)/);
  assert.match(studio, /choice !== "help" && choice !== "solo"/);
  assert.match(studio, /chooseGuideHelp[\s\S]*startGuideDemo\(\)/);
  assert.match(studio, /requestAnimationFrame\(animate\)/);
  assert.match(studio, /drawPencil\(context, pencil\.point, pencil\.previous\)/);
  assert.match(studio, /"연필이 먼저 보여줄게!"/);
  assert.match(studio, /"이제 네 차례야\. 초록 ① 가까운 점선에서 시작해 봐\."/);
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

test("the start badge stays beside the trace instead of covering the child's line", () => {
  const marker = studio.match(/function drawStartMarker[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(marker, /markerDistance = 34/);
  assert.match(marker, /context\.arc\(marker\.x, marker\.y, markerRadius/);
  assert.doesNotMatch(marker, /context\.arc\(start\.x, start\.y/);
  assert.match(marker, /context\.fillText\("1", marker\.x/);
  assert.match(studio, /if \(traceIndex === 0\) drawStartMarker\(context, trace\)/);
});

test("practice pencil locks to one dotted trace and fills skipped curve samples", () => {
  const traces = [
    [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 100 }, { x: 400, y: 100 }],
    [{ x: 100, y: 150 }, { x: 200, y: 150 }, { x: 300, y: 150 }],
  ];
  const start = lockGuideTrace(traces, { x: 0.1, y: 0.102, pressure: 0.7 });
  assert.ok(start);
  assert.equal(start.lock.traceIndex, 0);
  const moved = snapGuideTrace(traces, start.lock, { x: 0.39, y: 0.147, pressure: 0.7 });
  assert.ok(moved);
  assert.equal(moved.lock.traceIndex, 0, "nearby details must not steal an active stroke");
  assert.deepEqual(moved.points.map((point) => Math.round(point.x * 1024)), [200, 300, 400]);
  assert.equal(lockGuideTrace(traces, { x: 0.9, y: 0.9 }), null, "drawing away from dots stays the child's free stroke");
});

test("guide status no longer covers the paper and cat choices change the actual drawing setup", () => {
  assert.match(studio, /className="canvas-status-rail"[\s\S]*className="canvas-wrap"/);
  assert.match(css, /\.canvas-status-rail \.guide-notice \{ position:static;/);
  assert.match(studio, /lockGuideTrace\(currentGuideTraces, first\)/);
  assert.match(studio, /snapGuideTrace\(currentGuideTraces, guideLock, rawNext\)/);
  assert.match(studio, /Safari와 일부 태블릿 브라우저는 빠른 획에서 pointermove를 거의 보내지 않는다/);
  assert.match(studio, /snapGuideTrace\(currentGuideTraces, guideLock, releasePoint\)/);
  assert.match(studio, /"회색 고양이": \{ color: "#9AA7B1"[\s\S]*회색 크레용을 골랐어요/);
  assert.match(studio, /setup\.shade === "light"[\s\S]*setColorsExpanded\(true\)[\s\S]*setColor\(setup\.color\)/);
  assert.match(studio, /className="choice-feedback"/);
  assert.match(lessons, /머리 위에 귀 삼각형을 포개던 이전 가이드는 그대로 따라도 선이 겹쳤다/);
  assert.doesNotMatch(lessons.match(/slug: "curious-cat"[\s\S]*?\n  \},\n  \{/u)?.[0] ?? "", /line\(2, \[\.37, \.16\]/);
  assert.match(lessons, /가슴부터 몸과 두 앞다리를 천천히 이어요/);
  assert.match(lessons, /둥근 뒷발과 위로 살랑이는 꼬리를 더해요/);
});
