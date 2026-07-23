import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sessionUrl = new URL("../lib/client-session.ts", import.meta.url);
const sessionSource = await readFile(sessionUrl, "utf8");
const executableSource = sessionSource.replace(
  'from "./drawing-model"',
  `from "${new URL("../lib/drawing-model.ts", import.meta.url).href}"`,
);
const executableJavaScript = ts.transpileModule(executableSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const queue = await import(`data:text/javascript;base64,${Buffer.from(executableJavaScript).toString("base64")}`);

const documentWith = (suffix) => ({
  schemaVersion: 1,
  rendererVersion: 1,
  size: 1024,
  ops: [{
    opId: `operation_${suffix}`,
    clientOpId: `clientop_${suffix}`,
    type: "stroke",
    at: "2026-07-23T01:00:00.000Z",
    tool: "pen",
    color: "#1B3A57",
    width: 16,
    points: [{ x: 0.2, y: 0.3, pressure: 0.5 }],
  }],
});

const save = ({ requestId, url = "/api/artworks/art_a", createdAt, document, currentStep, conflict = false, branchId = "branch_a" }) => ({
  requestId,
  studentId: "student_a",
  url,
  createdAt,
  branchId,
  conflict,
  conflictRevision: conflict ? 7 : undefined,
  body: JSON.stringify({ document, currentStep }),
});

test("queued artwork bodies are validated and the newest same-artwork draft wins", () => {
  const oldDraft = save({
    requestId: "request_0001",
    createdAt: "2026-07-23T01:00:00.000Z",
    document: documentWith("old00001"),
    currentStep: 2,
    conflict: true,
  });
  const latestDraft = save({
    requestId: "request_0002",
    createdAt: "2026-07-23T01:00:01.000Z",
    document: documentWith("new00002"),
    currentStep: 4,
    conflict: true,
  });
  const otherArtwork = save({
    requestId: "request_0003",
    url: "/api/artworks/art_b",
    createdAt: "2026-07-23T01:00:02.000Z",
    document: documentWith("other003"),
    currentStep: 1,
    conflict: true,
  });

  const compacted = queue.coalesceQueuedArtworkSaves([latestDraft, oldDraft, otherArtwork]);
  assert.deepEqual(compacted.kept.map((item) => item.requestId), ["request_0002", "request_0003"]);
  assert.deepEqual(compacted.discarded.map((item) => item.requestId), ["request_0001"]);

  const restored = queue.latestQueuedArtworkConflict([oldDraft, otherArtwork, latestDraft], "/api/artworks/art_a");
  assert.equal(restored.currentStep, 4);
  assert.equal(restored.document.ops[0].clientOpId, "clientop_new00002");
  assert.equal(restored.save.url, "/api/artworks/art_a");

  assert.equal(queue.queuedArtworkDraft({ ...latestDraft, body: "{broken" }), null);
  assert.equal(queue.queuedArtworkDraft({ ...latestDraft, body: JSON.stringify({ document: { ...documentWith("bad00004"), size: 12 }, currentStep: 4 }) }), null);
  assert.equal(queue.queuedArtworkDraft({ ...latestDraft, body: JSON.stringify({ document: documentWith("bad00005"), currentStep: 31 }) }), null);
  const invalidNewest = { ...latestDraft, requestId: "request_0004", createdAt: "2026-07-23T01:00:03.000Z", body: "{broken" };
  assert.equal(queue.latestQueuedArtworkDraft([oldDraft, invalidNewest], oldDraft.url).save.requestId, oldDraft.requestId);
});

test("pending drafts and completed reflections are restored without dropping ambiguous same-millisecond writes", () => {
  const conflict = save({
    requestId: "request_1001",
    createdAt: "2026-07-23T02:00:00.000Z",
    document: documentWith("conf1001"),
    currentStep: 2,
    conflict: true,
  });
  const pending = save({
    requestId: "request_1002",
    createdAt: "2026-07-23T02:00:01.000Z",
    document: documentWith("pend1002"),
    currentStep: 5,
  });
  const restoredPending = queue.latestQueuedArtworkDraft([conflict, pending], pending.url);
  assert.equal(Boolean(restoredPending.save.conflict), false);
  assert.equal(restoredPending.document.ops[0].clientOpId, "clientop_pend1002");
  assert.deepEqual(queue.coalesceQueuedArtworkSaves([conflict, pending]).kept.map((item) => item.requestId), ["request_1001", "request_1002"]);

  const completed = {
    ...pending,
    requestId: "request_1003",
    body: JSON.stringify({
      document: documentWith("done1003"),
      currentStep: 6,
      complete: true,
      finalDataUrl: "data:image/png;base64,AAAA",
      reflection: { favoritePart: "하늘", favoriteReason: "색이 좋아서", spokenDescription: "파란 하늘", storyText: "여행 이야기" },
    }),
  };
  const restoredCompleted = queue.queuedArtworkDraft(completed);
  assert.equal(restoredCompleted.complete, true);
  assert.equal(restoredCompleted.reflection.favoritePart, "하늘");
  assert.equal(restoredCompleted.finalDataUrl, "data:image/png;base64,AAAA");
  assert.equal(Boolean(queue.selectFlushCandidates([completed])[0].conflict), false);
  assert.equal(queue.queuedArtworkDraft(queue.selectFlushCandidates([completed])[0]).complete, true);
  assert.equal(queue.queuedArtworkDraft({ ...completed, body: JSON.stringify({ document: documentWith("bad11003"), currentStep: 6, complete: true, reflection: { favoritePart: "하늘", favoriteReason: "" } }) }), null);

  const sameTimeOtherTab = { ...pending, requestId: "request_1004" };
  const ambiguous = queue.coalesceQueuedArtworkSaves([pending, sameTimeOtherTab]);
  assert.deepEqual(ambiguous.kept.map((item) => item.requestId), ["request_1002", "request_1004"]);
  assert.equal(ambiguous.discarded.length, 0);
});

test("coalescing and flush selection preserve branches, legacy writes and older valid fallback", () => {
  const branchAOld = save({ requestId: "request_2001", createdAt: "2026-07-23T03:00:00.000Z", document: documentWith("bra20001"), currentStep: 1 });
  const branchANew = save({ requestId: "request_2002", createdAt: "2026-07-23T03:00:02.000Z", document: documentWith("bra20002"), currentStep: 2 });
  const branchB = save({ requestId: "request_2003", createdAt: "2026-07-23T03:00:01.000Z", document: documentWith("brb20003"), currentStep: 3, branchId: "branch_b" });
  const legacyOne = { ...branchAOld, requestId: "request_2004", branchId: undefined };
  const legacyTwo = { ...branchANew, requestId: "request_2005", branchId: undefined };
  assert.deepEqual(queue.coalesceQueuedArtworkSaves([branchAOld, branchANew, branchB]).kept.map((item) => item.requestId), ["request_2003", "request_2002"]);
  assert.deepEqual(queue.coalesceQueuedArtworkSaves([legacyOne, legacyTwo]).kept.map((item) => item.requestId), ["request_2004", "request_2005"]);

  const malformedNewest = { ...branchANew, requestId: "request_2006", createdAt: "2026-07-23T03:00:03.000Z", body: "{broken" };
  assert.equal(queue.selectFlushCandidates([branchAOld, malformedNewest])[0].requestId, branchAOld.requestId);
  assert.equal(queue.shouldDeleteSiblingAfterFlush(branchAOld, malformedNewest), true);
  assert.equal(queue.shouldDeleteSiblingAfterFlush(branchAOld, branchB), false);
  assert.equal(queue.shouldDeleteSiblingAfterFlush(branchAOld, branchANew), false);
});

test("valid remaining branch wins over completion redirect", () => {
  const branchBRemaining = save({
    requestId: "request_3001",
    createdAt: "2026-07-23T04:00:00.000Z",
    document: documentWith("brb30001"),
    currentStep: 4,
    branchId: "branch_b",
    conflict: true,
  });
  const recover = queue.resolveArtworkDraftDisposition([branchBRemaining], branchBRemaining.url, true);
  assert.equal(recover.action, "recover");
  assert.equal(recover.draft.save.requestId, branchBRemaining.requestId);
  assert.deepEqual(queue.resolveArtworkDraftDisposition([], branchBRemaining.url, true), { action: "archive" });
  assert.deepEqual(queue.resolveArtworkDraftDisposition([], branchBRemaining.url, false), { action: "load" });
});

test("serial save queue never overlaps requests", async () => {
  const run = queue.createSerialTaskQueue();
  const trace = [];
  let active = 0;
  let maxActive = 0;
  let releaseFirst;

  const first = run(async () => {
    active += 1; maxActive = Math.max(maxActive, active); trace.push("start:first");
    await new Promise((resolve) => { releaseFirst = resolve; });
    trace.push("end:first"); active -= 1;
  });
  const second = run(async () => {
    active += 1; maxActive = Math.max(maxActive, active); trace.push("start:second");
    trace.push("end:second"); active -= 1;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(trace, ["start:first"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(maxActive, 1);
  assert.deepEqual(trace, ["start:first", "end:first", "start:second", "end:second"]);
});

test("URL scoping, client-error retention and ordered clearing are executable contracts", () => {
  const olderPending = save({
    requestId: "request_0100",
    createdAt: "2026-07-23T01:00:00.000Z",
    document: documentWith("older100"),
    currentStep: 1,
  });
  const through = { createdAt: "2026-07-23T01:00:01.000Z", requestId: "request_0200" };
  const newerOtherTab = save({
    requestId: "request_0300",
    createdAt: through.createdAt,
    document: documentWith("newer300"),
    currentStep: 3,
  });
  const sameMillisecondOtherTab = { ...newerOtherTab, requestId: "request_0001" };
  const conflict = { ...olderPending, requestId: "request_0150", conflict: true };
  const otherArtwork = { ...olderPending, requestId: "request_0400", url: "/api/artworks/art_b" };

  assert.deepEqual(queue.scopeQueuedArtworkSaves([olderPending, otherArtwork], "student_a", "/api/artworks/art_a"), [olderPending]);
  assert.equal(queue.flushResponseDisposition(200), "success");
  assert.equal(queue.flushResponseDisposition(409), "conflict");
  assert.equal(queue.flushResponseDisposition(422), "preserve");
  assert.equal(queue.flushResponseDisposition(500), "retry");
  assert.equal(queue.shouldClearQueuedArtworkSave(olderPending, "student_a", olderPending.url, "pending", through), true);
  assert.equal(queue.shouldClearQueuedArtworkSave(conflict, "student_a", olderPending.url, "pending", through), false);
  assert.equal(queue.shouldClearQueuedArtworkSave(newerOtherTab, "student_a", olderPending.url, "pending", through), false);
  assert.equal(queue.shouldClearQueuedArtworkSave(sameMillisecondOtherTab, "student_a", olderPending.url, "pending", through), false);
  assert.equal(queue.shouldClearQueuedArtworkSave(otherArtwork, "student_a", olderPending.url, "all", through), false);
});

test("drawing studio wires hydration, online flush, conflict pause and local-draft copy", async () => {
  const [studio, session] = await Promise.all([
    readFile(new URL("../app/components/DrawingStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/client-session.ts", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /setEditVersion\(0\)[\s\S]*initialized\.current = true/);
  assert.match(studio, /editVersion === 0 \|\| conflictDraft \|\| completingRef\.current/);
  assert.match(studio, /window\.addEventListener\("online", flushCurrentArtwork\)/);
  assert.match(studio, /flushSaves\(profile\.studentId, url\)/);
  assert.match(studio, /resolveArtworkDraftDisposition\(flushed\.remaining, artworkUrl, flushed\.completedUrls\.includes\(artworkUrl\)\)/);
  assert.match(studio, /resolveArtworkDraftDisposition\(flushed\.remaining, artworkUrl, data\.artwork\.status === "complete"\)/);
  assert.match(studio, /resolveArtworkDraftDisposition\(flushed\.remaining, url, flushed\.completedUrls\.includes\(url\)\)/);
  assert.match(studio, /disposition\.action === "archive"[\s\S]*location\.replace\("\/student\/archive"\)/);
  assert.match(studio, /loadingKeyRef\.current === loadKey \|\| hydratedKeyRef\.current === loadKey/);
  assert.match(studio, /conflictBody[\s\S]*document: documentStateRef\.current, currentStep: currentStepRef\.current/);
  assert.match(studio, /if \(existingDraft\)[\s\S]*if \(options\?\.complete\)[\s\S]*complete: true[\s\S]*conflict: true/);
  assert.match(studio, /previousTime \+ 1/);
  assert.doesNotMatch(studio, /conflict: options\?\.complete \? true : undefined/);
  assert.match(studio, /if \(options\?\.complete\) await preserveDraft\(queued/);
  assert.match(studio, /const preserveDraft[\s\S]*const restored = queuedArtworkDraft\(queued\)[\s\S]*conflictDraftRef\.current = restored[\s\S]*await queueSave\(queued\)/);
  assert.match(studio, /branchId: saveBranchId/);
  assert.match(studio, /document: draft\.document, currentStep: draft\.currentStep/);
  assert.match(studio, /complete: draft\.complete, finalDataUrl: draft\.finalDataUrl, reflection: draft\.reflection/);
  assert.match(studio, /deleteQueuedArtworkSave\(profile\.studentId, draft\.save\.url, draft\.save\.requestId\)/);
  assert.match(studio, /artwork_copy_/); assert.match(studio, /copy_\$\{stableKey\}/);
  assert.match(studio, /function pointerUp[\s\S]*if \(conflictDraftRef\.current\)[\s\S]*activePoints\.current\.delete/);
  assert.match(studio, /function changeLessonStep[\s\S]*conflictDraftRef\.current/);
  assert.match(studio, /completingRef\.current = true; window\.clearTimeout\(saveTimer\.current\)/);
  assert.match(session, /const transaction = db\.transaction\("saves", "readwrite"\); const store = transaction\.objectStore\("saves"\);\s*const request = store\.getAll\(\)/);
  assert.match(session, /sameRequestConflict && !save\.conflict/);
  assert.match(session, /item\.branchId !== incoming\.branchId/);
  assert.match(session, /incoming\.conflict \|\| !item\.conflict/);
  assert.match(session, /save\.branchId \? `branch:\$\{save\.branchId\}` : `legacy:\$\{save\.requestId\}`/);
  assert.match(session, /selectFlushCandidates\(scoped\)/);
  assert.match(session, /data\.status === "complete" \|\| queuedArtworkDraft\(save\)\?\.complete/);
});
