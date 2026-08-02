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

test("guided animal lessons build a complete body before the tail", () => {
  // 얼굴에서 꼬리로 건너뛰면 몸 없는 동물이 된다 — 몸 단계가 꼬리 단계보다 먼저 있어야 한다.
  for (const slug of ["friendly-dog", "curious-cat", "happy-dinosaur"]) {
    const lesson = LESSONS.find((item) => item.slug === slug);
    const bodyIndex = lesson.steps.findIndex((step) => step.instruction.includes("몸"));
    const tailIndex = lesson.steps.findIndex((step) => step.instruction.includes("꼬리"));
    assert.ok(bodyIndex >= 0, `${slug}: 몸 단계가 있어야 한다`);
    assert.ok(tailIndex < 0 || bodyIndex < tailIndex, `${slug}: 몸 단계가 꼬리보다 먼저여야 한다`);
  }
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
  const [home, chooser, picker, observe, teacher, teacherRoute, teacherMutations, studentRoute] = await Promise.all([
    read("../app/components/StudentHome.tsx"), read("../app/components/ActivityChooser.tsx"), read("../app/components/LessonPicker.tsx"), read("../app/student/observe/page.tsx"), read("../app/components/TeacherApp.tsx"), read("../app/api/teacher/route.ts"), read("../lib/teacher-classroom-mutations.ts"), read("../app/api/student/route.ts"),
  ]);
  assert.match(chooser, /CURRICULUM_STAGES\.map/);
  assert.match(chooser, /언제든 시작/);
  assert.match(chooser, /stage\.path/);
  assert.doesNotMatch(home, /바로 자유롭게 그리기/);
  assert.match(home, /선생님이 선택한 오늘 활동/);
  assert.match(home, /teacherActivityPath/);
  const primaryMenu = home.slice(home.indexOf("student-primary-menu"), home.indexOf("</nav>", home.indexOf("student-primary-menu")));
  assert.ok(primaryMenu.indexOf("<h2>이어 그리기</h2>") < primaryMenu.indexOf("<h2>내 그림</h2>"));
  assert.ok(primaryMenu.indexOf("<h2>내 그림</h2>") < primaryMenu.indexOf("<h2>활동 고르기</h2>"));
  assert.match(teacher, /진행 중인 그림[\s\S]*학생 그림[\s\S]*활동 고르기/);
  assert.match(picker, /LESSONS\.filter\(\(lesson\) => lesson\.mode === mode\)/);
  assert.match(observe, /mode="observe"/);
  assert.match(teacher, /<optgroup label=\{`\$\{stage\.stage\}단계/);
  assert.match(teacher, /lessonsForStage/);
  assert.match(teacher, /FREE_ACTIVITY_KEY/);
  assert.match(teacherRoute, /isActivityKey\(activity\)/);
  assert.match(teacherRoute, /DEFAULT_ACTIVITY_KEY/);
  assert.match(teacherRoute, /currentActivityKey/);
  assert.match(teacherMutations, /UPDATE classrooms SET current_activity = \?/);
  assert.match(studentRoute, /SELECT current_activity AS currentActivity FROM classrooms WHERE id = \?/);
  assert.match(studentRoute, /normalizeActivityKey\(classroom\?\.currentActivity\)/);
  assert.match(studentRoute, /currentActivityLabel: activityLabel\(currentActivityKey\)/);
});
