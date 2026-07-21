import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

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
