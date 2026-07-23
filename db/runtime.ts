import { env } from "cloudflare:workers";
import { upgradeMvp3Schema } from "@/lib/mvp3-schema-upgrade";

export interface WiggleEnv {
  DB: D1Database;
  ARTWORKS: R2Bucket;
  WHISPER_RELAY?: Fetcher;
}

export function bindings(): WiggleEnv {
  const value = env as unknown as Partial<WiggleEnv>;
  if (!value.DB) throw new Error("D1 binding DB가 연결되지 않았어요.");
  if (!value.ARTWORKS) throw new Error("R2 binding ARTWORKS가 연결되지 않았어요.");
  return value as WiggleEnv;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS teachers (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, credential_hash TEXT, credential_salt TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS teacher_sessions (token_hash TEXT PRIMARY KEY NOT NULL, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, last_used_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS classrooms (id TEXT PRIMARY KEY NOT NULL, teacher_id TEXT NOT NULL REFERENCES teachers(id), display_name TEXT NOT NULL, class_code TEXT NOT NULL UNIQUE, join_token TEXT NOT NULL UNIQUE, admission_open INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1, current_activity TEXT NOT NULL DEFAULT '자유롭게 그리기', starts_at TEXT, ends_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS student_profiles (id TEXT PRIMARY KEY NOT NULL, classroom_id TEXT NOT NULL REFERENCES classrooms(id), nickname TEXT NOT NULL, animal TEXT NOT NULL, last_activity_at TEXT NOT NULL, archived_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS recovery_credentials (student_id TEXT PRIMARY KEY NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE, picture_hash TEXT NOT NULL, picture_salt TEXT NOT NULL, personal_qr_hash TEXT NOT NULL, reset_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS device_sessions (token_hash TEXT PRIMARY KEY NOT NULL, student_id TEXT NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, last_used_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS artworks (id TEXT PRIMARY KEY NOT NULL, student_id TEXT NOT NULL REFERENCES student_profiles(id), classroom_id TEXT NOT NULL REFERENCES classrooms(id), title TEXT NOT NULL, topic TEXT NOT NULL, learning_mode TEXT NOT NULL, lesson_slug TEXT, intent TEXT NOT NULL DEFAULT '', ops_json TEXT NOT NULL DEFAULT '[]', schema_version INTEGER NOT NULL DEFAULT 1, renderer_version INTEGER NOT NULL DEFAULT 1, revision INTEGER NOT NULL DEFAULT 0, current_step INTEGER NOT NULL DEFAULT 0, version_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'drawing', thumbnail_key TEXT, final_image_key TEXT, last_mutation_id TEXT, completed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS artwork_versions (id TEXT PRIMARY KEY NOT NULL, artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE, sequence INTEGER NOT NULL, ops_json TEXT NOT NULL, image_key TEXT, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(artwork_id, sequence))`,
  `CREATE TABLE IF NOT EXISTS artwork_mutations (request_id TEXT NOT NULL, artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE, result_revision INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(artwork_id, student_id, request_id))`,
  `CREATE TABLE IF NOT EXISTS coaching_events (id TEXT PRIMARY KEY NOT NULL, artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE, actor TEXT NOT NULL, question TEXT NOT NULL, student_answer TEXT, applied_hint TEXT, before_version_id TEXT, after_version_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS coaching_event_details (event_id TEXT PRIMARY KEY NOT NULL REFERENCES coaching_events(id) ON DELETE CASCADE, response_kind TEXT NOT NULL, choices_json TEXT NOT NULL DEFAULT '[]', guide_steps_json TEXT NOT NULL DEFAULT '[]', new_elements_json TEXT NOT NULL DEFAULT '[]', growth_event TEXT, current_step INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS reflections (artwork_id TEXT PRIMARY KEY NOT NULL REFERENCES artworks(id) ON DELETE CASCADE, favorite_part TEXT NOT NULL, favorite_reason TEXT NOT NULL, spoken_description TEXT NOT NULL DEFAULT '', story_text TEXT NOT NULL DEFAULT '', next_suggestion TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS teacher_messages (id TEXT PRIMARY KEY NOT NULL, classroom_id TEXT NOT NULL REFERENCES classrooms(id), student_id TEXT REFERENCES student_profiles(id), teacher_id TEXT NOT NULL REFERENCES teachers(id), body TEXT NOT NULL, reference_url TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS message_receipts (message_id TEXT NOT NULL REFERENCES teacher_messages(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE, seen_at TEXT NOT NULL, PRIMARY KEY(message_id, student_id))`,
  `CREATE TABLE IF NOT EXISTS teacher_views (teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE, classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(teacher_id, student_id))`,
  `CREATE TABLE IF NOT EXISTS teacher_coaching_drafts (id TEXT PRIMARY KEY NOT NULL, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE, classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE, artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE, body TEXT NOT NULL, observation TEXT NOT NULL, next_action TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', approved_message_id TEXT REFERENCES teacher_messages(id), approved_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, window_ends_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS family_share_links (id TEXT PRIMARY KEY NOT NULL, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE, scope TEXT NOT NULL, approval_kind TEXT NOT NULL, guardian_consent_at TEXT NOT NULL, consent_method TEXT NOT NULL, attested_by_teacher_id TEXT NOT NULL REFERENCES teachers(id), report_start_at TEXT NOT NULL, report_end_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, view_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS family_share_invites (token_hash TEXT PRIMARY KEY NOT NULL, link_id TEXT NOT NULL REFERENCES family_share_links(id) ON DELETE CASCADE, kind TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT, consumed_session_hash TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS family_share_sessions (token_hash TEXT PRIMARY KEY NOT NULL, link_id TEXT NOT NULL REFERENCES family_share_links(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, last_used_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS family_share_artworks (link_id TEXT NOT NULL REFERENCES family_share_links(id) ON DELETE CASCADE, artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE, position INTEGER NOT NULL, approved_at TEXT NOT NULL, PRIMARY KEY(link_id, artwork_id), UNIQUE(link_id, position))`,
  `CREATE TABLE IF NOT EXISTS subscription_entitlements (teacher_id TEXT PRIMARY KEY NOT NULL REFERENCES teachers(id) ON DELETE CASCADE, plan_code TEXT NOT NULL DEFAULT 'free', status TEXT NOT NULL DEFAULT 'disabled', provider TEXT, external_customer_ref TEXT, external_subscription_ref TEXT, current_period_end TEXT, provider_event_at TEXT, provider_event_id TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS subscription_webhook_events (provider TEXT NOT NULL, event_id TEXT NOT NULL, payload_hash TEXT NOT NULL, occurred_at TEXT NOT NULL, signature_verified INTEGER NOT NULL, stale INTEGER NOT NULL DEFAULT 0, processed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(provider, event_id))`,
  `CREATE INDEX IF NOT EXISTS teacher_sessions_teacher_idx ON teacher_sessions(teacher_id, expires_at)`,
  `CREATE INDEX IF NOT EXISTS students_classroom_idx ON student_profiles(classroom_id, last_activity_at)`,
  `CREATE INDEX IF NOT EXISTS device_sessions_student_idx ON device_sessions(student_id, expires_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS recovery_personal_qr_uq ON recovery_credentials(personal_qr_hash)`,
  `CREATE INDEX IF NOT EXISTS artworks_student_idx ON artworks(student_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS artworks_classroom_idx ON artworks(classroom_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS artwork_mutations_artwork_idx ON artwork_mutations(artwork_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS coaching_details_status_idx ON coaching_event_details(status, updated_at)`,
  `CREATE INDEX IF NOT EXISTS messages_classroom_idx ON teacher_messages(classroom_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS message_receipts_student_idx ON message_receipts(student_id, seen_at)`,
  `CREATE INDEX IF NOT EXISTS teacher_views_student_idx ON teacher_views(student_id, expires_at)`,
  `CREATE INDEX IF NOT EXISTS teacher_drafts_owner_idx ON teacher_coaching_drafts(teacher_id, classroom_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS teacher_drafts_student_idx ON teacher_coaching_drafts(student_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS family_share_teacher_idx ON family_share_links(teacher_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS family_share_student_idx ON family_share_links(student_id, expires_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS family_invite_session_uq ON family_share_invites(consumed_session_hash)`,
  `CREATE INDEX IF NOT EXISTS family_invite_link_idx ON family_share_invites(link_id, expires_at)`,
  `CREATE INDEX IF NOT EXISTS family_session_link_idx ON family_share_sessions(link_id, expires_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS family_share_position_uq ON family_share_artworks(link_id, position)`,
  `CREATE INDEX IF NOT EXISTS family_share_artwork_idx ON family_share_artworks(artwork_id)`,
];

const expectedMutationPrimaryKey = ["artwork_id", "student_id", "request_id"];
const mutationTableReplacement = "artwork_mutations__composite_pk";

type TableColumn = { name: string; pk: number };

async function mutationTableShape(DB: D1Database, tableName = "artwork_mutations") {
  const [columns, definition] = await Promise.all([
    DB.prepare(`PRAGMA table_info(${tableName})`).all<TableColumn>(),
    DB.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).bind(tableName).first<{ sql: string }>(),
  ]);
  const primaryKey = columns.results
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => column.name);
  return { columns: columns.results, definition: definition?.sql ?? "", primaryKey };
}

async function ensureArtworkMutationPrimaryKey(DB: D1Database) {
  const shape = await mutationTableShape(DB);
  if (!shape.definition) return;

  const hasExpectedPrimaryKey = expectedMutationPrimaryKey.every((column, index) => shape.primaryKey[index] === column)
    && shape.primaryKey.length === expectedMutationPrimaryKey.length;
  const definitionHasExpectedKey = /PRIMARY\s+KEY\s*\(\s*[`"]?artwork_id[`"]?\s*,\s*[`"]?student_id[`"]?\s*,\s*[`"]?request_id[`"]?\s*\)/i.test(shape.definition);
  if (hasExpectedPrimaryKey && definitionHasExpectedKey) return;

  const requiredColumns = ["request_id", "artwork_id", "student_id", "result_revision"];
  if (!requiredColumns.every((name) => shape.columns.some((column) => column.name === name))) {
    throw new Error("artwork_mutations 테이블 구조를 안전하게 업그레이드할 수 없어요.");
  }
  const createdAtExpression = shape.columns.some((column) => column.name === "created_at") ? "created_at" : "CURRENT_TIMESTAMP";

  // D1 batch is atomic: the legacy table remains intact if any replacement step fails.
  await DB.batch([
    DB.prepare(`DROP TABLE IF EXISTS ${mutationTableReplacement}`),
    DB.prepare(`CREATE TABLE ${mutationTableReplacement} (request_id TEXT NOT NULL, artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE, result_revision INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(artwork_id, student_id, request_id))`),
    DB.prepare(`INSERT OR IGNORE INTO ${mutationTableReplacement}(request_id, artwork_id, student_id, result_revision, created_at) SELECT request_id, artwork_id, student_id, result_revision, ${createdAtExpression} FROM artwork_mutations`),
    DB.prepare(`DROP INDEX IF EXISTS artwork_mutations_artwork_idx`),
    DB.prepare(`DROP TABLE artwork_mutations`),
    DB.prepare(`ALTER TABLE ${mutationTableReplacement} RENAME TO artwork_mutations`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS artwork_mutations_artwork_idx ON artwork_mutations(artwork_id, created_at)`),
  ]);

  const upgraded = await mutationTableShape(DB);
  const upgradedPrimaryKey = upgraded.primaryKey.join(",");
  const index = await DB.prepare(`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'artwork_mutations_artwork_idx'`).first<{ sql: string }>();
  if (upgradedPrimaryKey !== expectedMutationPrimaryKey.join(",") || !index?.sql) {
    throw new Error("artwork_mutations 복합 기본키 업그레이드를 확인하지 못했어요.");
  }
}

let ready: Promise<void> | undefined;

export async function ensureSchema() {
  if (!ready) {
    const { DB } = bindings();
    ready = (async () => {
      await DB.batch(schemaStatements.map((statement) => DB.prepare(statement)));
      await upgradeMvp3Schema(DB);
      const artworkColumns = await DB.prepare(`PRAGMA table_info(artworks)`).all<{ name: string }>();
      if (!artworkColumns.results.some((column) => column.name === "last_mutation_id")) await DB.prepare(`ALTER TABLE artworks ADD COLUMN last_mutation_id TEXT`).run();
      if (!artworkColumns.results.some((column) => column.name === "lesson_slug")) await DB.prepare(`ALTER TABLE artworks ADD COLUMN lesson_slug TEXT`).run();
      const studentColumns = await DB.prepare(`PRAGMA table_info(student_profiles)`).all<{ name: string }>();
      if (!studentColumns.results.some((column) => column.name === "archived_at")) await DB.prepare(`ALTER TABLE student_profiles ADD COLUMN archived_at TEXT`).run();
      await DB.prepare(`CREATE INDEX IF NOT EXISTS students_classroom_archived_idx ON student_profiles(classroom_id, archived_at, nickname)`).run();
      await ensureArtworkMutationPrimaryKey(DB);
    })();
  }
  return ready;
}
