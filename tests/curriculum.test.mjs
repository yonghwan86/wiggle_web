import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ACTIVITY_KEYS, DEFAULT_ACTIVITY_KEY, FREE_ACTIVITY_KEY, LESSONS, activityLabel, normalizeActivityKey } from "../lib/lesson-content.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("curriculum contains exactly ten ordered lessons in each recommended stage", () => {
  assert.equal(LESSONS.length, 30);
  assert.equal(new Set(LESSONS.map((lesson) => lesson.slug)).size, 30);
  assert.equal(new Set(LESSONS.map((lesson) => `${lesson.stage}:${lesson.order}`)).size, 30);
  for (const stage of [1, 2, 3]) {
    const lessons = LESSONS.filter((lesson) => lesson.stage === stage);
    assert.equal(lessons.length, 10);
    assert.deepEqual(lessons.map((lesson) => lesson.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.ok(lessons.every((lesson) => lesson.mode === ({ 1: "practice", 2: "guided", 3: "observe" })[stage]));
  }
  assert.ok(LESSONS.some((lesson) => lesson.slug === "friendly-dog"));
  assert.ok(LESSONS.some((lesson) => lesson.slug === "hanok-day"));
  assert.ok(LESSONS.some((lesson) => lesson.slug === "calm-capybara"));
});

test("every lesson has short bounded steps, child choices, a data guide and a free final step", () => {
  for (const lesson of LESSONS) {
    assert.ok(lesson.steps.length >= 6 && lesson.steps.length <= 15, lesson.slug);
    assert.ok(lesson.steps.every((step) => step.instruction.length > 0 && step.instruction.length <= 40), lesson.slug);
    assert.ok(lesson.steps.filter((step) => (step.choices?.length ?? 0) >= 2).length >= 2, lesson.slug);
    assert.equal(lesson.finalFree, true, lesson.slug);
    assert.match(lesson.steps.at(-1).instruction, /내 마음대로/, lesson.slug);
    assert.ok(lesson.guide.length >= 2, lesson.slug);
    assert.ok(lesson.guide.every((mark) => Number.isInteger(mark.step) && mark.step >= 1 && mark.step <= lesson.steps.length), lesson.slug);
  }
});

test("teacher activity keys cover thirty lessons and free creation while mapping legacy labels", () => {
  assert.equal(ACTIVITY_KEYS.size, 31);
  assert.equal(DEFAULT_ACTIVITY_KEY, `lesson:${LESSONS[0].slug}`);
  assert.equal(FREE_ACTIVITY_KEY, "free");
  assert.equal(normalizeActivityKey("자유롭게 그리기"), "free");
  assert.equal(normalizeActivityKey("친구 강아지 따라 그리기"), "lesson:friendly-dog");
  assert.equal(normalizeActivityKey("한옥 관찰해서 그리기"), "lesson:hanok-day");
  assert.equal(activityLabel("lesson:calm-capybara"), "느긋한 카피바라");
});

test("lesson slug and observe mode persist through schema, runtime upgrades and artwork APIs", async () => {
  const [schema, runtime, migration, collection, detail, student, studio] = await Promise.all([
    read("../db/schema.ts"), read("../db/runtime.ts"), read("../drizzle/0004_purple_swordsman.sql"),
    read("../app/api/artworks/route.ts"), read("../app/api/artworks/[id]/route.ts"), read("../app/api/student/route.ts"), read("../app/components/DrawingStudio.tsx"),
  ]);
  assert.match(schema, /enum: \["practice", "guided", "observe", "free"\]/);
  assert.match(schema, /lessonSlug: text\("lesson_slug"\)/);
  assert.equal(migration.trim(), "ALTER TABLE `artworks` ADD `lesson_slug` text;");
  assert.match(runtime, /ALTER TABLE artworks ADD COLUMN lesson_slug TEXT/);
  assert.match(collection, /\["practice", "guided", "observe", "free"\]/);
  assert.match(collection, /lessonBySlug\(lessonSlug\)/);
  assert.match(collection, /const title = lesson\?\.title \?\? \(cleanText\(payload\.title/);
  assert.match(collection, /const topic = lesson\?\.topic \?\? \(cleanText\(payload\.topic/);
  assert.match(collection, /INSERT INTO artworks\([^`]*lesson_slug/);
  assert.match(collection, /lesson_slug AS lessonSlug/);
  assert.match(detail, /lesson_slug AS lessonSlug/);
  assert.match(student, /lesson_slug AS lessonSlug/);
  assert.match(studio, /params\.id === "new" \? requestedLesson : lessonBySlug\(artwork\?\.lessonSlug\)/);
  assert.match(studio, /lessonSlug: lesson\?\.slug \?\? null/);
  assert.doesNotMatch(studio, /location\.replace\(`\/student\/draw\/\$\{data\.artwork\.id\}\?lesson=/);
});

test("student and teacher surfaces expose four unlocked stages and round-trip grouped activities", async () => {
  const [home, picker, observe, teacher, teacherRoute, studentRoute] = await Promise.all([
    read("../app/components/StudentHome.tsx"), read("../app/components/LessonPicker.tsx"), read("../app/student/observe/page.tsx"), read("../app/components/TeacherApp.tsx"), read("../app/api/teacher/route.ts"), read("../app/api/student/route.ts"),
  ]);
  assert.match(home, /CURRICULUM_STAGES\.map/);
  assert.match(home, /잠금 없음/);
  assert.match(home, /바로 자유롭게 그리기/);
  assert.match(home, /오늘 선생님 추천/);
  assert.match(home, /teacherActivityPath/);
  assert.match(home, /artworkActivityLabel\(artwork\)/);
  assert.match(picker, /LESSONS\.filter\(\(lesson\) => lesson\.mode === mode\)/);
  assert.match(observe, /mode="observe"/);
  assert.match(teacher, /<optgroup label=\{`\$\{stage\.stage\}단계/);
  assert.match(teacher, /lessonsForStage/);
  assert.match(teacher, /FREE_ACTIVITY_KEY/);
  assert.match(teacherRoute, /isActivityKey\(activity\)/);
  assert.match(teacherRoute, /DEFAULT_ACTIVITY_KEY/);
  assert.match(teacherRoute, /currentActivityKey/);
  assert.match(teacherRoute, /UPDATE classrooms SET current_activity = \?/);
  assert.match(studentRoute, /SELECT current_activity AS currentActivity FROM classrooms WHERE id = \?/);
  assert.match(studentRoute, /normalizeActivityKey\(classroom\?\.currentActivity\)/);
  assert.match(studentRoute, /currentActivityLabel: activityLabel\(currentActivityKey\)/);
});
