import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const EXPECTED_HEX = "21024667be6a54ca55f08c5c7ebfb05cf8a15ec805a37f68fbd502d484970ec9";

test("workerd node:crypto preserves the 120k PBKDF2-SHA256 fixed vector", async (context) => {
  const miniflare = new Miniflare({
    modules: true,
    compatibilityDate: "2026-05-22",
    compatibilityFlags: ["nodejs_compat"],
    script: `
      import { pbkdf2 } from "node:crypto";
      export default { async fetch() {
        const hex = await new Promise((resolve, reject) => pbkdf2("wiggle-password", "student-salt", 120000, 32, "sha256", (error, key) => error ? reject(error) : resolve(key.toString("hex"))));
        return new Response(hex);
      } };
    `,
  });
  context.after(() => miniflare.dispose());
  const response = await miniflare.dispatchFetch("http://localhost/");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), EXPECTED_HEX);
});

test("server crypto and both local Worker configs keep the compatible contract", async () => {
  const [security, vite, wrangler] = await Promise.all([read("../lib/security.ts"), read("../vite.config.ts"), read("../wrangler.local.jsonc")]);
  assert.match(security, /import "server-only"/);
  assert.match(security, /pbkdf2\(value, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_BYTES, "sha256"/);
  assert.match(security, /PBKDF2_ITERATIONS = 120_000/);
  assert.match(security, /PBKDF2_KEY_BYTES = 32/);
  assert.doesNotMatch(security, /crypto\.subtle|deriveBits/);
  assert.match(vite, /compatibility_flags: \["nodejs_compat"\]/);
  assert.deepEqual(JSON.parse(wrangler).compatibility_flags, ["nodejs_compat"]);
});
