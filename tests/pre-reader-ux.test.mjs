import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [speak, speech, join, home, studio, css] = await Promise.all([
  read("../app/components/SpeakButton.tsx"),
  read("../lib/speech.ts"),
  read("../app/components/JoinClient.tsx"),
  read("../app/components/StudentHome.tsx"),
  read("../app/components/DrawingStudio.tsx"),
  read("../app/globals.css"),
]);

test("important child prompts can be heard on demand without automatic classroom audio", () => {
  assert.match(speech, /new SpeechSynthesisUtterance/);
  assert.match(speech, /utterance\.lang = "ko-KR"/);
  assert.match(speech, /utterance\.rate = 0\.82/);
  assert.match(speak, /onClick=\{handleClick\}/);
  // 음성 미지원·실패 시에도 버튼을 비활성화하지 않고 접근 가능한 대체 행동을 남긴다.
  assert.doesNotMatch(speak, /disabled=/);
  assert.match(speak, /같이 읽기/);
  assert.match(speak, /선생님과 같이 읽어요/);
  assert.match(home, /SpeakButton text="오늘은 무엇을 그릴까\? 선생님이 고른 활동부터 시작해 봐요\."/);
  assert.match(home, /선생님이 말했어요/);
  assert.match(studio, /SpeakButton text=\{`\$\{lesson\.steps\[step\]\.instruction\}/);
  assert.match(studio, /SpeakButton text=\{`\$\{coaching\.question\}/);
  assert.match(studio, /SpeakButton text=\{coaching\.nextAction\}/);
});

test("entry can be completed with pictures and a generated nickname instead of reading and typing every field", () => {
  assert.match(join, /\{ value: "꽃", picture: "🌸", name: "꽃" \}/);
  assert.match(join, /\{ value: "집", picture: "🏠", name: "집" \}/);
  assert.match(join, /className="password-slots"/);
  assert.match(join, /pictures\[index\] \? pictureFor\(pictures\[index\]\) : "\?"/);
  assert.match(join, /function suggestNickname\(\)/);
  assert.match(join, /🎲 별명 골라줘/);
  assert.match(join, /className="button primary full child-primary-action"/);
  assert.match(join, /<span aria-hidden="true">▶️<\/span>/);
  assert.match(join, /내 동물을 찾아서 눌러요/);
});

test("drawing, navigation and reflection retain familiar visual actions when text is not understood", () => {
  assert.match(home, /<span aria-hidden="true">✏️<\/span>[\s\S]*<h2>이어 그리기<\/h2>/);
  assert.match(home, /<span aria-hidden="true">🖼️<\/span>[\s\S]*<h2>내 그림<\/h2>/);
  assert.match(home, /<span aria-hidden="true">🎨<\/span>[\s\S]*<h2>활동 고르기<\/h2>/);
  assert.match(home, /<span aria-hidden="true">▶️<\/span>\{teacherDone \? "한 번 더 그리기" : "활동 시작"\}/);
  assert.match(studio, /⬅️ 이전/);
  assert.match(studio, /"➡️ 다음"/);
  assert.match(studio, /QUICK_DRAW_TOPICS/);
  assert.match(studio, /🚀/);
  assert.match(studio, /FAVORITE_PART_CHOICES/);
  assert.match(studio, /FAVORITE_REASON_CHOICES/);
  assert.match(studio, /className="reflection-choice-grid"/);
  assert.match(studio, /<span aria-hidden="true">⭐<\/span>작품 완성/);
});

test("speaker, picture slots and choice controls remain large and visible on small screens", () => {
  assert.match(css, /\.speak-button \{[^}]*min-height:52px/);
  assert.match(css, /\.speak-button\.compact \{[^}]*min-width:48px; width:48px; min-height:48px/);
  assert.match(css, /\.password-slots span \{[^}]*width:52px; height:52px/);
  assert.match(css, /\.reflection-choice-grid button \{[^}]*min-height:76px/);
  assert.match(css, /@media \(max-width:720px\)[\s\S]*\.welcome-title-row \{ grid-template-columns:48px minmax\(0,1fr\) 52px/);
  assert.match(css, /@media \(max-width:460px\) and \(orientation:portrait\)[\s\S]*\.lesson-spoken-prompt \{ grid-column:1; grid-row:1; grid-template-columns:minmax\(0,1fr\) 48px/);
  assert.match(css, /\.reflection-choice-grid \{ display:grid; grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});
