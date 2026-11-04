import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const command = (exe, args) => spawnSync(exe, args, { encoding: "utf8", timeout: 120_000 });
const sanitize = (value) => value.replace(/[A-Z]:[\\/]Users[\\/][^\\/\s]+/gi, "[user-directory]");
const output = (result) =>
  sanitize(result.error?.message ?? `${result.stdout ?? ""}${result.stderr ?? ""}`.trim());
const git = (args) =>
  command("git", ["-c", `safe.directory=${process.cwd().replaceAll("\\", "/")}`, ...args]);
const model = JSON.parse(readFileSync("docs/qa/model/booking-model.json", "utf8")).models[0];
const now = new Date();
const evidenceFile = resolve(`docs/qa/evidence/issue-06-${now.toISOString().replaceAll(/[:.]/g, "-")}.json`);
mkdirSync("docs/qa/evidence", { recursive: true });
const java = command("java", ["-version"]);
const docker = command("docker", ["--version"]);
const dockerEngine = command("docker", ["version", "--format", "{{.Server.Version}}"]);
const postgres = command("docker", ["exec", "caldiy-issue04-db", "postgres", "--version"]);
const jar = resolve("tools/graphwalker/graphwalker-cli-4.3.3.jar");
const evidence = {
  gitSHA: output(git(["rev-parse", "HEAD"])),
  dirty: output(git(["status", "--porcelain"])) !== "",
  utc: now.toISOString(),
  local: new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Saigon",
    dateStyle: "short",
    timeStyle: "long",
  }).format(now),
  timeZone: "Asia/Saigon",
  environment: {
    platform: process.platform,
    node: process.version,
    java: output(java),
    docker: output(docker),
    dockerEngine: output(dockerEngine),
    graphWalker: "4.3.3 (required; not yet verified)",
    postgres: output(postgres),
  },
  result: "chưa kiểm chứng",
  errors: [],
  steps: [],
  coverage: { edges: { visited: 0, total: 6, percent: 0 }, vertices: { visited: 0, total: 5, percent: 0 } },
  limits: [
    "Personal non-recurring, no seats/payment/external calendar",
    "PENDING/REJECTED/AWAITING_HOST and supplementary guards not covered",
    "No raw browser errors, trace, screenshot, video or booking identifiers in evidence",
  ],
};
if (java.status !== 0) evidence.errors.push(output(java));
if (dockerEngine.status !== 0) evidence.errors.push(output(dockerEngine));
if (postgres.status !== 0) evidence.errors.push(output(postgres));
const javaMajor = Number(output(java).match(/version "(\d+)/)?.[1]);
if (javaMajor < 11 || javaMajor > 21 || !Number.isInteger(javaMajor))
  evidence.errors.push("Java 11..21 required; Java 22 or newer is rejected (including Java 25)");
if (!existsSync(jar)) evidence.errors.push("Missing tools/graphwalker/graphwalker-cli-4.3.3.jar");
if (!existsSync("node_modules"))
  evidence.errors.push("Missing node_modules; install existing locked dependencies before running");
const finish = () => {
  writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));
  console.log(`Evidence: ${evidenceFile}`);
  console.log(
    `${evidence.result}; edge coverage ${evidence.coverage.edges.visited}/6; vertex coverage ${evidence.coverage.vertices.visited}/5`
  );
};
if (evidence.errors.length === 0) {
  const generated = command("java", [
    "-jar",
    jar,
    "offline",
    "--seed",
    "6006",
    "-m",
    "docs/qa/model/booking-model.json",
    "random(edge_coverage(100))",
  ]);
  if (generated.status !== 0) evidence.errors.push(output(generated));
  else {
    try {
      const path = generated.stdout
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line).currentElementName);
      let vertex = model.startElementId;
      let expectVertex = true;
      for (const element of path) {
        if (expectVertex) {
          if (element !== vertex) throw new Error("Path vertex mismatch");
        } else {
          const edge = model.edges.find((item) => item.name === element && item.sourceVertexId === vertex);
          if (!edge) throw new Error("Path edge mismatch");
          vertex = edge.targetVertexId;
        }
        expectVertex = !expectVertex;
      }
      if (
        path.length > 1000 ||
        path.length < 2 ||
        new Set(path.filter((s) => s.startsWith("e_"))).size !== 6 ||
        new Set(path.filter((s) => s.startsWith("v_"))).size !== 5
      )
        throw new Error("Incomplete or oversized GraphWalker path");
      mkdirSync("test-results/mbt", { recursive: true });
      const pathFile = resolve("test-results/mbt/path.json");
      writeFileSync(pathFile, JSON.stringify(path));
      evidence.environment.graphWalker = "4.3.3 jar; offline generation succeeded";
      evidence.path = path;
      finish();
      if (process.argv.includes("--generate-only")) process.exit(0);
      const run = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-File",
          "scripts/run-issue-04-local.ps1",
          "playwright",
          "test",
          "--config=apps/web/playwright/mbt/playwright.config.ts",
          "--workers=1",
          "--retries=0",
        ],
        {
          encoding: "utf8",
          timeout: 2_000_000,
          env: {
            ...process.env,
            MBT_PATH: pathFile,
            MBT_EVIDENCE: evidenceFile,
            NEXT_PUBLIC_IS_E2E: "1",
            PLAYWRIGHT_NO_COPY_PROMPT: "1",
          },
        }
      );
      Object.assign(evidence, JSON.parse(readFileSync(evidenceFile, "utf8")));
      if (run.status !== 0 && evidence.steps.length === 0)
        evidence.errors.push(
          "Playwright failed before first oracle; raw output withheld because fixtures may expose secrets"
        );
      if (run.status !== 0 && evidence.result === "pass") evidence.result = "fail";
    } catch (error) {
      evidence.errors.push(sanitize(error.message));
    }
  }
}
if (evidence.steps.length === 0)
  evidence.steps = [...model.vertices, ...model.edges].map(({ name }) => ({
    element: name,
    result: "chưa kiểm chứng",
    reason: evidence.errors.join("; ") || "Generated only; browser not executed",
  }));
finish();
process.exitCode = evidence.result === "pass" ? 0 : 1;
