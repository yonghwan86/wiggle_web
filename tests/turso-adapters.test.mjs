import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { FsArtworksStore } from "../db/adapters/artworks-store.ts";
import { createTursoClientFromUrl, TursoD1 } from "../db/adapters/turso-d1.ts";

// D1 → Turso 어댑터 계약 테스트. CAS 가드 10곳이 의존하는 meta.changes와
// batch 원자성은 문자열 검사가 아니라 실제 libsql 실행으로 고정한다.

function freshDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "wiggle-turso-"));
  const client = createTursoClientFromUrl(`file:${path.join(dir, "test.db").replaceAll("\\", "/")}`);
  return new TursoD1(client);
}

test("run() reports per-statement meta.changes like D1", async () => {
  const db = freshDb();
  await db.prepare(`CREATE TABLE items (id TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL)`).run();
  const inserted = await db.prepare(`INSERT INTO items(id, label) VALUES (?, ?)`).bind("a", "하나").run();
  assert.equal(inserted.meta.changes, 1);
  assert.equal(inserted.success, true);

  const missed = await db.prepare(`UPDATE items SET label = ? WHERE id = ?`).bind("고침", "없는-행").run();
  assert.equal(missed.meta.changes, 0, "CAS 가드는 영향 0행을 정확히 봐야 한다");

  const ignored = await db.prepare(`INSERT OR IGNORE INTO items(id, label) VALUES (?, ?)`).bind("a", "중복").run();
  assert.equal(ignored.meta.changes, 0, "INSERT OR IGNORE 중복은 changes 0");
});

test("first() returns a plain named object or null, all() returns results[]", async () => {
  const db = freshDb();
  await db.prepare(`CREATE TABLE pets (id TEXT PRIMARY KEY NOT NULL, born INTEGER NOT NULL)`).run();
  await db.prepare(`INSERT INTO pets(id, born) VALUES ('토끼', 3), ('여우', 8)`).run();

  const row = await db.prepare(`SELECT id, born FROM pets WHERE id = ?`).bind("토끼").first();
  assert.deepEqual(row, { id: "토끼", born: 3 });
  assert.equal(typeof row.born, "number", "intMode number — BigInt가 새면 JSON 직렬화가 깨진다");

  const none = await db.prepare(`SELECT id FROM pets WHERE id = ?`).bind("없음").first();
  assert.equal(none, null);

  const all = await db.prepare(`SELECT id FROM pets ORDER BY born`).all();
  assert.deepEqual(all.results, [{ id: "토끼" }, { id: "여우" }]);
});

test("batch() is atomic: a failing statement rolls back the whole batch", async () => {
  const db = freshDb();
  await db.prepare(`CREATE TABLE ledger (id TEXT PRIMARY KEY NOT NULL, amount INTEGER NOT NULL)`).run();
  await db.prepare(`INSERT INTO ledger(id, amount) VALUES ('base', 1)`).run();

  await assert.rejects(
    db.batch([
      db.prepare(`INSERT INTO ledger(id, amount) VALUES (?, ?)`).bind("new-row", 5),
      db.prepare(`UPDATE ledger SET amount = amount + 1 WHERE id = ?`).bind("base"),
      db.prepare(`INSERT INTO ledger(id, amount) VALUES (?, ?)`).bind("base", 9),
    ]),
    /UNIQUE|PRIMARY/i,
  );

  const count = await db.prepare(`SELECT COUNT(*) AS n FROM ledger`).first();
  assert.equal(count.n, 1, "실패한 batch의 앞 문장들이 남으면 D1 원자성 계약 위반");
  const base = await db.prepare(`SELECT amount FROM ledger WHERE id = 'base'`).first();
  assert.equal(base.amount, 1);
});

test("batch() returns per-statement results in order with changes mapping", async () => {
  const db = freshDb();
  await db.prepare(`CREATE TABLE seats (id TEXT PRIMARY KEY NOT NULL, taken INTEGER NOT NULL DEFAULT 0)`).run();
  await db.prepare(`INSERT INTO seats(id) VALUES ('s1'), ('s2')`).run();

  const results = await db.batch([
    db.prepare(`UPDATE seats SET taken = 1 WHERE id = ? AND taken = 0`).bind("s1"),
    db.prepare(`UPDATE seats SET taken = 1 WHERE id = ? AND taken = 0`).bind("없는-좌석"),
    db.prepare(`SELECT COUNT(*) AS n FROM seats WHERE taken = 1`),
  ]);
  assert.equal(results.length, 3);
  assert.equal(results[0].meta.changes, 1);
  assert.equal(results[1].meta.changes, 0, "join CAS 분기가 의존하는 문장별 changes");
  assert.deepEqual(results[2].results, [{ n: 1 }]);
});

test("PRAGMA table_info is rewritten to pragma_table_info() with the same row shape", async () => {
  const db = freshDb();
  await db.prepare(`CREATE TABLE mutations (request_id TEXT NOT NULL, artwork_id TEXT NOT NULL, PRIMARY KEY(artwork_id, request_id))`).run();
  const info = await db.prepare(`PRAGMA table_info(mutations)`).all();
  const names = info.results.map((column) => column.name);
  assert.deepEqual(names.sort(), ["artwork_id", "request_id"]);
  const primaryKey = info.results
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => column.name);
  assert.deepEqual(primaryKey, ["artwork_id", "request_id"], "ensureSchema 업그레이드 경로가 쓰는 pk 순서");

  const definition = await db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).bind("mutations").first();
  assert.match(definition.sql, /PRIMARY KEY\(artwork_id, request_id\)/);
});

test("FsArtworksStore round-trips bytes with metadata and rejects unsafe keys", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wiggle-store-"));
  const store = new FsArtworksStore(dir);
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

  await store.put("students/s1/artworks/a1/final.png", bytes, {
    httpMetadata: { contentType: "image/png", cacheControl: "private, max-age=300" },
    customMetadata: { studentId: "s1", kind: "final" },
  });

  const object = await store.get("students/s1/artworks/a1/final.png");
  assert.ok(object);
  assert.equal(object.size, bytes.byteLength);
  assert.equal(object.httpMetadata.contentType, "image/png");
  assert.equal(object.customMetadata.kind, "final");
  assert.deepEqual(new Uint8Array(await object.arrayBuffer()), bytes);

  await store.delete("students/s1/artworks/a1/final.png");
  assert.equal(await store.get("students/s1/artworks/a1/final.png"), null);

  await assert.rejects(store.get("../escape.png"), /형식/);
  await assert.rejects(store.put("students//double.png", bytes), /형식/);
  await assert.rejects(store.delete("students/./dot.png"), /형식/);
});
