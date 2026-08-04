import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createLessonStepBaseline,
  lessonStepActionStatus,
  lessonStepNewOps,
  minimumLessonStepActions,
} from "../lib/lesson-step-progress.ts";

const op = (id, overrides = {}) => ({
  opId: `op_${id}`,
  clientOpId: `client_${id}`,
  type: "stroke",
  at: "2026-08-04T00:00:00.000Z",
  tool: "pencil",
  color: "#1B3A57",
  width: 16,
  points: [{ x: 0.5, y: 0.5, pressure: 0.5 }],
  ...overrides,
});

test("a lesson step needs new drawing actions made after that step starts", () => {
  const before = [op("before")];
  const progress = { baseline: createLessonStepBaseline(before), completed: false, skipped: false };

  assert.deepEqual(lessonStepActionStatus(before, progress, 3, undefined), {
    ready: false,
    actionCount: 0,
    required: 1,
    remaining: 1,
  });
  assert.equal(lessonStepActionStatus([...before, op("new")], progress, 3, undefined).ready, true);
});

test("detailed steps ask for at most three actions and never score drawing quality", () => {
  assert.equal(minimumLessonStepActions(1, undefined), 1);
  assert.equal(minimumLessonStepActions(4, undefined), 2);
  assert.equal(minimumLessonStepActions(9, undefined), 3);
  assert.equal(minimumLessonStepActions(30, undefined), 3);
  assert.equal(minimumLessonStepActions(20, "color"), 1);
  assert.equal(minimumLessonStepActions(20, "free"), 1);
});

test("eraser-only work does not advance a step and undo removes readiness", () => {
  const before = [op("before")];
  const progress = { baseline: createLessonStepBaseline(before), completed: false, skipped: false };
  const erased = [...before, op("erase", { tool: "eraser", color: undefined })];
  assert.equal(lessonStepActionStatus(erased, progress, 1, undefined).ready, false);
  assert.deepEqual(lessonStepNewOps(before, progress.baseline), []);
});

test("a coloring step requires a color-making action", () => {
  const progress = { baseline: createLessonStepBaseline([]), completed: false, skipped: false };
  assert.equal(lessonStepActionStatus([op("dark-pencil")], progress, 0, "color").ready, false);
  assert.equal(lessonStepActionStatus([op("red-pencil", { color: "#E53935" })], progress, 0, "color").ready, true);
  assert.equal(lessonStepActionStatus([op("crayon", { tool: "crayon" })], progress, 0, "color").ready, true);
  assert.equal(lessonStepActionStatus([op("fill", { type: "fill", tool: undefined, color: "#FDD835" })], progress, 0, "color").ready, true);
});

test("the studio gates next and complete but keeps an explicit child-controlled skip", async () => {
  const [studio, css] = await Promise.all([
    readFile(new URL("../app/components/DrawingStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /if \(delta === 1 && !options\?\.skip && !currentLessonStepStatus\.ready\)/);
  assert.match(studio, /onClick=\{requestArtworkCompletion\}/);
  assert.match(studio, /advanceOrCompleteLessonStep\(false\)/);
  assert.match(studio, /내 생각을 하나 더 그릴까\?/);
  assert.match(studio, /✏️ 더 그릴래/);
  assert.equal(studio.match(/⭐ 지금 완성/g)?.length, 2);
  assert.doesNotMatch(studio, /한 번 그리고 완성|이번 단계 넘기기|마지막으로 네 생각을 하나 더 그려 볼까/);
  assert.match(css, /\.studio-body \{[^}]*grid-template-columns:240px minmax\(0,1fr\) 180px;/);
  assert.match(css, /\.lesson-step-prompt-actions button \{[^}]*white-space:nowrap;/);
  assert.match(css, /\.step-panel \.lesson-step-prompt\s*\{\s*grid-column:2\/4;\s*grid-row:3;/);
  assert.match(css, /\.lesson-step-prompt-actions\s*\{\s*grid-template-columns:1fr;/);
  assert.match(studio, /lessonStepPrompt === "unfinished-lesson"/);
  assert.doesNotMatch(studio, /창의력 점수|그림 점수|정답률/);
});
