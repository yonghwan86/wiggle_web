import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const compactSource = (text) => text.replace(/\s+/g, " ");

const [studio, css, renderer, messageCenter, drawingHistory, inputMode] = await Promise.all([
  readFile(new URL("../app/components/DrawingStudio.tsx", import.meta.url), "utf8").then(compactSource),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../lib/draw-renderer.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/components/StudentMessageCenter.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/drawing-history.ts", import.meta.url), "utf8").then(compactSource),
  readFile(new URL("../lib/input-mode.ts", import.meta.url), "utf8").then(compactSource),
]);

test("draw width and eraser width are remembered separately", () => {
  // 지우개를 한 번 썼다고 아이가 고른 그리기 굵기가 리셋되면 안 된다.
  assert.match(studio, /const \[drawWidth, setDrawWidth\] = useState<StrokeWidth>\(16\)/);
  assert.match(studio, /const \[eraserWidth, setEraserWidth\] = useState<StrokeWidth>\(48\)/);
  assert.match(studio, /const width = studioTool === "eraser" \? eraserWidth : drawWidth/);
  assert.match(studio, /if \(studioTool === "eraser"\) setEraserWidth\(value\);\s*else \{ drawWidthRef\.current = value; setDrawWidth\(value\); \}/);
});

test("coloring starts broad without locking the child's width choice", () => {
  assert.match(studio, /currentLessonActivity === "color"[\s\S]*setStudioTool\("crayon"\)[\s\S]*setDrawWidth\(48\)/);
  assert.match(studio, /else \{ drawWidthRef\.current = value; setDrawWidth\(value\); \}/);
  assert.match(studio, /\}, \[currentLessonActivity\]\);/);
  assert.match(studio, /lastBrushRef\.current = colorReturnBrushRef\.current;\s*setStudioTool\(colorReturnBrushRef\.current\)/);
});

test("every studio tool is reachable from the panel", () => {
  for (const tool of ["pencil", "crayon", "marker", "watercolor", "fill", "shape", "eraser"]) {
    assert.match(studio, new RegExp(`onClick=\\{\\(\\) => chooseStudioTool\\("${tool}"\\)\\}`));
  }
  assert.match(studio, /aria-pressed=\{mirror\}/);
  assert.match(studio, /SHAPE_KINDS\.slice/);
});

test("new pencil strokes get pressure widths while legacy pen strokes render unchanged", () => {
  // 기존 작품(pen)에는 실필압이 이미 기록돼 있다. pen에 배율을 적용하면 저장 이미지와 어긋난다.
  assert.match(renderer, /op\.tool === "pencil" && points\.length > 1/);
  assert.doesNotMatch(renderer, /op\.tool === "pen" && points\.length > 1/);
  assert.match(studio, /type BrushTool = "pencil" \| "crayon" \| "marker" \| "watercolor"/);
});

test("all tools have recognizable visual icons and child-readable size labels", () => {
  assert.match(studio, /aria-label="연필" title="연필"[\s\S]*?<span className="tool-icon" aria-hidden="true">\s*✏️\s*<\/span>\s*<span className="tool-name" aria-hidden="true">\s*연필\s*<\/span>/);
  assert.match(studio, /aria-label="크레용" title="크레용"[\s\S]*?<span className="tool-icon" aria-hidden="true">\s*🖍️\s*<\/span>\s*<span className="tool-name" aria-hidden="true">\s*크레용\s*<\/span>/);
  assert.match(studio, /aria-label="마커" title="마커"[\s\S]*?<span className="tool-icon" aria-hidden="true">\s*🖊️\s*<\/span>\s*<span className="tool-name" aria-hidden="true">\s*마커\s*<\/span>/);
  assert.match(studio, /aria-label="수채붓" title="수채붓"[\s\S]*?<span className="tool-icon" aria-hidden="true">\s*🖌️\s*<\/span>\s*<span className="tool-name" aria-hidden="true">\s*수채붓\s*<\/span>/);
  assert.match(studio, /aria-label="지우개" title="지우개"/);
  assert.match(studio, /aria-label="좌우 대칭" title="좌우 대칭"/);
  assert.match(studio, /className="tool-icon eraser-icon"/);
  assert.match(studio, /STROKE_WIDTH_LABELS\[value\]/);
  assert.match(studio, /3: "아주 얇게", 8: "얇게", 16: "보통", 30: "굵게", 48: "아주 굵게"/);
  assert.match(css, /\.tool-group \.eraser-icon \{[^}]*grid-template-columns:1fr 1fr/);
  assert.match(css, /\.tool-group button\[aria-pressed=true\]:after \{ content:"✓"/);
  assert.match(studio, /"#E53935": "빨간색"/);
  assert.match(studio, /"#F8A9A4": "밝은 빨간색"/);
  assert.match(studio, /aria-label=\{COLOR_NAMES\[value\]\}/);
});

test("palette offers named basic and expanded colors without shrinking buttons", () => {
  assert.match(studio, /const MORE_PALETTE =/);
  assert.match(studio, /colorsExpanded \? \[\.\.\.new Set\(\[\.\.\.PALETTE, \.\.\.MORE_PALETTE\]\)\] : PALETTE/);
  assert.match(studio, /className="selected-color"/);
  assert.match(studio, /aria-expanded=\{colorsExpanded\}/);
  assert.match(css, /\.palette button \{ min-width:44px; min-height:44px;/);
});

test("strokes render during pointer input instead of waiting for pointer up", () => {
  assert.match(studio, /function renderLiveStroke\(/);
  // 획 도중 다른 손이 도구를 바꿔도 그리던 획은 시작 시점(meta)의 도구·색·굵기를 유지한다.
  // 일반 그리기는 first, 점선 연습은 자석으로 맞춘 strokeStart를 즉시 미리보기 한다.
  assert.match(studio, /function pointerDown[\s\S]*let strokeStart = first;[\s\S]*renderLiveStroke\(event\.currentTarget, meta\.tool, meta\.color, meta\.width, \[strokeStart\]\)/);
  assert.match(studio, /function pointerMove[\s\S]*points\.push\(next\);[\s\S]*const livePoints = points\.slice\(-3\);[\s\S]*renderLiveStroke\(event\.currentTarget, meta\.tool, meta\.color, meta\.width, livePoints\)/);
  assert.ok(studio.indexOf("renderLiveStroke(event.currentTarget, meta.tool, meta.color, meta.width, livePoints)") < studio.indexOf("function pointerUp"));
  // 반투명 브러시(크레용·수채)는 스냅숏 복원 후 전체를 한 번에 그린다 — 세그먼트 알파 중첩 방지.
  assert.match(studio, /meta\.tool === "crayon" \|\| meta\.tool === "watercolor"/);
  assert.match(studio, /context\.putImageData\(strokeSnapshotRef\.current, 0, 0\)/);
});

test("mirror mode commits the pair together and undo removes it together", () => {
  assert.match(studio, /commitOps\(mirror \? \[op, mirrorOp\(op\)\] : \[op\]\)/);
  // 대칭이 켜지면 같은 획이 두 벌 저장되므로 스트로크 예산을 벌 수로 나눈다.
  assert.match(studio, /fitStrokePoints\(points, mirror \? 2 : 1\)/);
  assert.match(drawingHistory, /undoGroupSize\(history\.document\.ops\)/);
  assert.match(studio, /undoDrawing\(\{\s*document: documentStateRef\.current,\s*redo: redoRef\.current,\s*clearedOps: clearedOpsRef\.current,\s*clearRedoReady: clearRedoReadyRef\.current,\s*\}\)/);
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
  assert.match(studio, /Math\.hypot\(end\.x - start\.x, end\.y - start\.y\)\s*<\s*0\.012/);
  // 문서가 바뀌면(undo/redo) 대기 중인 시작점을 지운다.
  assert.match(studio, /function undo\(\)[\s\S]{0,900}clearShapeStart\(\)/);
  assert.match(studio, /function redoLast\(\)[\s\S]{0,700}clearShapeStart\(\)/);
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
  // 손가락 모드는 현재 작품에서만 명시적으로 켜고, 다음 학생·작품은 다시 펜으로 시작한다.
  assert.match(studio, /penModeRef\.current = true;\s*setInputMode\("pen"\)/);
  assert.match(studio, /onClick=\{disablePenMode\}/);
  assert.doesNotMatch(studio, /setItem\(INPUT_MODE_STORAGE_KEY, "finger"\)/);
  assert.match(inputMode, /if \(pointerType === "touch"\) return mode === "finger"/);
  assert.match(inputMode, /return "pen"/);
  assert.match(css, /\.canvas-stack \{ position:absolute; inset:0; transform-origin:0 0; \}/);
});

test("teacher message banner can be dismissed but every message remains in history", () => {
  assert.match(studio, /<StudentMessageCenter messages=\{teacherMessages\} floating/);
  assert.match(messageCenter, /className="canvas-message-close"/);
  assert.match(messageCenter, /action: "ackTeacherMessages"/);
  assert.match(messageCenter, /unread\.map\(\(message\) => message\.id\)/);
  assert.match(messageCenter, /aria-label="새 선생님 말씀 모두 닫기"/);
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

test("eraser footprint matches the square area removed from the document", () => {
  assert.match(studio, /className="eraser-footprint"/);
  assert.match(studio, /footprint\.style\.width = `\$\{eraserWidth \/ 10\.24\}%`/);
  assert.match(renderer, /function eraseWithSquareFootprint/);
  assert.match(renderer, /globalCompositeOperation = "destination-out"/);
  assert.match(renderer, /fillRect\(x \* size - half, y \* size - half, footprint, footprint\)/);
  assert.match(css, /\.eraser-footprint \{[^}]*border:2px solid #1b3a57/);
});

test("shape tool offers ten child-friendly shapes and outline or filled drawing", () => {
  for (const shape of ["line", "circle", "triangle", "rectangle", "rounded-rectangle", "star", "heart", "arrow", "curve", "cloud"]) assert.match(studio, new RegExp(`kind: "${shape}"`));
  assert.match(studio, /moreShapes \? "도형 접기" : "더 많은 도형"/);
  assert.match(studio, /className="shape-fill-row"/);
  assert.match(studio, /aria-pressed=\{!shapeFilled\}[\s\S]{0,180}테두리/);
  assert.match(studio, /aria-pressed=\{shapeFilled\}[\s\S]{0,260}색 채움/);
  assert.match(renderer, /op\.filled && op\.shape !== "line" && op\.shape !== "curve"/);
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
  assert.match(studio, /이제 네 차례야\. 아무 점선이나 골라서 시작해 봐\./);
  assert.match(studio, /점선만 보기/);
  assert.match(studio, /className=\{guidePhase !== "independent" && lessonGuideAvailable \? "guide-canvas" : "guide-canvas hidden"\}/);
});
