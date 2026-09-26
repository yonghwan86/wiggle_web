import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseRosterRows, parseRosterText, rosterTextToRows } from "../lib/roster.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

/* 교사 학급 명단(번호 + 실명)의 계약.
 * 가장 중요한 규칙: 실명은 담임 교사 화면에만 있고, 학생 화면·가족 공유·AI 요청에는 실리지 않는다.
 * 수업 코드는 인쇄물과 칠판에 적히는 값이라, 명단이 학생 응답에 섞이면 그 코드를 아는 사람에게
 * 반 전체 실명이 노출된다. */

test("명단 입력은 한 줄에 한 명씩 번호와 이름을 읽고, 구분자를 가리지 않는다", () => {
  const { entries, errors } = parseRosterText("1 김민준\n2. 이서연\n3,박지호\n4\t최하윤\n\n");
  assert.deepEqual(errors, []);
  assert.deepEqual(entries, [
    { seatNumber: 1, realName: "김민준" },
    { seatNumber: 2, realName: "이서연" },
    { seatNumber: 3, realName: "박지호" },
    { seatNumber: 4, realName: "최하윤" },
  ]);
});

test("명단 입력은 같은 번호와 빈 이름, 범위 밖 번호를 잡아낸다", () => {
  assert.match(parseRosterText("1 김민준\n1 이서연").errors[0], /1번이 두 번/);
  assert.match(parseRosterText("100 김민준").errors[0], /1~99/);
  // 이름 없이 번호만 있는 줄은 읽지 못한 줄로 잡는다.
  assert.equal(parseRosterText("7").entries.length, 0);
  assert.equal(parseRosterText("7").errors.length, 1);
});

/* 2026-09-20 사용자 결정: 화면은 번호 칸과 이름 칸을 따로 받는다.
 * 줄 파서(parseRosterText)는 파일·붙여넣기 입구로만 남는다. */
test("칸 입력은 번호와 이름을 그대로 읽고, 이름이 빈 줄은 아직 안 쓴 줄로 건너뛴다", () => {
  const { entries, errors } = parseRosterRows([
    { seat: "1", name: "김민준" },
    // 화면이 번호를 미리 채워 두므로 이런 줄이 늘 남아 있다. 열자마자 오류가 뜨면 안 된다.
    { seat: "3", name: "" },
    { seat: " 2 ", name: " 이서연 " },
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(entries, [{ seatNumber: 1, realName: "김민준" }, { seatNumber: 2, realName: "이서연" }]);
});

test("칸 입력은 빈 번호·숫자가 아닌 번호·중복 번호를 각각 다르게 알려 준다", () => {
  assert.match(parseRosterRows([{ seat: "", name: "김민준" }]).errors[0], /1번째 줄의 번호가 비어 있어요/);
  assert.match(parseRosterRows([{ seat: "일", name: "김민준" }]).errors[0], /숫자로 적어 주세요/);
  assert.match(parseRosterRows([{ seat: "100", name: "김민준" }]).errors[0], /1~99/);
  assert.match(parseRosterRows([{ seat: "3", name: "김민준" }, { seat: "3", name: "이서연" }]).errors[0], /3번이 두 번/);
  // 잘못된 줄 하나가 나머지를 버리지 않는다 — 교사는 그 칸만 고치면 된다.
  assert.equal(parseRosterRows([{ seat: "", name: "김민준" }, { seat: "2", name: "이서연" }]).entries.length, 1);
});

test("파일과 붙여넣기 글자는 칸으로 펼쳐지고, 읽지 못한 줄도 글자를 잃지 않는다", () => {
  assert.deepEqual(rosterTextToRows("1 김민준\n2. 이서연\n"), [{ seat: "1", name: "김민준" }, { seat: "2", name: "이서연" }]);
  // 번호 없이 이름만 붙여 넣으면 이름 칸에 남는다. 번호는 화면이 앞 줄 다음 번호로 채운다.
  assert.deepEqual(rosterTextToRows("박지호"), [{ seat: "", name: "박지호" }]);
});

test("서버는 명단 값을 스스로 검증한다 — 화면 검사만 믿지 않는다", async () => {
  const route = await read("../app/api/teacher/route.ts");
  assert.match(route, /const MAX_ROSTER_SIZE = 60;/);
  assert.match(route, /const MAX_SEAT_NUMBER = 99;/);
  assert.match(route, /function parseRoster\(value: unknown\)/);
  assert.match(route, /if \(!Number\.isInteger\(seatNumber\) \|\| seatNumber < 1 \|\| seatNumber > MAX_SEAT_NUMBER\)/);
  assert.match(route, /if \(seen\.has\(seatNumber\)\) return \{ error: `\$\{seatNumber\}번이 두 번 있어요\.` \}/);
  // 이미 쓰는 번호와 부딪히면 일부만 넣지 않고 통째로 거절한다.
  assert.match(route, /const clash = parsed\.entries\.find\(\(entry\) => used\.has\(entry\.seatNumber\)\)/);
});

test("새로 만든 자리는 아이가 들어오기 전까지 비어 있다", async () => {
  const route = await read("../app/api/teacher/route.ts");
  // claimed_at이 비어 있어야 그 번호를 아이가 처음 차지할 수 있다.
  assert.match(route, /INSERT INTO student_profiles\([^)]*entry_code, claimed_at[^)]*\) VALUES \([^)]*NULL/);
  // 아이 화면에 실명이 새지 않도록 자리표시 별명은 번호만 쓴다.
  assert.match(route, /`\$\{entry\.seatNumber\}번`/);
});

test("학생 응답에는 실명도 명단도 실리지 않는다", async () => {
  const student = await read("../app/api/student/route.ts");
  // entryStatus는 명단 학급인지만 알려 준다. 번호·이름 목록을 주지 않는다.
  assert.match(student, /SELECT 1 FROM student_profiles WHERE classroom_id = \? AND archived_at IS NULL AND seat_number IS NOT NULL LIMIT 1/);
  assert.match(student, /hasRoster: Boolean\(roster\)/);
  // 코드가 맞는 첫 입장은 "처음인지"만 준다. 번호·이름·코드 목록은 없다.
  assert.match(student, /return noStoreJson\(\{ classroomName: classroom\.displayName, firstTime: true \}\)/);
  // 학생 API 어디에서도 real_name을 고르지 않는다.
  assert.doesNotMatch(student, /real_name/);
});

test("자리 차지와 세션은 한 배치이고, 같은 코드는 두 번 차지되지 않는다", async () => {
  const student = await read("../app/api/student/route.ts");
  // 자리 차지·세션이 한 배치다. 나뉘면 중간 실패에서 아이가 영영 못 들어온다.
  assert.match(student, /const seatResults = await bindings\(\)\.DB\.batch\(\[[\s\S]*student_profiles[\s\S]*device_sessions[\s\S]*\]\)/);
  // 동시에 같은 코드로 들어와도 먼저 성공한 쪽만 자리를 갖는다.
  assert.match(student, /UPDATE student_profiles SET nickname = \?, animal = \?, claimed_at = \?, last_activity_at = \? WHERE id = \? AND claimed_at IS NULL/);
  assert.match(student, /INSERT INTO device_sessions[^`]*claimed_at = \?/);
});

test("코드 재입장은 학급 + 코드로만 찾고, 무차별 대입은 학급·IP 버킷이 막는다", async () => {
  const student = await read("../app/api/student/route.ts");
  assert.match(student, /if \(!\/\^\\d\{4\}\$\/\.test\(entryCode\)\)/);
  assert.match(student, /student-join-class:\$\{classroom\.id\}:\$\{requestIp\(request\)\}/);
  assert.match(student, /WHERE classroom_id = \? AND entry_code = \? AND archived_at IS NULL/);
  assert.doesNotMatch(student, /picture_hash|verifySecret|deriveSecret/);
});

test("학생 화면은 명단을 그리지 않고 자기 참여 코드만 입력한다", async () => {
  const join = await read("../app/components/JoinClient.tsx");
  assert.match(join, /className="entry-code-input"/);
  // QR로 채운 코드는 상태 반영 전에 제출되므로 코드를 인자로 받는다. 기본값은 여전히 키패드 입력이다.
  assert.match(join, /action: "join", entry, entryCode: code,/);
  assert.match(join, /async function submit\(chosenAnimal = "", code = codeInput\)/);
  // 서버가 명단을 주지 않으므로 화면에도 목록을 그릴 방법이 없다.
  assert.doesNotMatch(join, /realName|seatNumber|entryCodes/);
  // 재입장은 동물·별명을 다시 묻지 않는다 — 처음일 때만 동물 화면으로 간다.
  assert.match(join, /if \(data\.firstTime\) \{ claimCode\.current = code; setMode\("animal"\)/);
});

test("실명은 담임 교사 화면에만 나타난다", async () => {
  const [teacherRoute, teacherUi, css] = await Promise.all([
    read("../app/api/teacher/route.ts"),
    read("../app/components/TeacherApp.tsx"),
    read("../app/globals.css"),
  ]);
  // 교사 GET은 requireTeacher와 학급 소유 확인을 지난 뒤에만 실명을 싣는다.
  assert.match(teacherRoute, /s\.real_name AS realName/);
  assert.match(teacherRoute, /s\.entry_code AS entryCode/);
  assert.match(teacherUi, /student\.realName/);
  assert.match(teacherUi, /from "@\/lib\/roster"/);
  assert.match(teacherUi, /이름은 <b>선생님만<\/b> 봅니다/);
  assert.match(css, /\.student-roster-name \{/);
});

test("가족 공유와 AI 요청에는 실명이 실리지 않는다", async () => {
  const [family, coaching, aiRoute] = await Promise.all([
    read("../app/components/FamilyView.tsx"),
    read("../lib/openai-coaching.ts"),
    read("../app/api/ai/coaching/route.ts"),
  ]);
  for (const [name, source] of [["FamilyView", family], ["openai-coaching", coaching], ["ai/coaching route", aiRoute]]) {
    assert.doesNotMatch(source, /real_name|realName/, `${name}에 실명이 새면 안 된다`);
  }
});

test("참여 코드표는 팝업 없이 브라우저 인쇄로 나가고, 선생님 명단과 나눠 줄 쪽지 두 장이다", async () => {
  const [settings, sheet, css] = await Promise.all([
    read("../app/components/TeacherRosterSettings.tsx"),
    read("../app/components/TeacherRosterPrint.tsx"),
    read("../app/globals.css"),
  ]);
  // 종전 방식(window.open에 noopener)은 규격상 null이 돌아와 늘 실패했다. 팝업을 다시 쓰면 안 된다.
  assert.doesNotMatch(settings, /window\.open\(/);
  assert.match(settings, /onClick=\{\(\) => setPrintOpen\(true\)\}/);
  assert.match(settings, /onClick=\{\(\) => window\.print\(\)\}/);
  assert.match(settings, /<TeacherRosterPrint classroomName=/);
  // 첫 장은 실명이 있는 보관용, 둘째 장은 잘라 주는 쪽지.
  assert.match(sheet, /roster-print-list/);
  assert.match(sheet, /roster-print-slips/);
  assert.match(sheet, /선생님 보관용/);
  // 쪽지 한 장이면 입장이 끝나야 한다 — 아이별 QR + 수업 코드 + 내 참여 코드가 모두 있다.
  // QR은 2026-09-13부터 그 아이 참여 코드를 주소 조각에 담아, 찍으면 키패드 없이 들어간다.
  assert.match(sheet, /<QrCode value=\{entryQrUrl\(new URL\(joinUrl\)\.origin, classCode, student\.entryCode\)\}/);
  assert.match(sheet, /<dt>수업 코드<\/dt>/);
  assert.match(sheet, /<dt>내 참여 코드<\/dt>/);
  // 아이별 QR은 찍기만 하면 들어가므로, 안내가 "코드를 누르라"고 하면 QR 아래 문구와 서로 다른 말을 한다.
  assert.match(sheet, /student\.entryCode \? "QR을 찍으면 바로 도화지가 열려요\. 찍기 어려우면 참여 코드 네 자리를 눌러요\."/);
  // 인쇄하면 시트만 남는다: 시트의 조상·시트·시트 안을 뺀 나머지를 숨긴다.
  assert.match(css, /body:has\(\.roster-print\) \*:not\(:has\(\.roster-print\)\):not\(\.roster-print\):not\(\.roster-print \*\) \{ display:none!important; \}/);
  // 대화상자가 잡아 둔 스크롤·높이 제한을 풀지 않으면 둘째 장이 잘린다.
  assert.match(css, /body:has\(\.roster-print\) \{ overflow:visible!important; \}/);
  assert.match(css, /\.roster-print-sheet \+ \.roster-print-sheet \{ margin-top:0; break-before:page; \}/);
});

test("학급을 만들 때와 만든 뒤가 같은 명단 편집기를 쓴다", async () => {
  const [app, settings, editor, css] = await Promise.all([
    read("../app/components/TeacherApp.tsx"),
    read("../app/components/TeacherRosterSettings.tsx"),
    read("../app/components/RosterRowsEditor.tsx"),
    read("../app/globals.css"),
  ]);
  // 2026-09-23 사용자 요청. 입력이 두 가지면 선생님이 같은 일을 두 번 배운다 —
  // 만들기 폼의 "한 줄에 번호 이름" 텍스트 상자를 없애고 두 화면이 한 컴포넌트를 쓴다.
  assert.match(app, /<RosterRowsEditor rows=\{newRows\} setRows=\{setNewRows\} firstSeat=\{1\} \/>/);
  assert.match(settings, /<RosterRowsEditor rows=\{rows\} setRows=\{setRows\}/);
  // 만들기 폼 안에 텍스트 상자가 되살아나면 안 된다(파일 다른 곳의 메시지 입력은 그대로 둔다).
  const form = app.slice(app.indexOf('<form className="create-class"'), app.indexOf("{error && <p className=\"error-box\""));
  assert.doesNotMatch(form, /<textarea/);
  assert.doesNotMatch(app, /parseRosterText|function RosterField/);
  // 편집기가 제 스타일을 들고 다닌다 — 설정 화면을 함께 묶지 않아도 모양이 선다.
  assert.match(editor, /import "\.\/TeacherRosterSettings\.css";/);
  // 그 CSS의 색 토큰·칸 크기는 .teacher-workspace 안에서만 걸린다. 대시보드는 그 밖이라 다시 준다.
  assert.match(css, /\.create-class-roster \{ --tw-muted:#68716c; --tw-green:#315d46; --tw-line:#dce1de; \}/);
  assert.match(css, /\.create-class-roster \.trs-row input \{ min-height:44px; width:100%; \}/);
  // 이름을 다 적기 전에는 학급을 만들 수 없다.
  assert.match(app, /if \(!parsed\.entries\.length\) \{ setError\("번호와 이름을 입력해 주세요\."\); return; \}/);
});
