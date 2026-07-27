import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const HELP = `Usage:
  npm.cmd run pipeline:ready -- --task "task name" --summary "one line summary"

Prerequisites:
  - current branch starts with claude/
  - working tree is clean
  - docs/agent-handoff/latest.md exists and is committed
`;

function fail(message) {
  console.error(`pipeline:ready: ${message}`);
  process.exit(1);
}

function git(args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: options.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail = error?.stderr?.toString().trim();
    fail(detail || `git ${args.join(" ")} failed`);
  }
}

function parseArgs(argv) {
  const values = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--help" || key === "-h") {
      return { help: true };
    }
    if (!key.startsWith("--")) {
      fail(`unexpected argument: ${key}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`missing value for ${key}`);
    }
    values.set(key, value.trim());
    index += 1;
  }

  return {
    help: false,
    task: values.get("--task"),
    summary: values.get("--summary"),
  };
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(HELP);
  process.exit(0);
}
if (!args.task) {
  fail("--task is required");
}
if (!args.summary) {
  fail("--summary is required");
}

const repoRoot = git(["rev-parse", "--show-toplevel"]);
const branch = git(["branch", "--show-current"], { cwd: repoRoot });
if (!branch.startsWith("claude/")) {
  fail(`current branch must start with claude/ (current: ${branch || "detached"})`);
}

const status = git(["status", "--porcelain"], { cwd: repoRoot });
if (status) {
  fail("working tree must be clean before creating the ready marker");
}

const reportRelativePath = "docs/agent-handoff/latest.md";
const reportPath = resolve(repoRoot, reportRelativePath);
if (!existsSync(reportPath)) {
  fail(`${reportRelativePath} is missing; create it from TEMPLATE.md and commit it first`);
}
git(["ls-files", "--error-unmatch", reportRelativePath], { cwd: repoRoot });

const candidateCommit = git(["rev-parse", "HEAD"], { cwd: repoRoot });
const mainRef = (() => {
  try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", "refs/remotes/origin/main"], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return "origin/main";
  } catch {
    return "main";
  }
})();
const baseCommit = git(["merge-base", candidateCommit, mainRef], { cwd: repoRoot });

const marker = {
  schemaVersion: 1,
  status: "ready_for_codex",
  project: "wiggle_web",
  branch,
  baseCommit,
  candidateCommit,
  report: reportRelativePath,
  task: args.task,
  summary: args.summary,
  releaseGate: "codex_go_only",
  generatedAt: new Date().toISOString(),
};

const markerPath = resolve(repoRoot, "docs/agent-handoff/latest.json");
mkdirSync(dirname(markerPath), { recursive: true });
writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`, "utf8");

console.log(`Created ${markerPath}`);
console.log("Commit this marker as the final commit on the Claude feature branch.");
