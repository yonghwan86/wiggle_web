import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [join, entry, archive, studio, css, messageCenter, entryCss] = await Promise.all([
  read("../app/components/JoinClient.tsx"),
  read("../app/components/StudentEntry.tsx"),
  read("../app/components/Archive.tsx"),
  read("../app/components/DrawingStudio.tsx"),
  read("../app/globals.css"),
  read("../app/components/StudentMessageCenter.tsx"),
  read("../app/components/EntryCheck.module.css"),
]);

test("child prompts stay readable as text — the listen button was removed on 2026-09-09", () => {
  for (const source of [join, entry, archive, studio, messageCenter]) assert.doesNotMatch(source, /SpeakButton/);
  assert.doesNotMatch(css, /speak-button/);
  // 2026-08-18 사용자 결정: 열기 버튼 아이콘은 💌 — 👩‍🏫 ZWJ 시퀀스는 Windows에서 깨져 보이고
  // "무엇을 여는 버튼인지"가 읽히지 않았다. 배너·이력 안의 👩‍🏫(말하는 주체 표시)는 유지한다.
  assert.match(messageCenter, /className="teacher-message-icon" aria-hidden="true">💌<\/span>/);
  assert.match(messageCenter, /<b>👩‍🏫 선생님<\/b>/);
  assert.doesNotMatch(messageCenter, /📬/);
});

test("entry can be completed with a number pad and one animal picture instead of reading and typing every field", () => {
  assert.match(join, /<h1>내 참여 코드를 눌러요<\/h1>/);
  assert.match(join, /<p>선생님이 준 네 자리 숫자예요\.<\/p>/);
  assert.match(join, /나랑 닮은 친구를 골라요<\/h1>/);
  assert.match(join, /마음에 드는 친구 하나를 골라 줘\.<\/p>/);
  assert.match(join, /className=\{`\$\{check\.enter\} child-primary-action`\}/);
  // 글을 못 읽어도 동물 그림 한 장으로 고른다 — 동물마다 따로 된 그림 파일(고해상도 그림이 오면 덮어씀).
  assert.match(join, /<img className=\{check\.pickImage\} src=\{character\.image\}/);
  assert.doesNotMatch(join, /이 기기에 저장된 내 동물 고르기|picturePassword|nickname-row/);
  // 동물 그림은 정사각형 투명 PNG를 webp로 바꾼 파일이다. 옛 스프라이트 한 장은 더 이상 화면에서 쓰지 않는다.
  assert.doesNotMatch(css, /animal-portraits-v2/);
});

test("drawing, navigation and reflection retain familiar visual actions when text is not understood", () => {
  // 커리큘럼 은퇴(2026-09-12)로 홈이 사라졌다가, 2026-09-25에 「그림 자리」가 생겼다 —
  // 저장된 그림이 0장이면 여전히 바로 도화지로 가고, 1장 이상이면 그 자리를 거친다.
  // 기다리는 화면은 글자 대신 몽그리 그림이 먼저다(2026-09-20) — 글을 못 읽어도 무엇을 기다리는지 안다.
  assert.match(entry, /<WaitMongri line="도화지를 펴고 있어요" \/>/);
  // 2026-09-20 GPT 인계로 보관함에서 「새 그림」을 뺐다(archive-sketchbook-handoff).
  // 남은 두 길과 그림 넘기기 단추가 글 대신 그림으로 보여야 한다는 뜻은 그대로다.
  assert.doesNotMatch(archive.slice(archive.indexOf("return <main")), /새 그림/);
  assert.match(archive, /aria-label="이전 그림 보기"/);
  assert.match(archive, /aria-label="다음 그림 보기"/);
  // 2026-09-20 보관함을 펼친 책으로 바꾸며 표지 그림을 시안에 맞췄다(📘→📖, 🚪→📕).
  // 지키려는 것은 특정 이모지가 아니라 "글을 못 읽어도 고를 그림이 있다"는 것이다.
  assert.match(archive, /<span aria-hidden="true">📖<\/span>그림책/);
  assert.match(archive, /<span aria-hidden="true">📕<\/span>\{leaving \? "나가는 중…" : "수업 마치기"\}/);
  assert.match(studio, /⬅️ 이전/);
  assert.match(studio, /step === lesson\.steps\.length - 1 \? "⭐" : "➡️"/);
  // 2026-09-20 사용자 지시로 "마음에 드는 곳·왜 마음에 들어" 고르기를 없앴다.
  // 마무리에 남는 것은 몽그리 짐작을 고르는 칩(같은 reflection-choice-grid)과 완성 단추다.
  assert.doesNotMatch(studio, /favoritePartChoices|FAVORITE_REASON_CHOICES|마음에 드는 곳은\?|왜 마음에 들어\?/);
  assert.match(studio, /className="reflection-choice-grid"/);
  assert.match(studio, /정답이 아니에요\. 네가 보고 직접 골라요\./);
  assert.match(studio, /<span aria-hidden="true">\{completionState === "saving" \? "⏳" : "⭐"\}<\/span>/);
  assert.match(studio, /"작품 완성"/);
});

test("picture slots and choice controls remain large and visible on small screens", () => {
  assert.match(css, /\.student-message-button \.teacher-message-icon \{[^}]*font-size:26px/);
  // 그림 비밀번호 슬롯(.password-slots)은 참여 코드 입장(2026-09-09)과 함께 사라졌다. 코드 수첩의 키는 EntryCheck.module.css가 44px 이상으로 잡는다.
  assert.match(entryCss, /\.key \{ min-height: 56px; font-size: 24px; \}/);
  assert.match(css, /\.reflection-choice-grid button \{[^}]*min-height:84px/);
  // `.welcome-title-row` 규칙은 어떤 화면도 렌더링하지 않는 죽은 CSS라 함께 제거했다.
  assert.match(css, /@media \(max-width:460px\) and \(orientation:portrait\)[\s\S]*\.lesson-spoken-prompt \{ grid-column:1; grid-row:1; grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.reflection-choice-grid \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  // 내 그림 헤더의 행동은 좁은 화면에서도 44px을 지킨다.
  assert.match(css, /\.archive-actions \.button,\.archive-actions \.small-button \{ min-height:44px; \}/);
});
