import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [studio, css, renderer, messageCenter] = await Promise.all([
  readFile(new URL("../app/components/DrawingStudio.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../lib/draw-renderer.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/components/StudentMessageCenter.tsx", import.meta.url), "utf8"),
]);

test("draw width and eraser width are remembered separately", () => {
  // 지우개를 한 번 썼다고 아이가 고른 그리기 굵기가 리셋되면 안 된다.
  assert.match(studio, /const \[drawWidth, setDrawWidth\] = useState<StrokeWidth>\(16\)/);
  assert.match(studio, /const \[eraserWidth, setEraserWidth\] = useState<StrokeWidth>\(48\)/);
  assert.match(studio, /const width = studioTool === "eraser" \? eraserWidth : drawWidth/);
  assert.match(studio, /if \(studioTool === "eraser"\) setEraserWidth\(value\); else setDrawWidth\(value\)/);
});

test("every studio tool is reachable from the panel", () => {
  for (const tool of ["pencil", "crayon", "marker", "watercolor", "fill", "shape", "eraser"]) {
    assert.match(studio, new RegExp(`onClick=\\{\\(\\) => chooseStudioTool\\("${tool}"\\)\\}`));
  }
  assert.match(studio, /aria-pressed=\{mirror\}/);
  assert.match(studio, /SHAPE_KINDS\.map/);
});

test("new pencil strokes get pressure widths while legacy pen strokes render unchanged", () => {
  // 기존 작품(pen)에는 실필압이 이미 기록돼 있다. pen에 배율을 적용하면 저장 이미지와 어긋난다.
  assert.match(renderer, /op\.tool === "pencil" && op\.points\.length > 1/);
  assert.doesNotMatch(renderer, /op\.tool === "pen" && op\.points\.length > 1/);
  assert.match(studio, /type BrushTool = "pencil" \| "crayon" \| "marker" \| "watercolor"/);
});

test("all tools have recognizable visual icons and child-readable size labels", () => {
  assert.match(studio, /<span className="tool-icon" aria-hidden="true">✏️<\/span>연필/);
  assert.match(studio, /<span className="tool-icon" aria-hidden="true">🖍️<\/span>크레용/);
  assert.match(studio, /<span className="tool-icon" aria-hidden="true">🖊️<\/span>마커/);
  assert.match(studio, /<span className="tool-icon" aria-hidden="true">🖌️<\/span>수채붓/);
  assert.match(studio, /className="tool-icon eraser-icon"/);
  assert.match(studio, /STROKE_WIDTH_LABELS\[value\]/);
  assert.match(studio, /3: "아주 얇게", 8: "얇게", 16: "보통", 30: "굵게", 48: "아주 굵게"/);
  assert.match(css, /\.tool-group \.eraser-icon \{[^}]*grid-template-columns:1fr 1fr/);
  assert.match(css, /\.tool-group button\[aria-pressed=true\]:after \{ content:"✓"/);
  assert.match(studio, /"#E53935": "빨간색"/);
  assert.match(studio, /"#F8A9A4": "밝은 빨간색"/);
  assert.match(studio, /aria-label=\{COLOR_NAMES\[value\]\}/);
});

test("palette offers base and light shades without shrinking buttons", () => {
  assert.match(studio, /paletteShade === "base" \? PALETTE : LIGHT_PALETTE/);
  assert.match(studio, /aria-pressed=\{paletteShade === "base"\}/);
  assert.match(css, /\.palette-shade button \{ min-height:44px/);
});

test("strokes render during pointer input instead of waiting for pointer up", () => {
  assert.match(studio, /function renderLiveStroke\(/);
  // 획 도중 다른 손이 도구를 바꿔도 그리던 획은 시작 시점(meta)의 도구·색·굵기를 유지한다.
  assert.match(studio, /function pointerDown[\s\S]*renderLiveStroke\(event\.currentTarget, meta\.tool, meta\.color, meta\.width, \[first\]\)/);
  assert.match(studio, /function pointerMove[\s\S]*points\.push\(next\);[\s\S]*renderLiveStroke\(event\.currentTarget, meta\.tool, meta\.color, meta\.width, \[last, next\]\)/);
  assert.ok(studio.indexOf("renderLiveStroke(event.currentTarget, meta.tool, meta.color, meta.width, [last, next])") < studio.indexOf("function pointerUp"));
  // 반투명 브러시(크레용·수채)는 스냅숏 복원 후 전체를 한 번에 그린다 — 세그먼트 알파 중첩 방지.
  assert.match(studio, /meta\.tool === "crayon" \|\| meta\.tool === "watercolor"/);
  assert.match(studio, /context\.putImageData\(strokeSnapshotRef\.current, 0, 0\)/);
});

test("mirror mode commits the pair together and undo removes it together", () => {
  assert.match(studio, /commitOps\(mirror \? \[op, mirrorOp\(op\)\] : \[op\]\)/);
  // 대칭이 켜지면 같은 획이 두 벌 저장되므로 스트로크 예산을 벌 수로 나눈다.
  assert.match(studio, /fitStrokePoints\(points, mirror \? 2 : 1\)/);
  assert.match(studio, /undoGroupSize\(documentStateRef\.current\.ops\)/);
  assert.match(studio, /const \[redo, setRedo\] = useState<DrawOp\[\]\[\]>\(\[\]\)/);
  // 채우기도 대칭 쌍으로 커밋된다 — commitFill 본문이 mirror를 분기해야 한다.
  assert.match(studio, /function commitFill[\s\S]{0,400}commitOps\(mirror \? \[op, mirrorOp\(op\)\] : \[op\]\)/);
});

test("shape tool supports drag and the two-tap fallback without touching canvas pixels", () => {
  assert.match(studio, /shapeStartRef\.current = drag\.origin; setShapeStartPoint\(drag\.origin\)/);
  assert.match(studio, /🟢 끝나는 곳을 콕 눌러 줘!/);
  // 시작점 표식은 캔버스 픽셀이 아니라 DOM 점이다 — 픽셀에 그리면 썸네일·완성 PNG에 섞인다.
  assert.match(studio, /className="shape-start-dot"/);
  assert.doesNotMatch(studio, /drawShapeStartDot/);
  // 점 하나 크기의 실수 탭은 도형으로 커밋하지 않는다.
  assert.match(studio, /Math\.hypot\(end\.x - start\.x, end\.y - start\.y\) < 0\.012/);
  // 문서가 바뀌면(undo/redo) 대기 중인 시작점을 지운다.
  assert.match(studio, /function undo\(\)[\s\S]{0,300}clearShapeStart\(\)/);
  assert.match(studio, /function redoLast\(\)[\s\S]{0,200}clearShapeStart\(\)/);
});

test("saved images render from the document, never from live canvas pixels", () => {
  assert.match(studio, /function documentImage\(/);
  assert.match(studio, /thumbnailDataUrl: documentImage\(/);
  assert.doesNotMatch(studio, /thumbnailDataUrl: imageData\(/);
});

test("pen mode keeps touch from drawing, is reversible, and two fingers zoom", () => {
  assert.match(studio, /if \(event\.pointerType === "pen"\) enablePenMode\(\)/);
  assert.match(studio, /if \(penModeRef\.current\) \{ startGestureTouch\(event\); return; \}/);
  // 펜 없는 기기: 두 번째 손가락이 오면 기존 손가락을 제스처로 승격해야 핀치가 실제로 시작된다.
  assert.match(studio, /promoteEngagedToGesture\(event\.currentTarget\); startGestureTouch\(event\); return;/);
  assert.match(studio, /gestureTouches\.current\.set\(pointerId, last\)/);
  assert.match(studio, /pinchView\(viewRef\.current/);
  // 공유 기기에서 펜을 잃어도 복구할 수 있게 펜 모드는 토글로 해제된다.
  assert.match(studio, /localStorage\.removeItem\("wiggle:pen-mode"\)/);
  assert.match(studio, /onClick=\{disablePenMode\}/);
  assert.match(css, /\.canvas-stack \{ position:absolute; inset:0; transform-origin:0 0; \}/);
});

test("teacher message banner can be dismissed but every message remains in history", () => {
  assert.match(studio, /<StudentMessageCenter messages=\{teacherMessages\} floating/);
  assert.match(messageCenter, /className="canvas-message-close"/);
  assert.match(messageCenter, /action: "ackTeacherMessage"/);
  assert.match(messageCenter, /닫아도 여기에서 다시 볼 수 있어요/);
  assert.match(messageCenter, /\[\.\.\.messages\]\.reverse\(\)\.map/);
  assert.doesNotMatch(messageCenter, /sessionStorage/);
  assert.match(css, /\.canvas-message-close \{ width:44px; min-width:44px; height:44px;/);
});

test("marker and watercolor render distinctly from pencil", () => {
  // 마커는 가장 넓고 불투명, 수채붓은 옅고 넓게 + 번짐 패스. (기존 크레용·pen 값은 불변)
  assert.match(renderer, /op\.tool === "marker" \? 1\.6 : op\.tool === "watercolor" \? 2 : 1/);
  assert.match(renderer, /op\.tool === "crayon" \? 0\.62 : op\.tool === "watercolor" \? 0\.3 : 1/);
  assert.match(renderer, /if \(op\.tool === "watercolor"\) \{[\s\S]{0,300}globalAlpha = 0\.12/);
});

test("pointer cancel discards shapes and pending fills instead of committing them", () => {
  assert.match(studio, /onPointerCancel=\{pointerCancel\}/);
  assert.match(studio, /function pointerCancel[\s\S]*shapeDragRef\.current\?\.pointerId === event\.pointerId/);
  // 취소 이벤트의 좌표로 도형을 커밋하면 (0,0) 꼭짓점 도형이 생긴다.
  assert.doesNotMatch(studio, /function pointerCancel[\s\S]{0,900}commitShape/);
});

test("an empty free canvas tells a first-time child what to do", () => {
  assert.match(studio, /!lesson && !aiGuide && !documentState\.ops\.length/);
  assert.match(studio, /✏️ 하얀 종이에 그어 봐!/);
  assert.match(css, /\.guide-notice,\.canvas-start-hint \{[^}]*pointer-events:none/);
  assert.match(studio, /className=\{`studio-body \$\{grimiOpen \|\| lesson \? "" : "without-step-panel"\}\$\{grimiOpen \? " grimi-open" : ""\}\$\{grimiOpen && grimiCollapsed \? " grimi-collapsed" : ""\}`\}/);
  assert.match(css, /\.studio-body\.without-step-panel \{ grid-template-columns:minmax\(0,1fr\) 180px; \}/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*\.studio-body\.without-step-panel \{ display:flex; \}/);
  assert.match(css, /@media \(max-width:900px\) and \(max-height:500px\) and \(orientation:landscape\)[\s\S]*\.studio-body\.without-step-panel \{ grid-template-columns:minmax\(0,1fr\) 200px; \}/);
});

test("lesson choices visibly select, persist and can be chosen again after navigation", () => {
  assert.match(studio, /function chooseChildChoice\(choice: string\)/);
  assert.match(studio, /localStorage\.setItem\(`wiggle:lesson-choice:v1:\$\{artwork\.id\}:\$\{artwork\.currentStep\}`/);
  assert.match(studio, /localStorage\.getItem\(key\)/);
  assert.match(studio, /aria-pressed=\{childChoice === choice\}/);
  assert.match(css, /\.choice-chips button\[aria-pressed=true\],\.grimi-chips button\[aria-pressed=true\]/);
});

test("lesson guides use a pencil demo before dotted practice without leaving the canvas", () => {
  assert.match(studio, /type GuidePhase = "independent" \| "demo" \| "practice"/);
  assert.match(studio, /function drawPencil\(/);
  assert.match(studio, /✏️ 먼저 보여줘/);
  assert.match(studio, /이제 네 차례야\. 초록 점에서 시작해 봐\./);
  assert.match(studio, /점선만 보기/);
  assert.match(studio, /className=\{guidePhase !== "independent" && lessonGuideAvailable \? "guide-canvas" : "guide-canvas hidden"\}/);
});
