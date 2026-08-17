import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("ships the Wiggle product home without starter metadata", async () => {
  const [page, layout, logo] = await Promise.all([read("../app/page.tsx"), read("../app/layout.tsx"), read("../app/components/Logo.tsx")]);
  assert.match(page, /<Logo \/>/); assert.match(logo, /Wiggle/); assert.match(page, /오늘은<\/span> <strong>어떤 생각을 그려볼까요\?/); assert.match(page, /수업 코드 입력/); assert.match(page, /교사 수업 열기/);
  assert.match(layout, /Wiggle — 함께 그리며 생각해요/); assert.match(layout, /lang="ko"/);
  assert.doesNotMatch(page + layout, /codex-preview|Your site is taking shape|react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});

test("ships public student and teacher entry surfaces", async () => {
  const [join, teacher, routes] = await Promise.all([read("../app/components/JoinClient.tsx"), read("../app/components/TeacherApp.tsx"), read("../app/components/DrawingStudio.tsx")]);
  assert.match(join, /수업 코드/); assert.match(join, /그림 비밀번호/); assert.match(join, /새로 시작하기/); assert.match(join, /내 그림 이어가기/); assert.doesNotMatch(join, /QrCode|공유 태블릿/);
  assert.match(teacher, /교사 수업 진행실/); assert.match(teacher, /전체|우리 반 모두/); assert.match(teacher, /studentId/);
  // 완성 버튼 문구는 고학년 전환에서 "다 그렸어요"→"완성"으로 중립화했다.
  assert.match(routes, /pointerDown/); assert.match(routes, /그냥 그릴래/); assert.match(routes, />\s*완성\s*</);
});
