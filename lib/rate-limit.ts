// 검사와 증가를 한 문장으로 처리한다. 읽은 뒤 따로 증가시키면 동시 요청이 모두
// 증가 전 count를 읽어 상한을 넘겨 통과한다(무차별 대입 방어선이 무력화된다).
const CONSUME_SQL = `INSERT INTO rate_limits(key, count, window_ends_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_ends_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
       window_ends_at = CASE WHEN rate_limits.window_ends_at <= ? THEN ? ELSE rate_limits.window_ends_at END
     RETURNING count`;

export async function consumeRateLimit(DB: D1Database, key: string, max: number, seconds: number, now = new Date()) {
  const at = now.toISOString();
  const ends = new Date(now.getTime() + seconds * 1000).toISOString();
  const row = await DB.prepare(CONSUME_SQL).bind(key, ends, at, at, ends).first<{ count: number }>();
  return (row?.count ?? 1) <= max;
}

// 성공한 인증은 시도 카운터를 비운다. 대상 단위 한도가 무차별 대입만 막고
// 같은 태블릿을 정상적으로 여러 번 여는 아이를 잠그지 않게 한다.
export async function releaseRateLimit(DB: D1Database, key: string) {
  await DB.prepare(`DELETE FROM rate_limits WHERE key = ?`).bind(key).run();
}
