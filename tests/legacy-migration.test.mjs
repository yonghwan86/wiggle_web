import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const wrangler = join(project, "node_modules", "wrangler", "bin", "wrangler.js");
const config = join(project, "wrangler.local.jsonc");
const migration = join(project, "drizzle", "0001_artwork_mutations_composite_pk.sql");

function runWrangler(state, envRoot, args) {
  const result = spawnSync(process.execPath, [wrangler, "d1", "execute", "DB", "--local", "--config", config, "--persist-to", state, ...args], {
    cwd: project,
    encoding: "utf8",
    env: {
      ...process.env,
      WRANGLER_WRITE_LOGS: "false",
      WRANGLER_LOG_PATH: join(envRoot, "logs"),
      MINIFLARE_REGISTRY_PATH: join(envRoot, "registry"),
      XDG_CONFIG_HOME: envRoot,
    },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test("legacy global request key upgrades without data loss and replays per artwork", async () => {
  const root = await mkdtemp(join(tmpdir(), "wiggle-legacy-migration-"));
  const state = join(root, "state");
  await Promise.all([mkdir(join(root, "logs")), mkdir(join(root, "registry"))]);
  const setup = join(root, "legacy.sql");
  await writeFile(setup, `
    CREATE TABLE student_profiles (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE artworks (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE artwork_mutations (
      request_id TEXT PRIMARY KEY NOT NULL,
      artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
      result_revision INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX artwork_mutations_artwork_idx ON artwork_mutations(artwork_id, created_at);
    INSERT INTO student_profiles(id) VALUES ('student_one');
    INSERT INTO artworks(id) VALUES ('artwork_a'), ('artwork_b');
    INSERT INTO artwork_mutations(request_id, artwork_id, student_id, result_revision)
      VALUES ('request_shared', 'artwork_a', 'student_one', 1);
  `, "utf8");

  try {
    runWrangler(state, root, ["--file", setup]);
    runWrangler(state, root, ["--file", migration]);
    const output = runWrangler(state, root, ["--command", `
      INSERT INTO artwork_mutations(request_id, artwork_id, student_id, result_revision)
        VALUES ('request_shared', 'artwork_b', 'student_one', 2);
      SELECT request_id AS requestId, artwork_id AS artworkId, result_revision AS resultRevision
        FROM artwork_mutations WHERE student_id = 'student_one' ORDER BY artwork_id;
      SELECT result_revision AS resultRevision FROM artwork_mutations
        WHERE request_id = 'request_shared' AND artwork_id = 'artwork_b' AND student_id = 'student_one';
    `, "--json"]);
    const results = JSON.parse(output);
    assert.deepEqual(results.at(-2).results, [
      { requestId: "request_shared", artworkId: "artwork_a", resultRevision: 1 },
      { requestId: "request_shared", artworkId: "artwork_b", resultRevision: 2 },
    ]);
    assert.deepEqual(results.at(-1).results, [{ resultRevision: 2 }]);

    const route = await readFile(join(project, "app", "api", "artworks", "[id]", "route.ts"), "utf8");
    assert.match(route, /if \(previousRequest\) return noStoreJson\(\{ ok: true, revision: previousRequest\.resultRevision, duplicate: true \}\)/);

    // A second migration run is intentionally safe and preserves both scoped keys.
    runWrangler(state, root, ["--file", migration]);
    const rerun = JSON.parse(runWrangler(state, root, ["--command", "SELECT COUNT(*) AS count FROM artwork_mutations WHERE request_id = 'request_shared'", "--json"]));
    assert.equal(rerun.at(-1).results[0].count, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
