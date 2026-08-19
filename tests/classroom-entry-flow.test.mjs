import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startTestServer } from "./harness/server.mjs";

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
  assert.match(route, /s\.classroom_id = \? AND \$\{nicknameKeySql\("s\.nickname"\)\} = \? COLLATE NOCASE AND s\.animal = \?/);
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

// allowDuplicate 중복 생성 분기는 기존 프로필의 그림 비밀번호와 대조한다.
// 이 분기가 복구(recover)와 같은 대상 버킷을 소비하지 않으면 복구 경로의
// 8회/15분 상한을 우회해 60회/10분씩 비밀번호 일치 여부(409 오라클)를 캘 수 있다.
test("duplicate-credential probing shares the per-target recovery budget", async (context) => {
  const server = await startTestServer();
  context.after(() => server.dispose());

  // 주소는 x-forwarded-for로 흉내 낸다 — 플랫폼이 덮어쓰는, 앱이 실제로 신뢰하는 헤더다.
  const post = (body, ip = "203.0.113.77") => server.fetch("/api/student", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body),
  });
  const schemaReady = await post({ action: "unsupported" });
  assert.equal(schemaReady.status, 400);
  const DB = server.DB;
  await DB.batch([
    DB.prepare("INSERT INTO teachers(id, email, display_name) VALUES ('teacher_probe', 'probe@example.com', 'Probe')"),
    DB.prepare("INSERT INTO classrooms(id, teacher_id, display_name, class_code, join_token) VALUES ('class_probe', 'teacher_probe', '감사 반', '4998', 'join_probe')"),
  ]);

  const realPassword = ["⭐", "🌙", "🌸"];
  const joined = await post({ action: "join", entry: "4998", nickname: "감사토끼", animal: "🐰", picturePassword: realPassword });
  assert.equal(joined.status, 201, "첫 입장은 대상 버킷을 소비하지 않고 성공해야 한다");

  // 서로 다른 오답 8개: 매 시도가 새 중복 프로필을 만들거나 오라클 응답을 받고, 버킷을 1씩 소비한다.
  const wrongPasswords = [
    ["⭐", "⭐", "⭐"], ["🌙", "🌙", "🌙"], ["🌸", "🌸", "🌸"], ["⭐", "🌙", "🌙"],
    ["⭐", "⭐", "🌙"], ["🌙", "⭐", "🌸"], ["🌸", "🌙", "⭐"], ["🌙", "🌸", "⭐"],
  ];
  for (const picturePassword of wrongPasswords) {
    const probe = await post({ action: "join", entry: "4998", nickname: "감사토끼", animal: "🐰", picturePassword, allowDuplicate: true }, "203.0.113.78");
    assert.equal(probe.status, 201, "상한 이내의 오답 시도");
  }

  // 9번째 확인 시도는 IP를 바꿔도 대상 단위로 막혀야 한다.
  const blockedProbe = await post({ action: "join", entry: "4998", nickname: "감사토끼", animal: "🐰", picturePassword: realPassword, allowDuplicate: true }, "203.0.113.79");
  assert.equal(blockedProbe.status, 429);
  assert.deepEqual(await blockedProbe.json(), { error: "여러 번 틀렸어요. 선생님께 도움을 요청해 주세요." });

  // 오라클을 join으로 소진한 뒤 recover로 마무리하는 우회도 같은 버킷이 막는다.
  const blockedRecover = await post({ action: "recover", entry: "4998", nickname: "감사토끼", animal: "🐰", picturePassword: realPassword }, "203.0.113.80");
  assert.equal(blockedRecover.status, 429);

  const profiles = await DB.prepare("SELECT COUNT(*) AS count FROM student_profiles").first();
  assert.equal(profiles.count, 9, "차단 이후에는 프로필이 더 늘지 않는다");
});
