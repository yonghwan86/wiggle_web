import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const compactSource = (text) => text.replace(/\s+/g, " ");

const [studio, css, renderer, messageCenter, drawingHistory, inputMode, model] = await Promise.all([
  readFile(new URL("../app/components/DrawingStudio.tsx", import.meta.url), "utf8").then(compactSource),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../lib/draw-renderer.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/components/StudentMessageCenter.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/drawing-history.ts", import.meta.url), "utf8").then(compactSource),
  readFile(new URL("../lib/input-mode.ts", import.meta.url), "utf8").then(compactSource),
  readFile(new URL("../lib/drawing-model.ts", import.meta.url), "utf8"),
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
  // 2026-09-14 도구 막대(B안): 붓 4종·지우개는 DOCK_TOOLS 한 목록에서 그리고, 채우기·도형은 ⋯ 더보기 안에 있다.
  for (const tool of ["pencil", "crayon", "marker", "watercolor", "eraser"]) assert.match(studio, new RegExp(`\\{ id: "${tool}", label: "`));
  assert.match(studio, /DOCK_TOOLS\.map\(\(tool\) => \([\s\S]*?onClick=\{\(\) => chooseStudioTool\(tool\.id\)\}/);
  for (const tool of ["fill", "shape"]) assert.match(studio, new RegExp(`onClick=\\{\\(\\) => chooseStudioTool\\("${tool}"\\)\\}`));
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
  // 세워진 도구 그림(public/drawing-tools/dock/)과 붓 끝·띠 칠하기 틀. 뜻은 aria-label·title로 전한다.
  assert.match(studio, /\{ id: "pencil", label: "연필", tint: true \}/);
  assert.match(studio, /\{ id: "crayon", label: "크레용", tint: true \}/);
  assert.match(studio, /\{ id: "marker", label: "마커", tint: true \}/);
  assert.match(studio, /\{ id: "watercolor", label: "수채붓", tint: true \}/);
  assert.match(studio, /\{ id: "eraser", label: "지우개", tint: false \}/);
  assert.match(studio, /aria-label=\{tool\.label\} title=\{tool\.label\}/);
  assert.match(studio, /src=\{`\/drawing-tools\/dock\/\$\{tool\.id\}\.webp`\}/);
  assert.match(studio, /maskImage: `url\(\/drawing-tools\/dock\/\$\{tool\.id\}-tint\.webp\)`/);
  assert.match(studio, /aria-label="좌우 대칭" title="좌우 대칭"/);
  // 굵기는 5단 버튼이 아니라 1픽셀 단위로 끄는 슬라이더다.
  // 화면에서 고르는 값은 1~60픽셀이고, 저장은 도화지 단위다(넓은 도화지는 span배).
  assert.match(studio, /<input type="range" min=\{STROKE_WIDTH_MIN\} max=\{STROKE_WIDTH_SCREEN_MAX\} step=\{1\} value=\{width\} aria-label="선 굵기"/);
  assert.match(studio, /const documentWidthUnits = \(screenWidth: number\) => toDocumentUnits\(screenWidth, documentSpan\(documentStateRef\.current\)\);/);
  assert.match(studio, /aria-label="1픽셀 얇게"[\s\S]*aria-label="1픽셀 굵게"/);
  assert.doesNotMatch(studio, /STROKE_WIDTH_LABELS|STROKE_WIDTHS/);
  assert.match(css, /\.dock-tool-tint \{[^}]*var\(--dock-color/);
  assert.match(css, /\.dock-tool\[aria-pressed="true"\] \{ background:#184028; \}/);
  assert.match(studio, /"#E53935": "빨간색"/);
  assert.match(studio, /"#F8A9A4": "밝은 빨간색"/);
  assert.match(studio, /aria-label=\{COLOR_NAMES\[value\]\}/);
});

test("palette shows every basic color without scrolling and the rainbow button opens a detailed picker", async () => {
  assert.doesNotMatch(studio, /colorsExpanded|MORE_PALETTE/);
  assert.match(studio, /import \{ ColorPickerDialog \} from "\.\/ColorPickerDialog"/);
  // 막대에는 단색 점 + 자주 쓰는 8색 + 무지개. 단색 점은 12색 창(스크롤 없음)을, 무지개는 색 섞는 대화상자를 연다(2026-09-20).
  assert.match(studio, /const DOCK_QUICK_COLORS = 8;/);
  assert.match(studio, /className="dock-current-color"[^>]*aria-haspopup="true"[\s\S]*?setPaletteOpen\(\(value\) => !value\)/);
  assert.match(studio, /className="dock-more-colors"[^>]*aria-haspopup="dialog"[\s\S]*?setColorPickerOpen\(true\)/);
  assert.match(studio, /<div className="dock-palette" role="group" aria-label="단색 고르기">\s*\{PALETTE\.map/);
  // 단색 창에는 단색만 둔다 — 섞는 색으로 가는 단추를 그 안에 두면 두 단추가 같은 일을 한다.
  assert.doesNotMatch(studio, /dock-palette-wheel/);
  assert.doesNotMatch(css, /dock-palette-wheel/);
  assert.match(studio, /<ColorPickerDialog color=\{selectedColor\} names=\{COLOR_NAMES\}/);
  assert.match(css, /\.dock-color,\.dock-current-color,\.dock-more-colors \{[^}]*min-width:44px; min-height:44px;/);
  assert.match(css, /\.dock-palette \{[^}]*grid-template-columns:repeat\(4,48px\)/);
  const { hexToHsv, hsvToHex } = await import("../lib/color.ts");
  for (const hex of ["#1B3A57", "#E53935", "#FFFFFF", "#000000", "#43A047", "#F8BBD0"]) assert.equal(hsvToHex(...hexToHsv(hex)), hex);
  assert.deepEqual(hexToHsv("#FF0000"), [0, 1, 1]);
  assert.equal(hsvToHex(120, 1, 1), "#00FF00");
});

test("strokes render during pointer input instead of waiting for pointer up", () => {
  assert.match(studio, /function renderLiveStroke\(/);
  // 획 도중 다른 손이 도구를 바꿔도 그리던 획은 시작 시점(meta)의 도구·색·굵기를 유지한다.
  // 일반 그리기는 first, 점선 연습은 자석으로 맞춘 strokeStart를 즉시 미리보기 한다.
  assert.match(studio, /function pointerDown[\s\S]*let strokeStart = first;[\s\S]*renderLiveStroke\(startTarget, meta\.tool, meta\.color, meta\.width, \[strokeStart\]\)/);
  assert.match(studio, /function pointerMove[\s\S]*points\.push\(next\);[\s\S]*const livePoints = points\.slice\(-3\);[\s\S]*renderLiveStroke\(event\.currentTarget, meta\.tool, meta\.color, meta\.width, livePoints\)/);
  assert.ok(studio.indexOf("renderLiveStroke(event.currentTarget, meta.tool, meta.color, meta.width, livePoints)") < studio.indexOf("function pointerUp"));
  // 반투명 브러시(크레용·수채)는 얇은 층에 획 전체를 다시 그린다 — 세그먼트 알파 중첩 방지.
  // 2026-09-21: 예전에는 같은 일을 도화지 위에서 하느라 move마다 캔버스 전체 ImageData를 뜨고 되돌렸다.
  // 아이패드 미니에서 34MB·약 38ms였고 그만큼 선이 펜 뒤로 처졌다. 그 경로가 돌아오면 안 된다.
  assert.match(studio, /meta\.tool === "crayon" \|\| meta\.tool === "watercolor"/);
  assert.doesNotMatch(studio, /getImageData\(0, 0, event\.currentTarget\.width/);
  assert.doesNotMatch(studio, /strokeSnapshotRef/);
  assert.match(studio, /const live = liveStrokeRef\.current \? liveCanvasRef\.current : null;[\s\S]{0,260}renderLiveStroke\(live, meta\.tool, meta\.color, meta\.width, points\)/);
  // 지우개는 도화지 픽셀을 파내는 도구라 층에 올릴 수 없다 — 얇은 층은 반투명 브러시만 쓴다.
  assert.match(studio, /liveStrokeRef\.current = \(meta\.tool === "crayon" \|\| meta\.tool === "watercolor"\)/);

  // 애플 펜슬은 초당 240번 좌표를 보낸다. pointermove 하나에 묶여 온 표본을 모두 읽지 않으면
  // 점을 버려 선이 펜 뒤로 처진다(2026-09-21 사용자 보고). 예측 점은 사파리에 없어 쓰지 않는다.
  assert.match(studio, /getCoalescedEvents\(\)/);
  assert.match(studio, /function movePoints[\s\S]{0,400}samples\.map/);
  assert.doesNotMatch(studio, /getPredictedEvents\(\)/, "사파리에 없는 예측 점을 호출하면 안 된다(주석 언급은 괜찮다)");
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
  /* 굵기 배율은 2026-09-26부터 drawing-model의 TOOL_DRAWN_WIDTH_SCALE 한 곳에 있다 —
     점 간격 계산이 같은 값을 써야 "보이는 굵기"가 어긋나지 않아서다. 값 자체는 그대로다. */
  assert.match(renderer, /drawnStrokeWidth\(op\.tool, op\.width \?\? 8\) \* size \/ 1024/);
  assert.match(model, /TOOL_DRAWN_WIDTH_SCALE: Record<string, number> = \{ marker: 1\.6, watercolor: 2 \}/);
  assert.match(renderer, /op\.tool === "crayon" \? 0\.62 : op\.tool === "watercolor" \? 0\.3 : 1/);
  assert.match(renderer, /if \(op\.tool === "watercolor"\) \{[\s\S]{0,300}globalAlpha = 0\.12/);
});

test("도구 막대는 아이패드에서 선택·끌기 대상이 되지 않는다", () => {
  // 2026-09-23 실기기 제보: 도구 그림을 누르고 있으면 iOS가 선택·드래그 항목으로 잡아
  // 도구 줄이 파랗게 뜬 채 끌려다녔다. img의 draggable={false}로는 못 막는다.
  const guard = css.match(/\.canvas-wrap[^{]*\{[^}]*-webkit-user-drag:none;[^}]*\}/);
  assert.ok(guard, "도화지·막대 선택 금지 규칙을 찾지 못했다");
  assert.match(guard[0], /\.tool-dock,\.tool-dock \*/);
  assert.match(guard[0], /-webkit-touch-callout:none/);
  assert.match(guard[0], /user-select:none/);
  /* 2026-09-26: CSS만으로는 부족했다. 28d0d8f 자신도 "실기기 재확인이 필요하다"고 적었고
     아이패드에서 도구가 계속 끌린다는 제보가 이어졌다. 도화지는 처음부터 CSS와 onDragStart를
     **둘 다** 갖고 있었는데 막대에는 JS 방어가 없었다 — 같은 방어를 막대에도 건다.
     끌기 이벤트는 위로 올라오므로 막대 하나면 안의 도구 그림·색 단추가 모두 덮인다. */
  // `=>`의 > 때문에 게으른 매칭은 여는 태그 중간에서 잘린다 — 고정 길이 창으로 본다.
  const dock = studio.match(/<aside className=\{`tool-dock[\s\S]{0,400}/);
  assert.ok(dock, "도구 막대 엘리먼트를 찾지 못했다");
  assert.match(dock[0], /onDragStart=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(dock[0], /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/);
});

test("eraser footprint matches the square area removed from the document", () => {
  assert.match(studio, /className="eraser-footprint"/);
  // 네모의 %는 도화지(span장 너비) 기준이고 실제로 지워지는 칸은 저장 단위(굵기÷span)다.
  // 화면 굵기를 그대로 넣으면 새 도화지(span 3)에서 네모만 3배로 커진다(2026-09-23 사용자 제보).
  assert.match(studio, /footprint\.style\.width = `\$\{documentWidthUnits\(eraserWidth\) \/ 10\.24\}%`/);
  assert.match(studio, /footprint\.style\.height = "auto"/);
  assert.match(css, /\.eraser-footprint \{ aspect-ratio:1; \}/);
  assert.match(renderer, /function eraseWithSquareFootprint/);
  assert.match(renderer, /globalCompositeOperation = "destination-out"/);
  assert.match(renderer, /fillRect\(x \* size - half, y \* docH - half, footprint, footprint\)/);
  assert.match(css, /\.eraser-footprint \{[^}]*border:2px solid #264c2e/);
});

test("도화지 비율은 문서가 정하고, 화면·래스터·저장 이미지가 같은 비율을 쓴다", () => {
  // 화면 상자의 비율이 곧 그림의 비율이다 — 좌표가 x·y 모두 0~1로 정규화돼 있기 때문이다.
  assert.match(studio, /"--paper-aspect": `\$\{DOCUMENT_SIZE\} \/ \$\{documentHeight\(documentState\)\}`/);
  assert.match(css, /\.canvas-wrap \{[^}]*aspect-ratio:var\(--paper-aspect,1\);/);
  // 래스터도 문서 비율을 따른다. 정사각으로 고정하면 저장 PNG와 화면이 어긋난다.
  assert.match(studio, /function documentPixels\(document: Pick<DrawDocument, "height">, width: number\)/);
  assert.match(studio, /height: Math\.round\(width \* documentHeight\(document\) \/ DOCUMENT_SIZE\)/);
  /* 종전에는 화면 캔버스에서 굽는 imageData가 따로 있어 그 비율 계산을 여기서 지켰다.
     2026-09-26에 몽그리 전송 이미지까지 documentImage로 옮기면서 쓰는 곳이 없어져 지웠다(P-014).
     남은 저장 이미지 경로의 비율은 바로 위 documentPixels 검사가 지킨다. */
  assert.doesNotMatch(studio, /function imageData\(/, "화면 기반 이미지 굽기가 되살아나면 안 된다");
  // 점선 안내 좌표는 정사각 기준이라, 가운데 정사각 영역에 넣어 동그라미가 타원이 되지 않게 한다.
  assert.match(studio, /function guideSquare\(canvas: HTMLCanvasElement\)/);
  assert.match(studio, /context\.scale\(square\.side \/ 1024, square\.side \/ 1024\)/);
  // 도화지는 화면을 채우되, 비율은 문서가 정한다. width·height를 둘 다 100%로 주면
  // aspect-ratio가 무시돼 기존 정사각 작품이 늘어난다.
  assert.match(css, /width:min\(100cqw,calc\(100cqh \* var\(--paper-ratio,1\)\)\)/);
  assert.match(css, /\.canvas-zone \{ container-type:size; \}/);
  // 좁은 화면 규칙도 정사각을 가정하면 안 된다 — cq로 폭을 잡는 곳은 모두 비율을 곱한다.
  const cqWidths = css.match(/width:min\(100cqw,[^;]*/g) ?? [];
  assert.ok(cqWidths.length >= 3, `cq 기반 도화지 폭 규칙이 있어야 한다: ${cqWidths.length}`);
  for (const rule of cqWidths) assert.match(rule, /--paper-ratio/, `정사각을 가정한 규칙이 남아 있다: ${rule}`);
  // 새 작품은 화면 비율에 맞춘다. 이미 그린 그림은 화면이 세로로 길 때만 가운데 둔 채 늘리고(줄이지 않음),
  // 옆으로 넓은 화면에서는 종이가 틀을 덮고 넘친 만큼 옮겨 본다(2026-09-15 "도화지 크기는 화면을 꽉채우지 안 잖아").
  assert.match(studio, /if \(next < from \|\| activePoints\.current\.size \|\| artworkRef\.current\?\.status === "complete" \|\| conflictDraftRef\.current\) return;/);
  assert.match(studio, /growDrawOps\(current\.ops, from, next\)/);
  // 도화지는 100%에서 화면 span장 너비다(2026-09-20 큰 도화지). 1/span에서 전체가 틀에 맞고,
  // 거기서 한 칸 더 줄이면 종이 끝과 그 바깥이 보인다(2026-09-23 사용자 요청).
  assert.match(studio, /const screenPaper = coverPaper\(frame\.width, frame\.height, documentHeight\(documentState\)\);/);
  assert.match(studio, /const paper = \{ width: screenPaper\.width \* span, height: screenPaper\.height \* span \};/);
  assert.match(studio, /min: minScaleFor\(span\), max: MAX_SCALE/);
  // 축소 단추가 멈추는 자리도 같은 값이어야 한다 — 따로 적으면 둘이 어긋난다.
  assert.match(studio, /disabled=\{view\.scale <= minScaleFor\(span\) \+ 0\.001\}/);
  // 종이가 틀보다 작아지므로 바탕이 종이와 같은 흰색이면 종이 끝이 보이지 않는다.
  assert.match(css, /\.studio \{ --paper-backdrop:#e4e9e3; \}/);
  assert.match(studio, /clampDocumentHeight\(DOCUMENT_SIZE \* height \/ width\)/);
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
  assert.match(studio, /!lesson && !documentState\.ops\.length/);
  assert.match(studio, /✏️ 하얀 종이에 그어 봐!/);
  assert.match(css, /\.guide-notice,\.canvas-start-hint \{[^}]*pointer-events:none/);
  // tool-options-open: 도형·글씨 옵션이 열리면 태블릿 세로에서 패널이 커지고 캔버스가
  // 양보한다 — 빌드가 :has() 조합을 떨어뜨려 React가 클래스로 알린다 (2026-08-20).
  assert.match(studio, /className=\{`studio-body \$\{grimiOpen \|\| lesson \? "" : "without-step-panel"\}\$\{grimiOpen \? " grimi-open" : ""\}\$\{grimiOpen && grimiCollapsed \? " grimi-collapsed" : ""\}\$\{studioTool === "shape" \|\| studioTool === "text" \? " tool-options-open" : ""\}`\}/);
  // 도구는 격자 칸이 아니라 아래 도구 막대라 오른쪽 도구 칸이 없다(2026-09-14).
  assert.match(css, /\.studio-body\.without-step-panel \{ grid-template-columns:minmax\(0,1fr\); \}/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*\.studio-body\.without-step-panel \{ display:flex; \}/);
  assert.match(css, /@media \(max-width:900px\) and \(max-height:500px\) and \(orientation:landscape\)[\s\S]*\.studio-body\.without-step-panel \{ grid-template-columns:minmax\(0,1fr\); \}/);
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

test("기다리는 화면은 입장 확인과 같은 몽그리 화면을 쓴다", async () => {
  const { readFile } = await import("node:fs/promises");
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const [wait, join, page, css] = await Promise.all([
    read("../app/components/WaitMongri.tsx"),
    read("../app/components/JoinClient.tsx"),
    read("../app/student/draw/[id]/page.tsx"),
    read("../app/globals.css"),
  ]);
  // 2026-09-20 사용자 요청: 그리기 화면도 입장 화면처럼 몽그리가 뜨는 대기 화면을 쓴다.
  assert.match(wait, /wait-mongri\.png/);
  assert.match(wait, /check\.waitShell/);
  assert.match(join, /<WaitMongri line="수업실을 준비하고 있어요"/);
  assert.match(studio, /return <WaitMongri line=\{waiting \? "도화지를 펴고 있어요" : koreanMessage\} \/>;/);
  // 실패 문구가 영어로 나오면 아이가 읽지 못한다.
  assert.match(studio, /\/\[가-힣\]\/\.test\(saveState\) \? saveState : "연결이 잠깐 어려워요/);
  assert.match(page, /<Suspense fallback=\{<WaitMongri line="도화지를 펴고 있어요" \/>\}>/);
  // /student에서 도화지로 넘어가는 중간 화면도 같은 화면을 쓴다 — 예전에는 글자만 있는 화면이 먼저 스쳐 지나갔다.
  const entry = await read("../app/components/StudentEntry.tsx");
  assert.match(entry, /if \(!error\) return <WaitMongri line="도화지를 펴고 있어요" \/>;/);
  assert.doesNotMatch(entry, /도화지를 펴는 중/);
  // 글자만 있던 옛 대기 화면은 남아 있으면 안 된다 — 한쪽만 고쳐지는 원인이 된다.
  assert.doesNotMatch(studio, /drawing-loading/);
  assert.doesNotMatch(page, /drawing-loading/);
  assert.doesNotMatch(css, /\.drawing-loading/);
});

test("저장하는 동안 화면 전체를 덮어 아무것도 누르지 못하게 한다", () => {
  /* 2026-09-25 사용자 요청: 단추 안에서만 도는 표시는 아이 눈에 잘 안 띄어 그동안 다른 것을
     누르려 든다. 소감 모달(z-index 20)보다 위에 막을 깔아 뒤쪽 누르기를 전부 받아 삼킨다.
     실측(390×844): 막 390×844로 화면을 꽉 덮고, 모서리·닫기 자리를 눌러도 .saving-veil이 받는다. */
  assert.match(studio, /\{completionState === "saving" && \([\s\S]{0,80}<div className="saving-veil" role="status" aria-live="assertive">/);
  // 글을 못 읽어도 무엇을 기다리는지 알도록 몽그리 얼굴과 움직이는 점이 함께 있다.
  assert.match(studio, /brand\/mongri\/reassuring\.png/);
  assert.match(studio, /그림을 저장하고 있어요/);
  assert.match(studio, /className="saving-veil-dots"/);
  // 모달보다 위에 있어야 뒤쪽을 덮는다.
  assert.match(css, /\.saving-veil \{ position:fixed; inset:0; z-index:30;/);
  assert.match(css, /\.modal-backdrop \{ position:fixed; inset:0; z-index:20;/);
  // 움직임 줄이기에서는 튀지 않는다.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n  \.saving-veil \{ backdrop-filter:none; \}/);
  // 저장 중에는 닫기와 두 단추가 모두 잠긴다 — 막이 뚫려도 뒤에서 눌리지 않는다.
  assert.match(studio, /className="modal-close" disabled=\{completionState === "saving"\}/);
});
