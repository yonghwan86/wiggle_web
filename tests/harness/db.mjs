/**
 * 통합 테스트용 D1 호환 DB 하네스 (Miniflare `d1Databases` 대체).
 *
 * 예전에는 Miniflare가 워커를 부팅해 D1을 내줬지만, Vercel 재플랫폼 뒤로는 실행 경로가
 * Next + Turso(libSQL)다. 테스트도 같은 어댑터를 통과해야 어댑터 계약(batch 원자성,
 * meta.changes, PRAGMA 재작성)이 실제로 검증된다.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTursoClientFromUrl, TursoD1 } from "../../db/adapters/turso-d1.ts";
import { provisionSchema } from "../../db/runtime.ts";

// 파일 DB만 쓰는 이유: 서버 프로세스와 테스트가 같은 DB를 봐야 하고, :memory:는
// 연결마다 별개 DB라 그 공유가 성립하지 않는다. 단독 DB가 필요한 테스트도 같은 함수를 쓴다.
export async function createTestDb({ url } = {}) {
  let directory;
  let databaseUrl = url;
  if (!databaseUrl) {
    directory = await mkdtemp(path.join(tmpdir(), "wiggle-test-db-"));
    databaseUrl = `file:${path.join(directory, "test.db")}`;
  }
  const client = createTursoClientFromUrl(databaseUrl);
  const DB = new TursoD1(client);
  return {
    DB,
    url: databaseUrl,
    async dispose() {
      client.close();
      if (directory) await removeQuietly(directory);
    },
  };
}

// Windows는 close() 직후에도 잠깐 파일 핸들을 붙들고 있어 unlink가 EBUSY로 튄다.
// 임시 디렉터리 삭제는 검증 대상이 아니므로 몇 번 재시도한 뒤 조용히 포기한다.
async function removeQuietly(directory) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

// 앱이 실제로 쓰는 스키마 전체를 세운다 (ensureSchema와 같은 정본 경로).
export async function createSchemaDb(options) {
  const handle = await createTestDb(options);
  await provisionSchema(handle.DB);
  return handle;
}

// 테스트 사이에 행만 비운다 (스키마는 유지). 서버를 다시 띄우지 않고 격리를 만든다.
export async function resetRows(DB) {
  const tables = await DB.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  ).all();
  const names = tables.results.map((row) => row.name);
  if (!names.length) return;
  await DB.batch([
    DB.prepare("PRAGMA defer_foreign_keys = ON"),
    ...names.map((name) => DB.prepare(`DELETE FROM "${name}"`)),
  ]);
}
