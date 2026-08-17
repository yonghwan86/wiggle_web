import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("class code and QR resolve the same private classroom entry status without exposing a roster", async () => {
  const [route, join] = await Promise.all([
    read("../app/api/student/route.ts"),
    read("../app/components/JoinClient.tsx"),
  ]);
  assert.match(route, /action === "entryStatus"/);
  assert.match(route, /classroomForEntry\(entry\)/);
  assert.match(route, /hasProfiles: Boolean\(existing\)/);
  assert.doesNotMatch(route.slice(route.indexOf('action === "entryStatus"'), route.indexOf('action === "join"')), /nickname|studentCount|\.all</);
  assert.match(join, /action: "entryStatus", entry/);
  assert.match(join, /data\.hasProfiles \? "choice" : "join"/);
  assert.match(join, />새로 시작하기</);
  assert.match(join, />내 그림 이어가기</);
  assert.doesNotMatch(join, /profile-grid|deviceProfiles|activeProfile/);
});

test("normal re-entry uses classroom-scoped animal, nickname and three pictures on every device", async () => {
  const [route, join] = await Promise.all([
    read("../app/api/student/route.ts"),
    read("../app/components/JoinClient.tsx"),
  ]);
  assert.match(join, /\{ action, entry, nickname, animal, picturePassword: pictures \}/);
  assert.match(route, /payload\.entry \?\? payload\.classCode/);
  assert.match(route, /s\.classroom_id = \? AND s\.nickname = \? COLLATE NOCASE AND s\.animal = \?/);
  assert.match(route, /PROFILE_CREDENTIALS_EXIST/);
  assert.doesNotMatch(join, /개인 QR|새 개인 QR|복구 카드 재발급|다른 기기에서 그렸다면 선생님/);
  const normalSubmit = join.slice(join.indexOf('const payload = action === "join"'), join.indexOf('const response = await fetch', join.indexOf('const payload = action === "join"')));
  assert.match(normalSubmit, /\{ action, entry, nickname, animal, picturePassword: pictures \}/);
});

test("wide/tablet entry stays one screen and only phones or short viewports use three guided steps", async () => {
  const [join, css] = await Promise.all([
    read("../app/components/JoinClient.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(join, /type MobileStep = 1 \| 2 \| 3/);
  assert.match(join, /mobile-entry-progress/);
  assert.match(css, /@media \(min-width:601px\) and \(min-height:601px\) and \(max-width:900px\)/);
  assert.match(css, /grid-template-columns:minmax\(245px,42%\) minmax\(0,1fr\)/);
  assert.match(css, /@media \(max-width:600px\), \(max-height:600px\)/);
  assert.match(css, /\.join-step \{ display:none; \}/);
  assert.match(css, /\.join-step\.active \{ display:block; \}/);
});

test("teacher cards expose only the approved read-only profile facts", async () => {
  const [teacher, route] = await Promise.all([
    read("../app/components/TeacherApp.tsx"),
    read("../app/api/teacher/route.ts"),
  ]);
  for (const field of ["createdAt", "lastActivityAt", "artworkCount", "drawingArtworkCount", "completedArtworkCount", "duplicateNickname"]) {
    assert.match(route, new RegExp(field));
    assert.match(teacher, new RegExp(field));
  }
  assert.match(teacher, /같은 별명 있음/);
  assert.doesNotMatch(teacher, /복구 카드 재발급/);
  assert.doesNotMatch(teacher, /name="(?:realName|studentName|attendanceNumber)"/);
});
