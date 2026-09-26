import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { validateMarkStrokes, MARK_MAX_STROKES, MARK_MAX_POINTS_PER_STROKE, isMarkAnswer } from "../lib/teacher-marks.ts";
import { sha256 } from "../lib/token-crypto.ts";
import { resetRows } from "./harness/db.mjs";
import { startTestServer } from "./harness/server.mjs";

/* 선생님 표시·손들기(2026-09-14 사용자 결정 — 따로 된 층).
 * 선생님은 그리는 중인 아이 그림 위에 표시를 보내고, 아이는 큰 버튼으로만 답한다.
 * 표시는 작품 ops에 들어가지 않고, 담임이 아닌 교사·다른 아이는 보내거나 답할 수 없다. */

test("표시 획 검사: 0~1 좌표 배열만 받고 어긋나면 고치지 않고 거절한다", () => {
  assert.deepEqual(validateMarkStrokes([[[0.1, 0.2], [0.33333333, 1]]]), [[[0.1, 0.2], [0.3333, 1]]]);
  assert.deepEqual(validateMarkStrokes([[[0.5, 0.5]]]), [[[0.5, 0.5]]]);
  for (const bad of [
    null, "[]", [], [[]], [[[0.1]]], [[[0.1, 0.2, 0.3]]], [[[-0.01, 0.5]]], [[[0.5, 1.01]]], [[[Number.NaN, 0.5]]], [[["0.1", 0.5]]],
    Array.from({ length: MARK_MAX_STROKES + 1 }, () => [[0.1, 0.1]]),
    [Array.from({ length: MARK_MAX_POINTS_PER_STROKE + 1 }, () => [0.1, 0.1])],
    Array.from({ length: 8 }, () => Array.from({ length: 400 }, () => [0.2, 0.2])),
  ]) assert.equal(validateMarkStrokes(bad), null, JSON.stringify(bad)?.slice(0, 40));
  assert.equal(isMarkAnswer("ok"), true); assert.equal(isMarkAnswer("unsure"), true);
  assert.equal(isMarkAnswer("replaced"), false); assert.equal(isMarkAnswer(""), false);
});

const owner = { cookie: "wiggle_teacher=marks_owner_session" };
const other = { cookie: "wiggle_teacher=marks_other_session" };
const doc = JSON.stringify({ schemaVersion: 1, rendererVersion: 1, size: 1024, height: 640, ops: [{ opId: "op1", clientOpId: "c1", type: "stroke", at: "2026-09-14T00:00:00.000Z", tool: "pen", color: "#1B3A57", width: 8, points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }] }] });
const circle = [Array.from({ length: 12 }, (_, i) => [0.5 + 0.1 * Math.cos(i / 11 * Math.PI * 2), 0.5 + 0.1 * Math.sin(i / 11 * Math.PI * 2)])];

let booting;
async function sharedServer() {
  if (!booting) booting = startTestServer().then(async (server) => { await server.fetch("/api/teacher"); return server; });
  return booting;
}
after(async () => { if (booting) await booting.then((server) => server.dispose(), () => {}); });

async function seed() {
  const server = await sharedServer();
  const db = server.DB;
  await resetRows(db);
  await db.batch([
    db.prepare("INSERT INTO teachers(id, email, display_name) VALUES ('t_owner', 'owner@marks.invalid', '담임'), ('t_other', 'other@marks.invalid', '다른 교사')"),
    db.prepare("INSERT INTO teacher_sessions(token_hash, teacher_id, expires_at, last_used_at) VALUES (?, 't_owner', '2099-01-01T00:00:00.000Z', CURRENT_TIMESTAMP), (?, 't_other', '2099-01-01T00:00:00.000Z', CURRENT_TIMESTAMP)").bind(await sha256("marks_owner_session"), await sha256("marks_other_session")),
    db.prepare("INSERT INTO classrooms(id, teacher_id, display_name, class_code, join_token, active) VALUES ('c_marks', 't_owner', '표시 반', '6101', 'join_marks', 1), ('c_other', 't_other', '다른 반', '6102', 'join_marks_other', 1)"),
    db.prepare("INSERT INTO student_profiles(id, classroom_id, seat_number, real_name, nickname, animal, claimed_at, last_activity_at) VALUES ('s_one', 'c_marks', 1, '김하나', '도리', '🐧', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ('s_two', 'c_marks', 2, '이두리', '콩이', '🐹', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ('s_far', 'c_other', 1, '먼학생', '봄이', '🐷', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"),
    db.prepare("INSERT INTO device_sessions(token_hash, student_id, expires_at, last_used_at) VALUES (?, 's_one', '2099-01-01T00:00:00.000Z', CURRENT_TIMESTAMP), (?, 's_two', '2099-01-01T00:00:00.000Z', CURRENT_TIMESTAMP)").bind(await sha256("marks_student_one"), await sha256("marks_student_two")),
    db.prepare("INSERT INTO artworks(id, student_id, classroom_id, title, topic, learning_mode, status, ops_json, updated_at, completed_at) VALUES ('a_done', 's_one', 'c_marks', '지난 그림', '자유', 'free', 'complete', ?, '2026-09-14T00:00:00.000Z', '2026-09-14T00:00:00.000Z'), ('a_now', 's_one', 'c_marks', '지금 그림', '자유', 'free', 'drawing', ?, '2026-09-14T01:00:00.000Z', NULL), ('a_two', 's_two', 'c_marks', '두리 그림', '자유', 'free', 'drawing', ?, '2026-09-14T01:00:00.000Z', NULL)").bind(doc, doc, doc),
  ]);
  return server;
}

const teacherPost = (server, headers, body) => server.fetch("/api/teacher", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ classroomId: "c_marks", ...body }) });
const studentGet = async (server, token) => (await server.fetch("/api/student", { headers: { authorization: `Bearer ${token}` } })).json();
const studentPost = (server, token, body) => server.fetch("/api/student", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
const live = async (server, headers = owner, studentId = "s_one") => server.fetch(`/api/teacher?classroomId=c_marks&liveStudentId=${studentId}`, { headers });

test("담임만 그리는 중인 그림에 표시를 보내고, 아이 화면에는 답하지 않은 최신 표시 하나만 뜬다", async () => {
  const server = await seed();

  // 권한·형식 거절
  assert.equal((await teacherPost(server, other, { action: "sendMark", studentId: "s_one", artworkId: "a_now", strokes: circle })).status, 403);
  assert.equal((await teacherPost(server, owner, { action: "sendMark", studentId: "s_one", artworkId: "a_two", strokes: circle })).status, 403, "다른 아이 그림");
  assert.equal((await teacherPost(server, owner, { action: "sendMark", classroomId: "c_marks", studentId: "s_far", artworkId: "a_now", strokes: circle })).status, 403, "다른 반 아이");
  assert.equal((await teacherPost(server, owner, { action: "sendMark", studentId: "s_one", artworkId: "a_now", strokes: [[[2, 2]]] })).status, 400);
  assert.equal((await teacherPost(server, owner, { action: "sendMark", studentId: "s_one", artworkId: "a_done", strokes: circle })).status, 409, "완성한 그림");

  const first = await teacherPost(server, owner, { action: "sendMark", studentId: "s_one", artworkId: "a_now", strokes: circle, note: "  여기에\n해를   그려 볼까?  " });
  assert.equal(first.status, 201);
  const { markId: firstId } = await first.json();

  const seen = await studentGet(server, "marks_student_one");
  assert.equal(seen.teacherMark.id, firstId);
  assert.equal(seen.teacherMark.artworkId, "a_now");
  assert.equal(seen.teacherMark.note, "여기에 해를 그려 볼까?");
  assert.equal(seen.teacherMark.strokes.length, 1);
  // 아이 응답에는 실명·선생님 정보가 없다.
  assert.doesNotMatch(JSON.stringify(seen), /김하나|이두리|담임|t_owner/);
  assert.equal((await studentGet(server, "marks_student_two")).teacherMark, null, "다른 아이에게는 뜨지 않음");

  // 새 표시를 보내면 옛 표시는 '바뀜'으로 닫히고 아이에게는 새 것만 뜬다.
  const second = await (await teacherPost(server, owner, { action: "sendMark", studentId: "s_one", artworkId: "a_now", strokes: circle })).json();
  assert.equal((await studentGet(server, "marks_student_one")).teacherMark.id, second.markId);
  const replaced = await server.DB.prepare("SELECT answer FROM teacher_marks WHERE id = ?").bind(firstId).first();
  assert.equal(replaced.answer, "replaced");

  // 선생님 실시간 보기: 최근 그림 문서와 최신 표시(아직 답 없음)
  const liveResponse = await live(server);
  assert.equal(liveResponse.status, 200);
  const livePayload = await liveResponse.json();
  assert.equal(livePayload.artwork.id, "a_now");
  assert.equal(livePayload.artwork.document.ops.length, 1);
  assert.equal(livePayload.mark.id, second.markId);
  assert.equal(livePayload.mark.answer, null);
  assert.equal((await live(server, other)).status, 403, "다른 교사는 볼 수 없음");
  // 1초마다 부르므로, 이미 가진 저장 번호와 같으면 그림 문서를 빼고 보낸다(2026-09-14).
  const knownRevision = livePayload.artwork.revision;
  const same = await (await server.fetch(`/api/teacher?classroomId=c_marks&liveStudentId=s_one&knownArtworkId=a_now&knownRevision=${knownRevision}`, { headers: owner })).json();
  assert.equal(same.artwork.unchanged, true);
  assert.equal(same.artwork.document, null);
  assert.equal(same.mark.id, second.markId, "문서를 빼도 표시 상태는 늘 보낸다");
  await server.DB.prepare("UPDATE artworks SET revision = revision + 1 WHERE id = 'a_now'").run();
  const changed = await (await server.fetch(`/api/teacher?classroomId=c_marks&liveStudentId=s_one&knownArtworkId=a_now&knownRevision=${knownRevision}`, { headers: owner })).json();
  assert.equal(changed.artwork.unchanged, false);
  assert.equal(changed.artwork.document.ops.length, 1);
  const otherArtwork = await (await server.fetch(`/api/teacher?classroomId=c_marks&liveStudentId=s_one&knownArtworkId=a_done&knownRevision=${changed.artwork.revision}`, { headers: owner })).json();
  assert.ok(otherArtwork.artwork.document, "다른 작품 번호를 들고 오면 문서를 보낸다");

  // 답: 형식이 틀리면 거절, 다른 아이는 남의 표시에 답하지 못함, 본인은 한 번만 답함
  assert.equal((await studentPost(server, "marks_student_one", { action: "answerMark", markId: second.markId, answer: "maybe" })).status, 400);
  assert.equal((await (await studentPost(server, "marks_student_two", { action: "answerMark", markId: second.markId, answer: "ok" })).json()).answered, false);
  assert.equal((await (await studentPost(server, "marks_student_one", { action: "answerMark", markId: second.markId, answer: "unsure" })).json()).answered, true);
  assert.equal((await (await studentPost(server, "marks_student_one", { action: "answerMark", markId: second.markId, answer: "ok" })).json()).answered, false, "두 번째 답은 덮어쓰지 않음");
  assert.equal((await studentGet(server, "marks_student_one")).teacherMark, null);
  assert.equal((await (await live(server)).json()).mark.answer, "unsure");

  // 따로 된 층: 아이 작품 문서는 그대로다.
  const stored = await server.DB.prepare("SELECT ops_json AS opsJson FROM artworks WHERE id = 'a_now'").first();
  assert.equal(stored.opsJson, doc);

  // 거두기
  const third = await (await teacherPost(server, owner, { action: "sendMark", studentId: "s_one", artworkId: "a_now", strokes: circle })).json();
  assert.equal((await teacherPost(server, owner, { action: "clearMark", studentId: "s_one" })).status, 200);
  assert.equal((await studentGet(server, "marks_student_one")).teacherMark, null);
  assert.equal((await server.DB.prepare("SELECT answer FROM teacher_marks WHERE id = ?").bind(third.markId).first()).answer, "cleared");
});

test("손들기: 아이가 부르면 담임 화면에 보이고, 표시·한 아이 메시지·손 내리기로 내려가며 10분 지나면 사라진다", async () => {
  const server = await seed();
  const handOf = async (studentId) => {
    const data = await (await server.fetch("/api/teacher?classroomId=c_marks", { headers: owner })).json();
    return data.students.find((student) => student.id === studentId).handRaisedAt;
  };

  assert.equal((await (await studentPost(server, "marks_student_one", { action: "raiseHand", raised: true })).json()).handRaised, true);
  assert.ok(await handOf("s_one"));
  assert.equal(await handOf("s_two"), null);
  assert.equal((await studentGet(server, "marks_student_one")).handRaised, true);

  assert.equal((await teacherPost(server, owner, { action: "lowerHand", studentId: "s_one" })).status, 200);
  assert.equal(await handOf("s_one"), null);
  assert.equal((await studentGet(server, "marks_student_one")).handRaised, false);

  await studentPost(server, "marks_student_one", { action: "raiseHand", raised: true });
  await teacherPost(server, owner, { action: "sendMark", studentId: "s_one", artworkId: "a_now", strokes: circle });
  assert.equal(await handOf("s_one"), null, "표시를 보내면 내려감");

  await studentPost(server, "marks_student_one", { action: "raiseHand", raised: true });
  await teacherPost(server, owner, { action: "sendMessage", studentId: "s_one", body: "잠깐 갈게요" });
  assert.equal(await handOf("s_one"), null, "그 아이에게 메시지를 보내면 내려감");

  await studentPost(server, "marks_student_two", { action: "raiseHand", raised: true });
  await teacherPost(server, owner, { action: "sendMessage", body: "모두 잘하고 있어요" });
  assert.ok(await handOf("s_two"), "반 전체 메시지로는 내려가지 않음");
  await studentPost(server, "marks_student_two", { action: "raiseHand", raised: false });
  assert.equal(await handOf("s_two"), null, "아이가 스스로 내림");

  await server.DB.prepare("INSERT INTO hand_raises(student_id, classroom_id, raised_at) VALUES ('s_two', 'c_marks', ?)").bind(new Date(Date.now() - 11 * 60 * 1000).toISOString()).run();
  assert.equal(await handOf("s_two"), null, "오래된 손은 보이지 않음");
  assert.equal((await studentGet(server, "marks_student_two")).handRaised, false);

  // 다른 교사는 남의 반 손을 내리지 못한다(학급 권한에서 막힘).
  await studentPost(server, "marks_student_one", { action: "raiseHand", raised: true });
  assert.equal((await teacherPost(server, other, { action: "lowerHand", studentId: "s_one" })).status, 403);
  assert.ok(await handOf("s_one"));
});

test("화면 연결: 표시는 아이 원본과 따로 된 캔버스이고 저장 문서에 넣지 않는다", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const [studio, css, liveView] = await Promise.all([read("../app/components/DrawingStudio.tsx"), read("../app/globals.css"), read("../app/components/TeacherLiveView.tsx")]);
  assert.match(studio, /<canvas ref=\{markRef\} className=\{visibleMark \? "mark-canvas" : "mark-canvas hidden"\} aria-hidden="true" \/>/);
  assert.match(css, /\.mark-canvas \{[^}]*pointer-events:none;/);
  // 표시 그리기는 표시 캔버스에서만 한다. 작품 ops·저장 경로(documentStateRef)에 표시 획을 넣지 않는다.
  assert.doesNotMatch(studio, /documentStateRef\.current[^\n]*teacherMark|teacherMark[^\n]*documentStateRef/);
  assert.match(liveView, /renderDrawDocument\(context, artwork\.document\.ops/);
  // 선생님이 보는 동안만 자동 저장을 짧게 한다. 보기 여부는 ref로 읽어 보기 시작·끝에 빈 저장이 나가지 않게 한다.
  assert.match(studio, /const WATCHED_AUTOSAVE_DEBOUNCE_MS = 500;/);
  assert.match(studio, /const WATCHED_AUTOSAVE_MAX_WAIT_MS = 2000;/);
  assert.match(studio, /const AUTOSAVE_DEBOUNCE_MS = 1500;\r?\nconst AUTOSAVE_MAX_WAIT_MS = 6000;/);
  assert.match(studio, /const watched = teacherViewingRef\.current;/);
  assert.doesNotMatch(studio, /\}, \[artwork, conflictDraft, documentState, editVersion, save, teacherViewing\]\);/);
  assert.match(liveView, /\}, 1000\);/);
});

test("선생님이 보고 있다는 알림은 5초만 뜨고 사라진다", async () => {
  const studio = await readFile(new URL("../app/components/DrawingStudio.tsx", import.meta.url), "utf8");
  /* 2026-09-26 사용자 지적: 선생님이 보는 동안 배너가 내내 떠 있어 그림을 가렸다.
     알림은 알림이고 상태가 아니다. 자동 저장 간격·자동 호출 억제가 쓰는 teacherViewing은
     그대로 두고, **배너 표시만** 따로 둔 5초짜리로 가른다. */
  assert.match(studio, /선생님이 내 도화지를 보고 있어요\./);
  assert.doesNotMatch(studio, /선생님이 지금 내 그림을 보고 있어요/);
  assert.match(studio, /\{viewingNoticeOpen && !visibleMark && \(/);
  assert.match(studio, /setTimeout\(\(\) => setViewingNoticeOpen\(false\), 5000\)/);
  // 보기가 끝나면 되돌려, 다시 볼 때 알림이 한 번 더 뜬다.
  assert.match(studio, /if \(!teacherViewing\) \{ setViewingNoticeOpen\(false\); return; \}/);
  // 배너를 끄는 것이 저장 간격·자동 호출 억제까지 끄면 안 된다.
  assert.match(studio, /const watched = teacherViewingRef\.current;/);
  assert.match(studio, /teacherViewing \|\| handRaised\) return false/);
});
