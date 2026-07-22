import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("teacher QR and copied entry address use the short rotating class code while legacy tokens remain accepted", async () => {
  const [teacher, studentApi, joinPage] = await Promise.all([
    read("../app/components/TeacherApp.tsx"),
    read("../app/api/student/route.ts"),
    read("../app/join/[token]/page.tsx"),
  ]);
  assert.match(teacher, /`\$\{location\.origin\}\/join\/\$\{classCode\}`/);
  assert.doesNotMatch(teacher, /location\.origin\}\/join\/\$\{classroomData\.classroom\.joinToken/);
  assert.match(teacher, /navigator\.clipboard\?\.writeText\(joinUrl\)/);
  assert.match(teacher, /classCode = classroomData\?\.classroom\.classCode/);
  assert.match(studentApi, /class_code = \? OR join_token = \?/);
  assert.match(joinPage, /initialEntry=\{\(await params\)\.token\}/);
});

test("QR rendering keeps a standard quiet zone, high contrast, large dialog and visible failure fallback", async () => {
  const [qr, teacher, css] = await Promise.all([
    read("../app/components/QrCode.tsx"),
    read("../app/components/TeacherApp.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(qr, /width: 360/);
  assert.match(qr, /margin: 4/);
  assert.match(qr, /dark: "#000000"/);
  assert.match(qr, /light: "#FFFFFF"/);
  assert.match(qr, /errorCorrectionLevel: "M"/);
  assert.match(qr, /QR 코드를 만들지 못했어요/);
  assert.match(qr, /aria-live="polite"/);
  assert.match(css, /\.qr-code-teacher \{ width:216px; min-width:190px;/);
  assert.match(css, /\.qr-code-large \{ width:min\(360px/);
  assert.match(css, /image-rendering:pixelated/);
  assert.doesNotMatch(css, /\.qr-code\s*\{[^}]*112px/i);
  assert.match(teacher, /QR 크게 보기/);
  assert.match(teacher, /event\.key === "Escape"/);
  assert.match(teacher, /role="dialog" aria-modal="true" aria-labelledby="large-qr-title"/);
  assert.match(teacher, /aria-label="큰 입장 QR 닫기"/);
  assert.match(teacher, /variant="large"/);
});

test("large QR dialog traps keyboard focus and restores the opener without changing other modals", async () => {
  const [teacher, css] = await Promise.all([
    read("../app/components/TeacherApp.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(teacher, /qrOpenButtonRef = useRef<HTMLButtonElement>/);
  assert.match(teacher, /qrDialogRef = useRef<HTMLDialogElement>/);
  assert.match(teacher, /<button ref=\{qrOpenButtonRef\}/);
  assert.match(teacher, /<dialog ref=\{qrDialogRef\}/);
  assert.match(teacher, /dialog\.showModal\(\)/);
  assert.match(teacher, /dialog\.querySelectorAll<HTMLElement>\(focusableSelector\)/);
  assert.match(teacher, /focusableItems\(\)\[0\]\?\.focus\(\)/);
  assert.match(teacher, /event\.key !== "Tab"/);
  assert.match(teacher, /event\.shiftKey[\s\S]*last\.focus\(\)/);
  assert.match(teacher, /!event\.shiftKey[\s\S]*first\.focus\(\)/);
  assert.match(teacher, /dialog\.removeEventListener\("keydown", keepFocusInside\)/);
  assert.match(teacher, /if \(dialog\.open\) dialog\.close\(\)/);
  assert.match(teacher, /if \(opener\?\.isConnected\) opener\.focus\(\)/);
  assert.match(teacher, /onCancel=\{\(event\) => \{ event\.preventDefault\(\); setQrExpanded\(false\); \}\}/);
  assert.match(css, /\.qr-modal-backdrop::backdrop/);
  assert.match(teacher, /viewingStudent && <div className="modal-backdrop" role="dialog"/);
});
