#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverWorkspacePackages } from "./lib/workspace";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "..");
const REPO_ROOT = join(APP_ROOT, "../..");
const COVERAGE_DIR = join(APP_ROOT, "data/raw/coverage");

interface LcovFile {
  lines: { hit: number; found: number };
  functions: { hit: number; found: number };
  branches: { hit: number; found: number };
}

interface PackageCoverage {
  status: "measured" | "not-measured";
  reason?: string;
  runner?: "bun" | "jest";
  linePct?: number;
  functionPct?: number;
  branchPct?: number;
  testLocRatio?: number;
  srcHash?: string;
}

function hashSrc(folder: string): string {
  const h = createHash("sha256");
  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (e === "node_modules" || e === "dist") continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(e) && !/\.(test|spec)\./.test(e)) h.update(readFileSync(full));
    }
  }
  walk(join(folder, "src"));
  return h.digest("hex").slice(0, 12);
}

function parseLcov(content: string): Map<string, LcovFile> {
  const files = new Map<string, LcovFile>();
  let current: LcovFile | null = null;
  let currentFile = "";

  for (const line of content.split("\n")) {
    if (line.startsWith("SF:")) {
      currentFile = line.slice(3).trim();
      current = { lines: { hit: 0, found: 0 }, functions: { hit: 0, found: 0 }, branches: { hit: 0, found: 0 } };
      files.set(currentFile, current);
    } else if (line.startsWith("DA:") && current) {
      current.lines.found += 1;
      const hits = parseInt(line.split(",")[1] ?? "0", 10);
      if (hits > 0) current.lines.hit += 1;
    } else if (line.startsWith("FN:") && current) {
      current.functions.found += 1;
    } else if (line.startsWith("FNDA:") && current) {
      const hits = parseInt(line.split(",")[0]?.slice(5) ?? "0", 10);
      if (hits > 0) current.functions.hit += 1;
    } else if (line.startsWith("BRDA:") && current) {
      current.branches.found += 1;
      const parts = line.slice(5).split(",");
      if (parts[4] !== "-" && parts[4] !== "0") current.branches.hit += 1;
    }
  }
  return files;
}

function pct(hit: number, found: number): number {
  return found > 0 ? Math.round((hit / found) * 1000) / 10 : 0;
}

function aggregateLcov(files: Map<string, LcovFile>) {
  let lh = 0, lf = 0, fh = 0, ff = 0, bh = 0, bf = 0;
  for (const f of files.values()) {
    lh += f.lines.hit; lf += f.lines.found;
    fh += f.functions.hit; ff += f.functions.found;
    bh += f.branches.hit; bf += f.branches.found;
  }
  return {
    linePct: pct(lh, lf),
    functionPct: pct(fh, ff),
    branchPct: pct(bh, bf),
  };
}

async function measurePackage(folder: string, pkgJson: Record<string, unknown>): Promise<PackageCoverage> {
  const srcHash = hashSrc(folder);
  const cachePath = join(COVERAGE_DIR, `${(pkgJson.name as string).replace(/[/@]/g, "_")}.json`);

  if (existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8")) as PackageCoverage;
    if (cached.srcHash === srcHash && cached.status === "measured") return cached;
  }

  const scripts = (pkgJson.scripts ?? {}) as Record<string, string>;
  if (!scripts.test) {
    return { status: "not-measured", reason: "no test script", srcHash };
  }

  const runner = scripts.test.includes("jest") ? "jest" : "bun";
  const tmpDir = join(COVERAGE_DIR, ".tmp", (pkgJson.name as string).replace(/[/@]/g, "_"));
  mkdirSync(tmpDir, { recursive: true });

  const args =
    runner === "jest"
      ? ["test", "--", "--coverage", "--coverageReporters=lcov", "--passWithNoTests"]
      : ["test", "--coverage", "--coverage-reporter=lcov", `--coverage-dir=${tmpDir}`];

  try {
    const proc = Bun.spawnSync(["bun", "run", ...args], {
      cwd: folder,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, CI: "true" },
    });

    if (proc.exitCode !== 0) {
      return { status: "not-measured", reason: `test exit ${proc.exitCode}`, srcHash, runner };
    }

    let lcovPath = join(tmpDir, "lcov.info");
    if (!existsSync(lcovPath)) {
      lcovPath = join(folder, "coverage/lcov.info");
    }
    if (!existsSync(lcovPath)) {
      return { status: "not-measured", reason: "no lcov output", srcHash, runner };
    }

    const lcov = parseLcov(readFileSync(lcovPath, "utf8"));
    const agg = aggregateLcov(lcov);
    const result: PackageCoverage = { status: "measured", runner, srcHash, ...agg };
    writeFileSync(cachePath, JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    return { status: "not-measured", reason: String(err), srcHash, runner };
  }
}

async function main() {
  const only = process.argv.find((a, i) => process.argv[i - 1] === "--only")?.split(",");
  mkdirSync(COVERAGE_DIR, { recursive: true });

  const packages = discoverWorkspacePackages(REPO_ROOT).filter((p) => !p.inactive);
  const targets = only
    ? packages.filter((p) => only.some((o) => p.name.includes(o)))
    : packages.filter((p) => {
        const pkgJson = JSON.parse(readFileSync(join(p.folder, "package.json"), "utf8"));
        return !!(pkgJson.scripts as Record<string, string>)?.test;
      });

  console.log(`Coverage for ${targets.length} packages…`);
  for (const pkg of targets) {
    const pkgJson = JSON.parse(readFileSync(join(pkg.folder, "package.json"), "utf8"));
    const result = await measurePackage(pkg.folder, pkgJson);
    console.log(`  ${pkg.name}: ${result.status}${result.linePct != null ? ` ${result.linePct}% lines` : ""}`);
  }
}

main().catch(console.error);
