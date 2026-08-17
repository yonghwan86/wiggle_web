import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("landing hero puts the code form in a titled card with exactly four accessible boxes", async () => {
  const [page, form] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/components/LandingCodeForm.tsx"),
  ]);
  assert.match(page, /<div className="landing-code-card">/);
  assert.match(page, /<h2 className="landing-code-card-title">수업 코드 입력<\/h2>/);
  assert.match(page, /<LandingCodeForm \/>/);

  assert.match(form, /const CODE_LENGTH = 4;/);
  assert.match(form, /role="group" aria-label="4자리 수업 코드"/);
  assert.match(form, /aria-label=\{`수업 코드 \$\{index \+ 1\}번째 숫자`\}/);
  // exactly four boxes are rendered by mapping the four-length digits array, not a hardcoded list
  assert.match(form, /Array\(CODE_LENGTH\)\.fill\(""\)/);
  assert.match(form, /digits\.map\(\(digit, index\) =>/);
});

test("landing code submit stays disabled until all four digits are filled, then navigates to /join?code=", async () => {
  const form = await read("../app/components/LandingCodeForm.tsx");
  assert.match(form, /const complete = digits\.every\(\(digit\) => digit !== ""\);/);
  assert.match(form, /disabled=\{!complete\}/);
  assert.match(form, /if \(!complete\) return;/);
  assert.match(form, /window\.location\.href = `\/join\?code=\$\{digits\.join\(""\)\}`;/);
});

test("teacher link uses the exact copy with a hidden person icon", async () => {
  const page = await read("../app/page.tsx");
  assert.match(page, /<a className="button secondary teacher-link" href="\/teacher">/);
  assert.match(page, /<svg aria-hidden="true"[^>]*>/);
  assert.match(page, />\s*교사 수업 열기\s*<\/a>/);
  assert.doesNotMatch(page, />교사 입장</);
});

test("/join accepts exactly four digits and rejects everything else", async () => {
  const joinPage = await read("../app/join/page.tsx");
  const patternSource = joinPage.match(/\/\^\\d\{4\}\$\/\.test\(rawCode\)/);
  assert.ok(patternSource, "expected the /^\\d{4}$/ four-digit contract in app/join/page.tsx");

  const fourDigitCode = /^\d{4}$/;
  for (const value of ["0000", "9999", "1234"]) {
    assert.ok(fourDigitCode.test(value), `expected ${value} to be accepted`);
  }
  for (const value of ["", "123", "12345", "12a4", " 1234", "1234 "]) {
    assert.ok(!fourDigitCode.test(value), `expected ${value} to be rejected`);
  }
});

test("/join query prefill does not hide the normal code field (that's QR-only behavior)", async () => {
  const [joinPage, joinClient] = await Promise.all([
    read("../app/join/page.tsx"),
    read("../app/components/JoinClient.tsx"),
  ]);
  assert.match(joinPage, /isQrEntry=\{false\}/);
  assert.match(joinClient, /const qrFlow = Boolean\(initialEntry\) && !recoveryToken && isQrEntry;/);
  assert.match(joinClient, /const hideCodeField = qrFlow && mode === "join";/);
  assert.match(joinClient, /\{!hideCodeField && <label><span>/);
});
