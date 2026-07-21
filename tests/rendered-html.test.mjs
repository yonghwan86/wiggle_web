import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("ships the Wiggle product home without starter metadata", async () => {
  const [page, layout] = await Promise.all([read("../app/page.tsx"), read("../app/layout.tsx")]);
  assert.match(page, /Wiggle/); assert.match(page, /생각을 키워요/); assert.match(page, /학생으로 입장/); assert.match(page, /교사 수업 열기/);
  assert.match(layout, /Wiggle — 함께 그리며 생각해요/); assert.match(layout, /lang="ko"/);
  assert.doesNotMatch(page + layout, /codex-preview|Your site is taking shape|react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});

test("ships public student and teacher entry surfaces", async () => {
  const [join, teacher, routes] = await Promise.all([read("../app/components/JoinClient.tsx"), read("../app/components/TeacherApp.tsx"), read("../app/components/DrawingStudio.tsx")]);
  assert.match(join, /수업 코드/); assert.match(join, /그림 비밀번호/); assert.match(join, /공유 태블릿/); assert.match(join, /QrCode/);
  assert.match(teacher, /교사 수업 진행실/); assert.match(teacher, /전체|우리 반 모두/); assert.match(teacher, /studentId/);
  assert.match(routes, /pointerDown/); assert.match(routes, /그냥 그릴래/); assert.match(routes, /다 그렸어요/);
});
