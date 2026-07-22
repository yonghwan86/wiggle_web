export const mvp3FamilyLegacyStatements = [
  `DROP TABLE IF EXISTS family_share_artworks__guardian`,
  `DROP TABLE IF EXISTS family_share_links__guardian`,
  `CREATE TABLE family_share_links__guardian (id TEXT PRIMARY KEY NOT NULL, teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE, scope TEXT NOT NULL, approval_kind TEXT NOT NULL, guardian_consent_at TEXT NOT NULL, consent_method TEXT NOT NULL, attested_by_teacher_id TEXT NOT NULL REFERENCES teachers(id), report_start_at TEXT NOT NULL, report_end_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, view_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE family_share_artworks__guardian (link_id TEXT NOT NULL REFERENCES family_share_links__guardian(id) ON DELETE CASCADE, artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE, position INTEGER NOT NULL, approved_at TEXT NOT NULL, PRIMARY KEY(link_id, artwork_id), UNIQUE(link_id, position))`,
  `INSERT INTO family_share_links__guardian(id, teacher_id, student_id, scope, approval_kind, guardian_consent_at, consent_method, attested_by_teacher_id, report_start_at, report_end_at, expires_at, revoked_at, view_count, created_at, updated_at)
    SELECT id, teacher_id, student_id, scope, 'legacy_invalid', '', 'legacy_invalid', teacher_id, report_start_at, report_end_at, expires_at, COALESCE(revoked_at, CURRENT_TIMESTAMP), view_count, created_at, updated_at FROM family_share_links`,
  `INSERT INTO family_share_artworks__guardian(link_id, artwork_id, position, approved_at) SELECT link_id, artwork_id, position, approved_at FROM family_share_artworks`,
  `DROP TABLE IF EXISTS family_share_invites`,
  `DROP TABLE IF EXISTS family_share_sessions`,
  `DROP TABLE family_share_artworks`,
  `DROP TABLE family_share_links`,
  `ALTER TABLE family_share_links__guardian RENAME TO family_share_links`,
  `ALTER TABLE family_share_artworks__guardian RENAME TO family_share_artworks`,
  `CREATE TABLE family_share_invites (token_hash TEXT PRIMARY KEY NOT NULL, link_id TEXT NOT NULL REFERENCES family_share_links(id) ON DELETE CASCADE, kind TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT, consumed_session_hash TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE family_share_sessions (token_hash TEXT PRIMARY KEY NOT NULL, link_id TEXT NOT NULL REFERENCES family_share_links(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, last_used_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX family_share_teacher_idx ON family_share_links(teacher_id, created_at)`,
  `CREATE INDEX family_share_student_idx ON family_share_links(student_id, expires_at)`,
  `CREATE UNIQUE INDEX family_invite_session_uq ON family_share_invites(consumed_session_hash)`,
  `CREATE INDEX family_invite_link_idx ON family_share_invites(link_id, expires_at)`,
  `CREATE INDEX family_session_link_idx ON family_share_sessions(link_id, expires_at)`,
  `CREATE UNIQUE INDEX family_share_position_uq ON family_share_artworks(link_id, position)`,
  `CREATE INDEX family_share_artwork_idx ON family_share_artworks(artwork_id)`,
];

export const mvp3EntitlementLegacyStatements = [
  `ALTER TABLE subscription_entitlements ADD COLUMN provider_event_at TEXT`,
  `ALTER TABLE subscription_entitlements ADD COLUMN provider_event_id TEXT`,
];

export const mvp3WebhookLegacyStatements = [
  `DROP TABLE IF EXISTS subscription_webhook_events__ordered`,
  `CREATE TABLE subscription_webhook_events__ordered (provider TEXT NOT NULL, event_id TEXT NOT NULL, payload_hash TEXT NOT NULL, occurred_at TEXT NOT NULL, signature_verified INTEGER NOT NULL, stale INTEGER NOT NULL DEFAULT 0, processed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(provider, event_id))`,
  `INSERT INTO subscription_webhook_events__ordered(provider, event_id, payload_hash, occurred_at, signature_verified, stale, processed_at, created_at)
    SELECT provider, event_id, payload_hash, created_at, signature_verified, CASE WHEN processed_at IS NULL THEN 0 ELSE 1 END, processed_at, created_at FROM subscription_webhook_events`,
  `DROP TABLE subscription_webhook_events`,
  `ALTER TABLE subscription_webhook_events__ordered RENAME TO subscription_webhook_events`,
];
