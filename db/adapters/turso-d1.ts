/**
 * D1 호환 Turso(libSQL) 어댑터.
 *
 * 호출부(38 prepare / 27 run / 20 first / 5 all / 3 batch)는 D1 API 형태를
 * 그대로 쓰므로, 여기서 D1이 보장하던 것을 똑같이 보장해야 한다:
 * - batch()는 전체가 한 트랜잭션(중간 실패 시 전부 롤백)
 * - 결과의 meta.changes는 문장별 영향 행 수 (CAS 가드 10곳이 의존)
 * - PRAGMA table_info는 Turso HTTP 경로에서 문장형 PRAGMA가 막힐 수 있어
 *   같은 행 형태를 돌려주는 pragma_table_info() 테이블 함수로 바꿔 실행한다.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client, type InStatement, type InValue, type ResultSet, type Row } from "@libsql/client";

export type D1LikeResult<T = unknown> = {
  results: T[];
  success: true;
  meta: { changes: number; last_row_id: number; duration: number; rows_read: number; rows_written: number };
};

const TABLE_INFO_PATTERN = /^\s*PRAGMA\s+table_info\(\s*([A-Za-z0-9_]+)\s*\)\s*;?\s*$/i;

function normalizeSql(sql: string): string {
  const tableInfo = TABLE_INFO_PATTERN.exec(sql);
  if (tableInfo) return `SELECT cid, name, type, "notnull", dflt_value, pk FROM pragma_table_info('${tableInfo[1]}')`;
  return sql;
}

function rowToObject(columns: string[], row: Row): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (let index = 0; index < columns.length; index += 1) value[columns[index]] = row[index];
  return value;
}

function toD1Result<T>(resultSet: ResultSet): D1LikeResult<T> {
  return {
    results: resultSet.rows.map((row) => rowToObject(resultSet.columns, row) as T),
    success: true,
    meta: {
      changes: resultSet.rowsAffected,
      last_row_id: Number(resultSet.lastInsertRowid ?? 0),
      duration: 0,
      rows_read: 0,
      rows_written: resultSet.rowsAffected,
    },
  };
}

export class TursoPreparedStatement {
  private readonly client: Client;
  private readonly sql: string;
  private readonly args: InValue[];

  constructor(client: Client, sql: string, args: InValue[] = []) {
    this.client = client;
    this.sql = sql;
    this.args = args;
  }

  bind(...values: InValue[]): TursoPreparedStatement {
    return new TursoPreparedStatement(this.client, this.sql, values);
  }

  toInStatement(): InStatement {
    return { sql: normalizeSql(this.sql), args: this.args };
  }

  async first<T = unknown>(): Promise<T | null> {
    const resultSet = await this.client.execute(this.toInStatement());
    const row = resultSet.rows[0];
    return row === undefined ? null : (rowToObject(resultSet.columns, row) as T);
  }

  async all<T = unknown>(): Promise<D1LikeResult<T>> {
    return toD1Result<T>(await this.client.execute(this.toInStatement()));
  }

  async run<T = unknown>(): Promise<D1LikeResult<T>> {
    return toD1Result<T>(await this.client.execute(this.toInStatement()));
  }
}

export class TursoD1 {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  prepare(sql: string): TursoPreparedStatement {
    return new TursoPreparedStatement(this.client, sql);
  }

  async batch(statements: TursoPreparedStatement[]): Promise<D1LikeResult[]> {
    const resultSets = await this.client.batch(
      statements.map((statement) => statement.toInStatement()),
      "write",
    );
    return resultSets.map((resultSet) => toD1Result(resultSet));
  }

  async exec(sql: string): Promise<void> {
    await this.client.executeMultiple(sql);
  }
}

export function createTursoClientFromUrl(url: string, authToken?: string): Client {
  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }
  // intMode number: D1도 정수를 JS number로 돌려준다. BigInt가 새면 JSON 직렬화가 깨진다.
  return createClient({ url, authToken, intMode: "number" });
}

export function createTursoD1(): TursoD1 {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) return new TursoD1(createTursoClientFromUrl(url, process.env.TURSO_AUTH_TOKEN));
  if (process.env.NODE_ENV === "production") throw new Error("TURSO_DATABASE_URL이 설정되지 않았어요.");
  return new TursoD1(createTursoClientFromUrl("file:.data/wiggle-local.db"));
}
