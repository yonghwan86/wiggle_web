import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const entrySource = await readFile(new URL("../lib/student-entry-client.ts", import.meta.url), "utf8");
const executableJavaScript = ts.transpileModule(entrySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const entryClient = await import(`data:text/javascript;base64,${Buffer.from(executableJavaScript).toString("base64")}`);
const { classifyEntryError } = entryClient;

const join = (await readFile(new URL("../app/components/JoinClient.tsx", import.meta.url), "utf8")).replace(
  /\r\n/g,
  "\n",
);

test("a wrong class code is classified for code-field recovery, wrong pictures for password recovery", () => {
  assert.equal(classifyEntryError({ status: 404, action: "join", hasPersonalQrToken: false }), "code");
  assert.equal(classifyEntryError({ status: 401, action: "switchProfile", hasPersonalQrToken: false }), "password");
  assert.equal(classifyEntryError({ status: 401, action: "recover", hasPersonalQrToken: false }), "password");
  // 개인 QR 복구 실패는 그림을 다시 고른다고 해결되지 않는다.
  assert.equal(classifyEntryError({ status: 401, action: "recover", hasPersonalQrToken: true }), "general");
  // join의 401은 비밀번호 검증이 아니므로 일반 오류다.
  assert.equal(classifyEntryError({ status: 401, action: "join", hasPersonalQrToken: false }), "general");
  assert.equal(classifyEntryError({ status: 429, action: "switchProfile", hasPersonalQrToken: false }), "general");
  assert.equal(classifyEntryError({ status: 500, action: "join", hasPersonalQrToken: false }), "general");
});

test("errors are shown with a warning picture and can be heard aloud", () => {
  assert.match(join, /className="error-box child-error" role="alert"/);
  assert.match(join, /child-error-icon" aria-hidden="true">⚠️/);
  assert.match(join, /<SpeakButton text=\{error\} label="오류 들어 보기" compact \/>/);
});

test("one big reset clears every picked picture and highlights after a wrong password", () => {
  assert.match(join, /function resetPictures\(\) \{\s*clearEntryError\(\);\s*setPictures\(\[\]\);/);
  assert.match(join, /reset-pictures-button\$\{errorKind === "password" \? " attention" : ""\}/);
  assert.match(join, /🔄<\/span> 다시 골라요/);
});

test("the first correction clears the previous error for nickname, animal and pictures (the classroom code has no visible field to correct — it comes from the landing page or QR)", () => {
  assert.match(join, /setNickname\(event\.target\.value\); setNicknameAuto\(false\); setDuplicateWarning\(false\); clearEntryError\(\);/);
  assert.match(join, /setAnimal\(value\); setDuplicateWarning\(false\); clearEntryError\(\);/);
  assert.match(join, /function appendPicture\(value: string\) \{\s*clearEntryError\(\);/);
  assert.match(join, /function removeLastPicture\(\) \{\s*clearEntryError\(\);/);
});

test("existing students hear an unlock instruction, not a creation instruction", () => {
  assert.match(join, /그림 비밀번호를 만들어요\. 같은 그림을 여러 번 골라도 돼요\./);
  assert.match(join, /내 그림 비밀번호를 눌러요\. 만들 때 골랐던 그림/);
  assert.match(join, /const creating = mode === "join";/);
});

test("a wrong class code offers calling the teacher (there is no visible code field to highlight since the code is entered only on the landing page or via QR)", () => {
  assert.match(join, /errorKind === "code" && !teacherCallOpen/);
  assert.match(join, /🙋<\/span>선생님 불러요/);
  assert.match(join, /손을 들고 선생님을 불러요\./);
});

test("join/recover never renders a stepper or a visible class-code field — the hidden entry alone carries the code", () => {
  // 별도 스테퍼를 남겨 두면 유지보수 중 실수로 다시 켜질 수 있다. 입장은 항상 한 화면이다.
  assert.doesNotMatch(join, /QR_STEPPER_ENABLED|qrStep|step-progress/);
  assert.doesNotMatch(join, /1️⃣ 수업 코드/);
  assert.match(join, /<legend>1️⃣ 내 동물<\/legend>/);
  assert.match(join, /<span>2️⃣ 그림 별명<\/span>/);
});

test("animal buttons carry Korean names for assistive tech", () => {
  assert.match(join, /const ANIMAL_NAMES: Record<string, string> = \{ "🐰": "토끼"/);
  assert.match(join, /aria-label=\{`\$\{ANIMAL_NAMES\[value\]\} 고르기`\}/);
});
