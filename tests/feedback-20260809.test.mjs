import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";

import { clearRedoAfterEdit, redoDrawing, undoDrawing } from "../lib/drawing-history.ts";
import { canvasPointerCanEdit, isQuickStationaryTap, savedInputMode } from "../lib/input-mode.ts";
import { mirrorOp } from "../lib/symmetry.ts";
import { settleUploadsBeforeCleanup } from "../lib/settled-uploads.ts";

const teacherHeaders = (email) => ({
  origin: "http://localhost",
  "content-type": "application/json",
  "oai-authenticated-user-email": email,
});

const studentHeaders = {
  origin: "http://localhost",
  "content-type": "application/json",
  "cf-connecting-ip": "203.0.113.209",
};

const stroke = (suffix) => ({
  opId: `op_${suffix}`.padEnd(12, "0"),
  clientOpId: `client_${suffix}`.padEnd(14, "0"),
  type: "stroke",
  at: "2026-08-09T00:00:00.000Z",
  tool: "pencil",
  color: "#1B3A57",
  width: 16,
  points: [{ x: 0.2, y: 0.3, pressure: 0.5 }, { x: 0.4, y: 0.5, pressure: 0.8 }],
});

const documentWith = (ops) => ({ schemaVersion: 1, rendererVersion: 1, size: 1024, ops });

test("rapid undo and redo stay atomic, preserve mirror pairs, and new edits clear redo", () => {
  const first = stroke("first");
  const second = stroke("second");
  const mirrored = mirrorOp(second);
  let history = { document: documentWith([first, second, mirrored]), redo: [] };

  history = undoDrawing(history);
  assert.deepEqual(history.document.ops.map((op) => op.opId), [first.opId]);
  assert.equal(history.redo.length, 1);
  assert.equal(history.redo[0].length, 2, "a mirrored edit must be one history action");

  history = undoDrawing(history);
  assert.equal(history.document.ops.length, 0);
  assert.equal(history.redo.length, 2);

  history = redoDrawing(history);
  history = redoDrawing(history);
  assert.deepEqual(history.document.ops.map((op) => op.opId), [first.opId, second.opId, mirrored.opId]);
  assert.equal(history.redo.length, 0);

  history = undoDrawing(history);
  history = clearRedoAfterEdit(history, [stroke("replacement")]);
  assert.equal(history.redo.length, 0, "drawing after undo must invalidate the old redo branch");
});

test("pen mode is the safe default and the exact pointer contract is explicit", () => {
  const emptyStorage = { getItem: () => null };
  const fingerStorage = { getItem: (key) => key === "wiggle:input-mode" ? "finger" : null };
  assert.equal(savedInputMode(emptyStorage), "pen");
  assert.equal(savedInputMode(fingerStorage), "pen", "a shared tablet must start each new artwork in pen mode");
  assert.equal(canvasPointerCanEdit("pen", "pen"), true);
  assert.equal(canvasPointerCanEdit("pen", "mouse"), true);
  assert.equal(canvasPointerCanEdit("pen", "touch"), false, "one touch must not draw in pen mode");
  assert.equal(canvasPointerCanEdit("finger", "touch"), true);
  assert.equal(isQuickStationaryTap({ elapsedMs: 250, distancePx: 4 }), true);
  assert.equal(isQuickStationaryTap({ elapsedMs: 450, distancePx: 4 }), false);
  assert.equal(isQuickStationaryTap({ elapsedMs: 250, distancePx: 18 }), false);
});

test("a failed parallel upload waits for its late sibling before cleanup", async () => {
  const events = [];
  let finishLateUpload = () => {};
  const lateUpload = new Promise((resolve) => {
    finishLateUpload = () => { events.push("late upload finished"); resolve(); };
  });
  const failedUpload = Promise.reject(new Error("thumbnail failed"));
  const operation = settleUploadsBeforeCleanup([lateUpload, failedUpload], async () => { events.push("cleanup"); });

  await Promise.resolve();
  assert.deepEqual(events, [], "cleanup must not run while a sibling upload is still pending");
  finishLateUpload();
  await assert.rejects(operation, /thumbnail failed/);
  assert.deepEqual(events, ["late upload finished", "cleanup"]);
});

test("teacher artwork history is ownership-scoped, newest-first, and paginated", async (context) => {
  const miniflare = new Miniflare({
    modules: true,
    modulesRoot: "./dist/server",
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    scriptPath: "./dist/server/index.js",
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: `feedback-20260809-${randomUUID()}` },
    r2Buckets: ["ARTWORKS"],
  });
  context.after(() => miniflare.dispose());

  const created = await miniflare.dispatchFetch("http://localhost/api/teacher", {
    method: "POST",
    headers: teacherHeaders("history-owner@example.com"),
    body: JSON.stringify({ action: "createClassroom", displayName: "작품 기록반" }),
  });
  assert.equal(created.status, 201);
  const classroom = (await created.json()).classroom;

  const joined = await miniflare.dispatchFetch("http://localhost/api/student", {
    method: "POST",
    headers: studentHeaders,
    body: JSON.stringify({
      action: "join",
      entry: classroom.classCode,
      nickname: "기록 화가",
      animal: "🐻",
      picturePassword: ["⭐", "⭐", "⭐"],
    }),
  });
  assert.equal(joined.status, 201);
  const joinedData = await joined.json();
  const student = joinedData.student;
  const DB = await miniflare.getD1Database("DB");
  for (let index = 0; index < 13; index += 1) {
    await DB.prepare(`INSERT INTO artworks(id, student_id, classroom_id, title, topic, learning_mode, status, updated_at) VALUES (?, ?, ?, ?, ?, 'guided', ?, datetime('2026-08-09 00:00:00', ?))`)
      .bind(`history_${String(index).padStart(2, "0")}`, student.id, classroom.id, `작품 ${index}`, "고양이", index === 0 ? "drawing" : "complete", `+${index} minutes`).run();
  }

  const pageOne = await miniflare.dispatchFetch(`http://localhost/api/teacher?classroomId=${classroom.id}&studentId=${student.id}&historyOffset=0`, {
    headers: teacherHeaders("history-owner@example.com"),
  });
  assert.equal(pageOne.status, 200);
  const first = await pageOne.json();
  assert.equal(first.artworks.length, 12);
  assert.equal(first.artworks[0].id, "history_12");
  assert.equal(first.hasMore, true);
  assert.equal(first.nextOffset, 12);

  const pageTwo = await miniflare.dispatchFetch(`http://localhost/api/teacher?classroomId=${classroom.id}&studentId=${student.id}&historyOffset=${first.nextOffset}`, {
    headers: teacherHeaders("history-owner@example.com"),
  });
  assert.equal(pageTwo.status, 200);
  const second = await pageTwo.json();
  assert.equal(second.artworks.length, 1);
  assert.equal(second.artworks[0].id, "history_00");
  assert.equal(second.hasMore, false);

  const forbidden = await miniflare.dispatchFetch(`http://localhost/api/teacher?classroomId=${classroom.id}&studentId=${student.id}`, {
    headers: teacherHeaders("different-teacher@example.com"),
  });
  assert.equal(forbidden.status, 403);

  for (let index = 13; index < 45; index += 1) {
    await DB.prepare(`INSERT INTO artworks(id, student_id, classroom_id, title, topic, learning_mode, status, updated_at) VALUES (?, ?, ?, ?, ?, 'guided', 'complete', datetime('2026-08-09 00:00:00', ?))`)
      .bind(`history_${String(index).padStart(2, "0")}`, student.id, classroom.id, `작품 ${index}`, "고양이", `+${index} minutes`).run();
  }
  const studentAuthHeaders = { ...studentHeaders, authorization: `Bearer ${joinedData.deviceToken}` };
  const archiveOne = await miniflare.dispatchFetch("http://localhost/api/student?artworkOffset=0", { headers: studentAuthHeaders });
  assert.equal(archiveOne.status, 200);
  const archiveFirst = await archiveOne.json();
  assert.equal(archiveFirst.artworks.length, 40);
  assert.equal(archiveFirst.artworkTotal, 45);
  assert.equal(archiveFirst.artworkHasMore, true);
  assert.equal(archiveFirst.artworkNextOffset, 40);
  assert.equal(archiveFirst.latestUnfinishedArtwork.id, "history_00");
  assert.equal(archiveFirst.artworks.some((item) => item.id === "history_00"), false, "the old draft must be outside page one for this regression");
  const archiveTwo = await miniflare.dispatchFetch("http://localhost/api/student?artworkOffset=40", { headers: studentAuthHeaders });
  const archiveSecond = await archiveTwo.json();
  assert.equal(archiveSecond.artworks.length, 5);
  assert.equal(archiveSecond.artworkHasMore, false);
});

test("the UI source keeps completion, archive, palette, help-choice and touch protections visible", async () => {
  const [studio, archive, detail, globalCss, tracker, artworkRoute, artworkImageRoute, teacher, teacherRoute, studentRoute, studentHome, uploads] = await Promise.all([
    readFile(new URL("../app/components/DrawingStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/Archive.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ArtworkDetail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/components/InputModeTracker.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/artworks/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/artworks/[id]/image/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/TeacherApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/teacher/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/student/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/StudentHome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/settled-uploads.ts", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /도움받을래/);
  assert.match(studio, /내가 먼저 그릴래/);
  assert.match(studio, /작품을 안전하게 저장 중/);
  assert.match(studio, /갈색/);
  assert.match(studio, /민트/);
  assert.match(studio, /색 더보기/);
  assert.match(studio, /펜 모드/);
  assert.match(studio, /손가락 모드/);
  assert.match(globalCss, /-webkit-touch-callout:\s*none/);
  assert.match(tracker, /pointerdown/);
  assert.match(archive, /\/student\/archive\//);
  assert.match(archive, /artworkOffset/);
  assert.match(archive, /이전 그림 더 보기/);
  assert.match(detail, /읽기 전용/);
  assert.match(detail, /새 그림으로 다시 그리기/);
  assert.match(detail, /image\?variant=final/);
  assert.match(detail, /\?summary=1/);
  assert.match(artworkRoute, /ARTWORK_COMPLETE/);
  assert.match(artworkRoute, /settleUploadsBeforeCleanup/);
  assert.match(uploads, /Promise\.allSettled/);
  assert.match(artworkImageRoute, /variant === "final"[\s\S]*finalImageKey[\s\S]*thumbnailKey/);
  assert.match(archive, /\/image`/);
  assert.doesNotMatch(archive, /variant=final/);
  assert.match(teacherRoute, /COALESCE\(a\.thumbnail_key, a\.final_image_key\)/);
  assert.doesNotMatch(teacherRoute, /Math\.min\(500/);
  assert.match(teacher, /studentHistoryRequestRef/);
  assert.match(teacher, /const known = new Set\(current\.map/);
  assert.match(teacher, /크게 보기/);
  assert.match(studentRoute, /artworkTotal/);
  assert.match(studentRoute, /currentActivityArtwork/);
  assert.match(studentRoute, /latestUnfinishedArtwork/);
  assert.match(studentHome, /const unfinished = data\?\.latestUnfinishedArtwork/);
  assert.match(studentHome, /data\.artworkTotal/);
  assert.doesNotMatch(studio, /lastTwoFingerTapRef|두 손가락 짧은 탭 두 번/);
  assert.match(studio, /lastSingleFingerTapRef[\s\S]*resetViewToFit/);
  assert.match(globalCss, /max-height:480px[\s\S]*orientation:landscape[\s\S]*guide-choice-card/);
  // 2026-08-17: dock+tray 실험은 되돌렸다 — 도구 패널은 다시 12열 grid로 캔버스 아래
  // 상시 자리를 차지하고, 세로가 짧은 좁은 폰에서만 "패널로 스크롤" 힌트가 뜬다.
  assert.match(globalCss, /\.tool-panel \.selected-color \{ grid-column:1\/4; margin:0; min-width:0; \}/);
  assert.match(globalCss, /\.mobile-tool-peek \{ display:none; \}/);
  assert.match(globalCss, /\.teacher-history-drawer\s*\{[^}]*position:static/);
  assert.match(teacher, /<TeacherHistoryDrawer[\s\S]*<\/section><\/div>}<\/main>/);
});
