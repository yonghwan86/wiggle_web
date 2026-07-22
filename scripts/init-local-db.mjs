import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  mvp3EntitlementLegacyStatements,
  mvp3FamilyLegacyStatements,
  mvp3WebhookLegacyStatements,
} from "../lib/mvp3-schema-upgrade-statements.mjs";

const project = resolve(import.meta.dirname, "..");
const wranglerRoot = resolve(project, ".wrangler");
mkdirSync(resolve(wranglerRoot, "logs"), { recursive: true });
mkdirSync(resolve(wranglerRoot, "registry"), { recursive: true });
const migrationFiles = readdirSync(resolve(project, "drizzle")).filter((name) => name.endsWith(".sql")).sort();
if (!migrationFiles.length) throw new Error("No D1 migration files found.");
const idempotentSql = migrationFiles.map((name) => readFileSync(resolve(project, "drizzle", name), "utf8"))
  .join("\n")
  .replace(/CREATE TABLE `(.*?)`/g, "CREATE TABLE IF NOT EXISTS `$1`")
  .replace(/CREATE UNIQUE INDEX `(.*?)`/g, "CREATE UNIQUE INDEX IF NOT EXISTS `$1`")
  .replace(/CREATE INDEX `(.*?)`/g, "CREATE INDEX IF NOT EXISTS `$1`");
const localMigration = resolve(wranglerRoot, "local-init.sql");
writeFileSync(localMigration, idempotentSql, "utf8");

const result = spawnSync(process.execPath, [
  resolve(project, "node_modules/wrangler/bin/wrangler.js"),
  "d1", "execute", "DB", "--local",
  "--config", resolve(project, "wrangler.local.jsonc"),
  "--persist-to", resolve(wranglerRoot, "state"),
  "--file", localMigration,
], {
  cwd: project,
  stdio: "inherit",
  env: {
    ...process.env,
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: resolve(wranglerRoot, "logs"),
    MINIFLARE_REGISTRY_PATH: resolve(wranglerRoot, "registry"),
  },
});

if (result.status !== 0) process.exit(result.status ?? 1);

const wranglerEnvironment = {
  ...process.env,
  WRANGLER_WRITE_LOGS: "false",
  WRANGLER_LOG_PATH: resolve(wranglerRoot, "logs"),
  MINIFLARE_REGISTRY_PATH: resolve(wranglerRoot, "registry"),
};

function localColumns(table) {
  const inspected = spawnSync(process.execPath, [
    resolve(project, "node_modules/wrangler/bin/wrangler.js"),
    "d1", "execute", "DB", "--local", "--json",
    "--config", resolve(project, "wrangler.local.jsonc"),
    "--persist-to", resolve(wranglerRoot, "state"),
    "--command", `PRAGMA table_info(${table})`,
  ], { cwd: project, encoding: "utf8", env: wranglerEnvironment });
  if (inspected.status !== 0) {
    process.stderr.write(inspected.stderr || `Unable to inspect ${table}.\n`);
    process.exit(inspected.status ?? 1);
  }
  const payload = JSON.parse(inspected.stdout);
  return payload.flatMap((entry) => entry.results ?? []).map((column) => column.name);
}

const compatibilityStatements = [];
const familyColumns = localColumns("family_share_links");
if (familyColumns.includes("token_hash") || !familyColumns.includes("guardian_consent_at")) compatibilityStatements.push(...mvp3FamilyLegacyStatements);
const entitlementColumns = localColumns("subscription_entitlements");
if (!entitlementColumns.includes("provider_event_at")) compatibilityStatements.push(mvp3EntitlementLegacyStatements[0]);
if (!entitlementColumns.includes("provider_event_id")) compatibilityStatements.push(mvp3EntitlementLegacyStatements[1]);
const webhookColumns = localColumns("subscription_webhook_events");
if (!webhookColumns.includes("occurred_at") || !webhookColumns.includes("stale")) compatibilityStatements.push(...mvp3WebhookLegacyStatements);

if (compatibilityStatements.length) {
  const compatibilityFile = resolve(wranglerRoot, "local-mvp3-compat.sql");
  writeFileSync(compatibilityFile, `${compatibilityStatements.join(";\n")};\n`, "utf8");
  const upgraded = spawnSync(process.execPath, [
    resolve(project, "node_modules/wrangler/bin/wrangler.js"),
    "d1", "execute", "DB", "--local",
    "--config", resolve(project, "wrangler.local.jsonc"),
    "--persist-to", resolve(wranglerRoot, "state"),
    "--file", compatibilityFile,
  ], { cwd: project, stdio: "inherit", env: wranglerEnvironment });
  if (upgraded.status !== 0) process.exit(upgraded.status ?? 1);
}
