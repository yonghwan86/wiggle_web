type TableColumn = { name: string };
import {
  mvp3EntitlementLegacyStatements,
  mvp3FamilyLegacyStatements,
  mvp3WebhookLegacyStatements,
} from "./mvp3-schema-upgrade-statements.mjs";
export { mvp3EntitlementLegacyStatements, mvp3FamilyLegacyStatements, mvp3WebhookLegacyStatements };

async function columns(DB: D1Database, table: string) {
  return (await DB.prepare(`PRAGMA table_info(${table})`).all<TableColumn>()).results.map((column) => column.name);
}

export async function upgradeMvp3Schema(DB: D1Database) {
  const familyColumns = await columns(DB, "family_share_links");
  if (familyColumns.includes("token_hash") || !familyColumns.includes("guardian_consent_at")) {
    await DB.batch(mvp3FamilyLegacyStatements.map((statement) => DB.prepare(statement)));
  }

  const entitlementColumns = await columns(DB, "subscription_entitlements");
  const missingEntitlementStatements = mvp3EntitlementLegacyStatements.filter((statement) => {
    const match = /ADD COLUMN ([a-z_]+)/.exec(statement);
    return match && !entitlementColumns.includes(match[1]);
  });
  if (missingEntitlementStatements.length) await DB.batch(missingEntitlementStatements.map((statement) => DB.prepare(statement)));

  const webhookColumns = await columns(DB, "subscription_webhook_events");
  if (!webhookColumns.includes("occurred_at") || !webhookColumns.includes("stale")) {
    await DB.batch(mvp3WebhookLegacyStatements.map((statement) => DB.prepare(statement)));
  }
}
