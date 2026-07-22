import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readStudentEntryResponse, StudentEntryResponseError } from "../lib/student-entry-client.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("student entry preserves JSON API errors", async () => {
  const payload = { error: "수업 코드를 다시 확인해 주세요." };
  assert.deepEqual(await readStudentEntryResponse(Response.json(payload, { status: 404 })), payload);
});

test("student entry hides Safari's native parse exception for a non-JSON 5xx", async () => {
  await assert.rejects(
    readStudentEntryResponse(new Response("<html>upstream error</html>", { status: 500 })),
    (error) => error instanceof StudentEntryResponseError && /입장 서버/.test(error.message) && !/expected pattern/.test(error.message),
  );
  const join = await read("../app/components/JoinClient.tsx");
  assert.match(join, /readStudentEntryResponse\(response\)/);
  assert.doesNotMatch(join, /const data = await response\.json\(\)/);
});

test("student POST turns unexpected failures into a no-store Korean JSON 500", async () => {
  const [route, security] = await Promise.all([read("../app/api/student/route.ts"), read("../lib/security.ts")]);
  assert.match(route, /async function studentPost\(request: Request\)/);
  assert.match(route, /export async function POST[\s\S]*try \{[\s\S]*return await studentPost\(request\)[\s\S]*catch[\s\S]*jsonError\("입장을 처리하지 못했어요\. 잠시 뒤 다시 해 주세요\.", 500\)/);
  assert.match(security, /headers\.set\("cache-control", "no-store, max-age=0"\)/);
  assert.match(security, /return Response\.json\(data, \{ \.\.\.init, headers \}\)/);
});
