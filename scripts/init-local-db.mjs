// 로컬 개발용 DB를 만들고 앱 스키마를 세운다.
// 앱이 dev에서 쓰는 것과 같은 파일(.data/wiggle-local.db)에 같은 정본 경로(provisionSchema)로
// 세우므로, 여기서 만든 DB를 `npm run dev`가 그대로 이어 쓴다.
// 사실 첫 API 호출 때 ensureSchema가 알아서 만들지만, 새로 클론한 뒤 상태를 눈으로
// 확인하고 싶을 때를 위해 남겨 둔다.
import { createTursoClientFromUrl, TursoD1 } from "../db/adapters/turso-d1.ts";
import { provisionSchema } from "../db/runtime.ts";

const LOCAL_DATABASE_URL = "file:.data/wiggle-local.db";

if (process.env.TURSO_DATABASE_URL) {
  // 운영 자격증명이 켜져 있는 채로 실행하면 원격 DB를 건드릴 뻔한다 — 여기서 멈춘다.
  console.error("TURSO_DATABASE_URL이 설정되어 있어요. 이 스크립트는 로컬 파일 DB 전용입니다.");
  console.error(".env.local에서 그 값을 '# vercel-only:' 주석으로 돌린 뒤 다시 실행해 주세요.");
  process.exit(1);
}

const client = createTursoClientFromUrl(LOCAL_DATABASE_URL);
const DB = new TursoD1(client);

await provisionSchema(DB);

const tables = await DB.prepare(
  `SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
).first();
const mutationColumns = await DB.prepare(`PRAGMA table_info(artwork_mutations)`).all();
const primaryKey = mutationColumns.results
  .filter((column) => column.pk > 0)
  .sort((left, right) => left.pk - right.pk)
  .map((column) => column.name)
  .join(", ");

console.log(`로컬 DB 준비 완료: ${LOCAL_DATABASE_URL}`);
console.log(`  테이블 ${tables.count}개`);
console.log(`  artwork_mutations 기본키: (${primaryKey})`);
client.close();
