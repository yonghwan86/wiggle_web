import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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

test("every guided and observation drawing has a visible guide for every drawing step", () => {
  for (const lesson of LESSONS.filter((item) => item.stage >= 2)) {
    const guidedSteps = new Set(lesson.guide.map((mark) => mark.step));
    for (let step = 1; step < lesson.steps.length; step += 1) {
      if (lesson.steps[step - 1].activity !== "color") assert.ok(guidedSteps.has(step), `${lesson.slug}: ${step}단계 guide가 필요하다`);
    }
    assert.ok(lesson.guide.length >= 8, `${lesson.slug}: 전체 대상이 보일 만큼 충분한 선이 필요하다`);
    const colorStep = lesson.steps.findIndex((step) => step.activity === "color");
    if (colorStep >= 0) assert.ok(!guidedSteps.has(colorStep + 1), `${lesson.slug}: 색칠 단계에는 정답 점선을 덧씌우지 않는다`);
    assert.ok(!guidedSteps.has(lesson.steps.length), `${lesson.slug}: 마지막 자유 창작에는 정답 점선이 없어야 한다`);
  }
});

test("ten guided drawings use detailed, canvas-safe finished outlines", () => {
  const guidedLessons = LESSONS.filter((lesson) => lesson.mode === "guided");
  assert.equal(guidedLessons.length, 10);
  for (const lesson of guidedLessons) {
    assert.equal(lesson.steps.length, 7, `${lesson.slug}: 윤곽 5단계, 색칠, 자유 창작 순서여야 한다`);
    assert.equal(lesson.steps.at(-2).activity, "color", `${lesson.slug}: 자유 창작 전에 색칠한다`);
    assert.equal(lesson.steps.at(-1).activity, "free", `${lesson.slug}: 마지막은 아이 생각을 더한다`);
    assert.ok(lesson.guide.length >= 13, `${lesson.slug}: 단순 도형 몇 개가 아니라 완성 윤곽과 특징이 필요하다`);
    const values = lesson.guide.flatMap((mark) => {
      if (mark.kind === "ellipse") return [mark.x - mark.rx, mark.x + mark.rx, mark.y - mark.ry, mark.y + mark.ry];
      if (mark.kind === "rect") return [mark.x, mark.y, mark.x + mark.width, mark.y + mark.height];
      return mark.points.flat();
    });
    assert.ok(values.every((value) => value >= 0 && value <= 1), `${lesson.slug}: 점선이 도화지 밖으로 잘리면 안 된다`);
  }
});

test("guided lessons show polished finished art while observation lessons show ten real reference pictures", async () => {
  const [illustration, finished, reference, studio, picker] = await Promise.all([
    read("../app/components/LessonIllustration.tsx"), read("../app/components/LessonFinishedIllustration.tsx"), read("../app/components/LessonReference.tsx"), read("../app/components/DrawingStudio.tsx"), read("../app/components/LessonPicker.tsx"),
  ]);
  assert.match(illustration, /for \(const mark of lesson\.guide\)/);
  assert.match(illustration, /const STEP_COLORS = \[/);
  assert.match(illustration, /aria-label=\{`\$\{lesson\.title\} 전체 참고 그림`\}/);
  assert.match(reference, /lesson\.mode !== "observe"/);
  assert.match(reference, /lesson\.mode === "guided"/);
  assert.match(finished, /guided-finished-sprite\.webp/);
  await access(new URL("../public/lessons/guided-finished-sprite.webp", import.meta.url));
  assert.match(finished, /"curious-cat": "\/lessons\/guided\/curious-cat-v2\.png"/);
  const catCutout = await readFile(new URL("../public/lessons/guided/curious-cat-v2.png", import.meta.url));
  assert.equal(catCutout[25], 6, "the cat cutout must be an RGBA PNG without a baked-in background");
  assert.match(reference, /lesson\.referenceImage/);
  assert.match(reference, /관찰 그림 크게 보기/);
  assert.match(studio, /LessonReference as LessonIllustration/);
  assert.match(studio, /currentLessonActivity === "color"/);
  assert.match(studio, /setStudioTool\("crayon"\)/);
  assert.match(studio, /setDrawWidth\(48\)/);
  assert.match(finished, /lesson\.slug === "delivery-bike" \? "scaleX\(-1\)"/);
  assert.match(picker, /<LessonReference lesson=\{lesson\}/);
  const observationLessons = LESSONS.filter((lesson) => lesson.mode === "observe");
  assert.equal(observationLessons.length, 10);
  for (const lesson of observationLessons) {
    assert.match(lesson.referenceImage, /^\/lessons\/observe\/[a-z-]+\.webp$/, lesson.slug);
    assert.equal(lesson.observationWords?.length, 4, lesson.slug);
    await access(new URL(`../public${lesson.referenceImage}`, import.meta.url));
  }
  assert.doesNotMatch(picker, /바로 자유롭게 그리기/);
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
