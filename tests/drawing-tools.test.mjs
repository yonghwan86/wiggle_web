import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [studio, css] = await Promise.all([
  readFile(new URL("../app/components/DrawingStudio.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("pencil and crayon start medium while the eraser starts at the largest width", () => {
  assert.match(studio, /const \[width, setWidth\] = useState<StrokeWidth>\(16\)/);
  assert.match(studio, /setWidth\(nextTool === "eraser" \? 30 : 16\)/);
  assert.match(studio, /onClick=\{\(\) => chooseTool\("pen"\)\}/);
  assert.match(studio, /onClick=\{\(\) => chooseTool\("crayon"\)\}/);
  assert.match(studio, /onClick=\{\(\) => chooseTool\("eraser"\)\}/);
});

test("all tools have recognizable visual icons and child-readable size labels", () => {
  assert.match(studio, /<span className="tool-icon" aria-hidden="true">✏️<\/span>연필/);
  assert.match(studio, /<span className="tool-icon" aria-hidden="true">🖍️<\/span>크레용/);
  assert.match(studio, /className="tool-icon eraser-icon"/);
  assert.match(studio, /value === 8 \? "얇게" : value === 16 \? "보통" : "굵게"/);
  assert.match(css, /\.tool-group \.eraser-icon \{[^}]*grid-template-columns:1fr 1fr/);
  assert.match(css, /\.tool-group button\[aria-pressed=true\]:after \{ content:"✓"/);
  assert.match(studio, /"#E53935": "빨간색"/);
  assert.match(studio, /aria-label=\{COLOR_NAMES\[value\]\}/);
});

test("strokes render during pointer input instead of waiting for pointer up", () => {
  assert.match(studio, /function renderLiveStroke\(/);
  assert.match(studio, /function pointerDown[\s\S]*renderLiveStroke\(event\.currentTarget, tool, color, width, \[first\]\)/);
  assert.match(studio, /function pointerMove[\s\S]*points\.push\(next\);[\s\S]*renderLiveStroke\(event\.currentTarget, tool, color, width, \[last, next\]\)/);
  assert.ok(studio.indexOf("renderLiveStroke(event.currentTarget, tool, color, width, [last, next])") < studio.indexOf("function pointerUp"));
});

test("an empty free canvas tells a first-time child what to do", () => {
  assert.match(studio, /!lesson && !aiGuide && !documentState\.ops\.length/);
  assert.match(studio, /✏️ 연필로 하얀 종이에 그어 봐!/);
  assert.match(css, /\.guide-notice,\.canvas-start-hint \{[^}]*pointer-events:none/);
  assert.match(studio, /className=\{`studio-body \$\{grimiOpen \|\| lesson \? "" : "without-step-panel"\}`\}/);
  assert.match(css, /\.studio-body\.without-step-panel \{ grid-template-columns:minmax\(0,1fr\) 180px; \}/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*\.studio-body\.without-step-panel \{ display:flex; \}/);
  assert.match(css, /@media \(max-width:900px\) and \(max-height:500px\) and \(orientation:landscape\)[\s\S]*\.studio-body\.without-step-panel \{ grid-template-columns:minmax\(0,1fr\) 200px; \}/);
});
