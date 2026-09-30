import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import type { WorkspacePackage } from "./workspace";

export interface KnipResult {
  unusedExports: string[];
  unusedFiles: string[];
  unusedDeps: string[];
  unlistedDeps: string[];
  duplicates: { name: string; files: string[] }[];
  byPackage: Record<
    string,
    {
      unusedExports: string[];
      unusedFiles: string[];
      unusedDeps: string[];
      unlistedDeps: string[];
      duplicates: { name: string; files: string[] }[];
    }
  >;
}

export interface DepcruiseResult {
  orphans: Record<string, string[]>;
  cycles: string[][];
}

interface KnipIssue {
  file?: string;
  exports?: string[];
  types?: string[];
  dependencies?: { name: string; line?: number; col?: number; file?: string }[];
  devDependencies?: { name: string }[];
  unlisted?: { name: string; file?: string }[];
  duplicates?: { name: string; files: string[] }[];
}

export function runKnip(
  repoRoot: string,
  outDir: string,
  packages: WorkspacePackage[],
): { result: KnipResult | null; error?: string } {
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, "knip.json");

  const proc = spawnSync(
    "bunx",
    ["knip", "--reporter", "json", "--no-progress"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL ?? "file:./tmp.db",
        DATABASE_PROVIDER: process.env.DATABASE_PROVIDER ?? "sqlite",
      },
      maxBuffer: 50 * 1024 * 1024,
    },
  );

  const stdout = proc.stdout?.trim() ?? "";
  if (stdout) {
    writeFileSync(outFile, stdout);
  } else if (proc.stderr) {
    writeFileSync(outFile, proc.stderr);
  }

  if (!stdout) {
    return {
      result: null,
      error: proc.stderr?.slice(0, 500) || "knip produced no stdout",
    };
  }

  try {
    const parsed = JSON.parse(stdout);
    return { result: normalizeKnip(parsed, packages, repoRoot) };
  } catch (err) {
    return {
      result: {
        unusedExports: [],
        unusedFiles: [],
        unusedDeps: [],
        unlistedDeps: [],
        duplicates: [],
        byPackage: {},
      },
      error: `knip JSON parse failed: ${err}`,
    };
  }
}

function folderForFile(file: string, packages: WorkspacePackage[], repoRoot: string): string | null {
  const abs = file.startsWith("/") ? file : join(repoRoot, file);
  for (const pkg of packages) {
    if (abs.startsWith(pkg.folder + "/") || abs === pkg.folder) {
      return pkg.name;
    }
  }
  return null;
}

function emptyBucket() {
  return {
    unusedExports: [] as string[],
    unusedFiles: [] as string[],
    unusedDeps: [] as string[],
    unlistedDeps: [] as string[],
    duplicates: [] as { name: string; files: string[] }[],
  };
}

function normalizeKnip(
  parsed: unknown,
  packages: WorkspacePackage[],
  repoRoot: string,
): KnipResult {
  const result: KnipResult = {
    unusedExports: [],
    unusedFiles: [],
    unusedDeps: [],
    unlistedDeps: [],
    duplicates: [],
    byPackage: {},
  };
  if (!parsed || typeof parsed !== "object") return result;

  const obj = parsed as Record<string, unknown>;

  // knip 5: { files, issues: [...] }
  const issues = (obj.issues ?? obj) as KnipIssue[] | Record<string, unknown>;
  const issueList: KnipIssue[] = Array.isArray(issues)
    ? issues
    : Array.isArray(obj.files)
      ? (obj.files as string[]).map((file) => ({ file }))
      : [];

  if (Array.isArray(obj.files)) {
    for (const f of obj.files as string[]) {
      result.unusedFiles.push(f);
    }
  }

  for (const issue of issueList) {
    if (!issue || typeof issue !== "object") continue;
    const file = issue.file ?? "";
    const pkgName = file ? folderForFile(file, packages, repoRoot) : null;

    if (issue.exports) {
      for (const e of issue.exports) {
        result.unusedExports.push(`${file}:${e}`);
        if (pkgName) {
          if (!result.byPackage[pkgName]) result.byPackage[pkgName] = emptyBucket();
          result.byPackage[pkgName].unusedExports.push(`${file}:${e}`);
        }
      }
    }

    const deps = issue.dependencies ?? issue.devDependencies;
    if (deps) {
      for (const dep of deps) {
        const name = typeof dep === "string" ? dep : dep.name;
        result.unusedDeps.push(name);
        if (pkgName) {
          if (!result.byPackage[pkgName]) result.byPackage[pkgName] = emptyBucket();
          if (!result.byPackage[pkgName].unusedDeps.includes(name)) {
            result.byPackage[pkgName].unusedDeps.push(name);
          }
        }
      }
    }

    if (issue.unlisted) {
      for (const u of issue.unlisted) {
        const name = typeof u === "string" ? u : u.name;
        result.unlistedDeps.push(name);
        if (pkgName) {
          if (!result.byPackage[pkgName]) result.byPackage[pkgName] = emptyBucket();
          if (!result.byPackage[pkgName].unlistedDeps.includes(name)) {
            result.byPackage[pkgName].unlistedDeps.push(name);
          }
        }
      }
    }

    if (issue.duplicates) {
      for (const dup of issue.duplicates) {
        result.duplicates.push(dup);
        if (pkgName) {
          if (!result.byPackage[pkgName]) result.byPackage[pkgName] = emptyBucket();
          result.byPackage[pkgName].duplicates.push(dup);
        }
      }
    }
  }

  return result;
}

export function runDepcruise(
  repoRoot: string,
  outDir: string,
  packages: WorkspacePackage[],
): DepcruiseResult | null {
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, "depcruise.json");
  const proc = spawnSync(
    "bun",
    ["run", "depcruise:json"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );

  const output = proc.stdout?.trim();
  if (output) writeFileSync(outFile, output);
  if (!existsSync(outFile)) return null;

  try {
    const raw = JSON.parse(readFileSync(outFile, "utf8"));
    return parseDepcruise(raw, packages);
  } catch {
    return { orphans: {}, cycles: [] };
  }
}

function parseDepcruise(
  raw: {
    modules?: {
      source: string;
      dependents?: string[];
      dependencies?: { circular?: boolean; module?: string }[];
    }[];
  },
  packages: WorkspacePackage[],
): DepcruiseResult {
  const orphans: Record<string, string[]> = {};
  const cycles: string[][] = [];

  const folderPrefixes = packages.map((p) => ({ name: p.relativeFolder, folder: p.folder + "/" }));

  for (const mod of raw.modules ?? []) {
    for (const { name, folder } of folderPrefixes) {
      if (mod.source.startsWith(folder) || mod.source.includes(`/${name}/`)) {
        if (mod.dependents?.length === 0) {
          if (!orphans[name]) orphans[name] = [];
          orphans[name].push(mod.source);
        }
        break;
      }
    }
    for (const dep of mod.dependencies ?? []) {
      if (dep.circular) {
        cycles.push([mod.source, dep.module ?? ""]);
      }
    }
  }

  return { orphans, cycles };
}

export function getToolVersions(repoRoot?: string): {
  typescript: string;
  knip?: string;
  depcruise?: string;
} {
  const versions: { typescript: string; knip?: string; depcruise?: string } = {
    typescript: ts.version,
  };
  try {
    const rootPkg = JSON.parse(
      readFileSync(join(repoRoot ?? process.cwd(), "package.json"), "utf8"),
    );
    versions.knip = rootPkg.devDependencies?.knip?.replace("^", "");
    versions.depcruise = rootPkg.devDependencies?.["dependency-cruiser"]?.replace("^", "");
  } catch {
    /* ignore */
  }
  return versions;
}
