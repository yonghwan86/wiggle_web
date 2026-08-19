import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createTestDb } from "./harness/db.mjs";
import { provisionSchema } from "../db/runtime.ts";

const project = dirname(dirname(fileURLToPath(import.meta.url)));

// 예전에는 wrangler로 drizzle 마이그레이션 SQL을 재생해 확인했지만, 이제 레거시 DB를
// 실제로 업그레이드하는 경로는 부팅 시의 provisionSchema(ensureArtworkMutationPrimaryKey)다.
// 같은 성질을 그 실경로에 대고 검증한다: 전역 유일 request_id 시절의 데이터가 손실 없이
// (artwork_id, student_id, request_id) 복합 키로 옮겨지고, 같은 요청 번호를 다른 작품에
// 재사용할 수 있어야 한다.
test("legacy global request key upgrades without data loss and replays per artwork", async () => {
  const handle = await createTestDb();
  try {
    const { DB } = handle;
    // 현행 스키마를 정본 경로로 세운 뒤, artwork_mutations만 전역 유일 키 시절 모양으로
    // 되돌려 레거시 DB를 재현한다 — 픽스처 DDL을 따로 관리하면 정본과 어긋나기 쉽다.
    await provisionSchema(DB);
    await DB.exec(`
      DROP TABLE artwork_mutations;
      CREATE TABLE artwork_mutations (
        request_id TEXT PRIMARY KEY NOT NULL,
        artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
        result_revision INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX artwork_mutations_artwork_idx ON artwork_mutations(artwork_id, created_at);
      INSERT INTO teachers(id, email, display_name) VALUES ('teacher_one', 'legacy@example.com', '레거시 교사');
      INSERT INTO classrooms(id, teacher_id, display_name, class_code, join_token) VALUES ('class_one', 'teacher_one', '레거시 반', '4777', 'join_legacy');
      INSERT INTO student_profiles(id, classroom_id, nickname, animal, last_activity_at) VALUES ('student_one', 'class_one', '토끼 화가', '🐰', CURRENT_TIMESTAMP);
      INSERT INTO artworks(id, student_id, classroom_id, title, topic, learning_mode) VALUES
        ('artwork_a', 'student_one', 'class_one', '첫 그림', '자유', 'free'),
        ('artwork_b', 'student_one', 'class_one', '둘째 그림', '자유', 'free');
      INSERT INTO artwork_mutations(request_id, artwork_id, student_id, result_revision)
        VALUES ('request_shared', 'artwork_a', 'student_one', 1);
    `);

    await provisionSchema(DB);

    await DB.prepare(`INSERT INTO artwork_mutations(request_id, artwork_id, student_id, result_revision)
      VALUES ('request_shared', 'artwork_b', 'student_one', 2)`).run();
    const rows = await DB.prepare(`SELECT request_id AS requestId, artwork_id AS artworkId, result_revision AS resultRevision
      FROM artwork_mutations WHERE student_id = 'student_one' ORDER BY artwork_id`).all();
    assert.deepEqual(rows.results, [
      { requestId: "request_shared", artworkId: "artwork_a", resultRevision: 1 },
      { requestId: "request_shared", artworkId: "artwork_b", resultRevision: 2 },
    ]);
    const replay = await DB.prepare(`SELECT result_revision AS resultRevision FROM artwork_mutations
      WHERE request_id = 'request_shared' AND artwork_id = 'artwork_b' AND student_id = 'student_one'`).first();
    assert.deepEqual(replay, { resultRevision: 2 });

    const route = await readFile(join(project, "app", "api", "artworks", "[id]", "route.ts"), "utf8");
    assert.match(route, /if \(previousRequest\) return noStoreJson\(\{ ok: true, revision: previousRequest\.resultRevision, duplicate: true \}\)/);

    // A second migration run is intentionally safe and preserves both scoped keys.
    await provisionSchema(DB);
    const rerun = await DB.prepare(`SELECT COUNT(*) AS count FROM artwork_mutations WHERE request_id = 'request_shared'`).first();
    assert.equal(rerun.count, 2);
  } finally {
    await handle.dispose();
  }
});
