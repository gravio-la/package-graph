#!/usr/bin/env bun
import ts from "typescript";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  GraphData,
  GraphViolation,
  PackageNode,
  PackageCoverageInfo,
  RedundancySummary,
} from "../src/types";
import {
  discoverWorkspacePackages,
  buildPathsMap,
  collectSourceFiles,
} from "./lib/workspace";
import { extractPackageExports } from "./lib/exports";
import { analyzeUsage, buildUsageMatrix } from "./lib/usage";
import {
  collectExternalImports,
  analyzeExternalDeps,
  findRuntimeConstraintViolations,
} from "./lib/externals";
import { computeCodeMetrics, computeGitMetrics } from "./lib/metrics";
import {
  buildWorkspaceEdges,
  computeFanMetrics,
  tarjanCycles,
  findLayerViolations,
  findConsolidationCandidates,
} from "./lib/graph";
import { runKnip, runDepcruise, getToolVersions } from "./lib/tools";
import { computeAllAxisScores } from "./lib/score";
import { analyzeTsStats } from "./lib/tsStats";
import { analyzeRedundancy, runJscpd } from "./lib/redundancy";
import { scanSecuritySinks, runBunAudit } from "./lib/securitySinks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "..");
const REPO_ROOT = join(APP_ROOT, "../..");
const DATA_DIR = join(APP_ROOT, "data");
const RAW_DIR = join(DATA_DIR, "raw");
const COVERAGE_DIR = join(RAW_DIR, "coverage");
const SNAPSHOT_DIR = join(DATA_DIR, "snapshots");

function parseArgs() {
  let snapshot: string | null = null;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--snapshot" && args[i + 1]) {
      snapshot = args[i + 1];
      i++;
    }
  }
  return { snapshot };
}

function loadCoverage(name: string): PackageCoverageInfo | undefined {
  const path = join(COVERAGE_DIR, `${name.replace(/[/@]/g, "_")}.json`);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageCoverageInfo;
  } catch {
    return undefined;
  }
}

async function main() {
  const { snapshot } = parseArgs();
  console.log("Discovering workspace packages…");
  const packages = discoverWorkspacePackages(REPO_ROOT).filter((p) => !p.inactive);
  console.log(`  ${packages.length} published library packages`);

  const paths = buildPathsMap(packages);
  const libraryFiles = collectSourceFiles(REPO_ROOT, "libraries");
  const appFiles = collectSourceFiles(REPO_ROOT, "apps");

  console.log("Building TypeScript program…");
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    skipLibCheck: true,
    noEmit: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    baseUrl: REPO_ROOT,
    paths,
  };

  const program = ts.createProgram([...libraryFiles, ...appFiles], compilerOptions);
  const checker = program.getTypeChecker();

  console.log("Extracting exports…");
  const exportsByPackage = new Map<string, import("../src/types").PackageExport[]>();
  for (const pkg of packages) {
    exportsByPackage.set(pkg.name, extractPackageExports(pkg, program, checker, packages));
  }

  console.log("Analyzing cross-package usage…");
  const usage = analyzeUsage(
    program,
    checker,
    packages,
    exportsByPackage,
    libraryFiles,
    appFiles,
  );

  console.log("Analyzing external dependencies…");
  const externalImports = collectExternalImports(program, libraryFiles, packages, REPO_ROOT);

  console.log("Running knip & depcruise…");
  mkdirSync(RAW_DIR, { recursive: true });
  const toolErrors: string[] = [];
  const knipRun = runKnip(REPO_ROOT, RAW_DIR, packages);
  if (knipRun.error) toolErrors.push(`knip: ${knipRun.error}`);
  const knip = knipRun.result;
  const depcruise = runDepcruise(REPO_ROOT, RAW_DIR, packages);

  console.log("TS health stats…");
  const tsStatsMap = analyzeTsStats(program, checker, packages);

  console.log("Redundancy analysis…");
  const jscpdClusters = runJscpd(REPO_ROOT, packages, RAW_DIR);
  const redundancyFull = analyzeRedundancy(program, packages, REPO_ROOT, jscpdClusters);

  console.log("Security sink scan…");
  const securityMap = scanSecuritySinks(program, packages);
  const cveMap = runBunAudit(REPO_ROOT);
  for (const [pkgName, report] of securityMap) {
    const pkg = packages.find((p) => p.name === pkgName);
    if (!pkg) continue;
    let cves = 0;
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      cves += cveMap.get(dep) ?? 0;
    }
    report.cveCount = cves;
  }

  console.log("Building graph edges & metrics…");
  const edges = buildWorkspaceEdges(packages, usage.workspaceImports, exportsByPackage);
  const fanMetrics = computeFanMetrics(packages, edges);
  const cycles = tarjanCycles(edges);
  const layerViolations = findLayerViolations(packages, edges);
  const runtimeViolations = findRuntimeConstraintViolations(
    packages,
    usage.workspaceImports,
    externalImports,
  );

  const violations: GraphViolation[] = [
    ...layerViolations,
    ...runtimeViolations.map((v) => ({
      kind: "runtime-constraint" as const,
      from: v.package,
      to: v.external,
      detail: `Browser-only external reachable from L1/L2: ${v.external}`,
    })),
    ...cycles.map((cycle) => ({
      kind: "cycle" as const,
      from: cycle[0],
      to: cycle[1] ?? cycle[0],
      detail: cycle.join(" → "),
    })),
  ];

  const usageMatrix = buildUsageMatrix(exportsByPackage);
  const consolidationCandidates = findConsolidationCandidates(
    packages,
    edges,
    exportsByPackage,
    cycles,
  );

  const scoreInputs = packages.map((pkg) => {
    const exports = exportsByPackage.get(pkg.name) ?? [];
    const externalIssues = analyzeExternalDeps(pkg, externalImports, usage.workspaceImports);
    const metrics = computeCodeMetrics(pkg.folder);
    const git = computeGitMetrics(pkg.folder, REPO_ROOT);
    const fan = fanMetrics.get(pkg.name)!;
    const pkgViolations = violations.filter((v) => v.from === pkg.name || v.to === pkg.name);
    const tsStats = tsStatsMap.get(pkg.name);
    const security = securityMap.get(pkg.name);
    const coverage = loadCoverage(pkg.name);
    const pkgRedundancy = redundancyFull.nameCollisions.filter((c) =>
      c.sites.some((s) => s.package === pkg.name),
    );
    const redundancy: RedundancySummary = {
      cloneClusterCount: redundancyFull.cloneClusters.filter((c) =>
        c.packages.includes(pkg.name),
      ).length,
      nameCollisionCount: pkgRedundancy.length,
      reinventionHitCount: redundancyFull.reinventionHits.filter((h) => h.package === pkg.name)
        .length,
      topCollisions: pkgRedundancy.slice(0, 5).map((c) => ({ name: c.name, count: c.sites.length })),
    };
    return {
      pkg,
      exports,
      externalIssues,
      metrics,
      git,
      fan,
      pkgViolations,
      tsStats,
      security,
      coverage,
      redundancy,
    };
  });

  const axisScores = computeAllAxisScores(
    scoreInputs.map((s) => ({
      exports: s.exports,
      externalIssues: s.externalIssues,
      violations: s.pkgViolations,
      metrics: s.metrics,
      git: s.git,
      tsStats: s.tsStats,
      security: s.security,
      coverage: s.coverage,
      redundancy: s.redundancy,
      fanIn: s.fan.fanIn,
    })),
  );

  const packageNodes: PackageNode[] = scoreInputs.map((input, index) => {
    const { pkg, exports, externalIssues, metrics, git, fan, pkgViolations, tsStats, security, coverage, redundancy } = input;

    if (metrics.loc < 500 && exports.length <= 5) {
      consolidationCandidates.push({
        kind: "tiny",
        packages: [pkg.name],
        reason: `${metrics.loc} LOC, ${exports.length} exports`,
      });
    }

    const axis = axisScores[index];

    const pkgKnip = knip?.byPackage[pkg.name];

    return {
      name: pkg.name,
      folder: pkg.relativeFolder,
      version: pkg.version,
      layer: pkg.layer,
      inactive: pkg.inactive,
      dependencies: pkg.dependencies,
      peerDependencies: pkg.peerDependencies,
      devDependencies: pkg.devDependencies,
      exports,
      externalIssues,
      metrics,
      git,
      fanIn: fan.fanIn,
      fanOut: fan.fanOut,
      instability: fan.instability,
      reviewScore: axis.breakdown,
      riskScore: axis.risk,
      cleanupScore: axis.cleanup,
      tsStats,
      security,
      coverage,
      redundancy,
      knip: knip
        ? {
            unusedExports: pkgKnip?.unusedExports ?? knip.unusedExports.filter((e) => e.includes(pkg.relativeFolder)),
            unusedFiles: pkgKnip?.unusedFiles ?? knip.unusedFiles.filter((f) => f.includes(pkg.relativeFolder)),
            unusedDeps: pkgKnip?.unusedDeps ?? [],
            unlistedDeps: pkgKnip?.unlistedDeps ?? [],
            duplicates: pkgKnip?.duplicates,
          }
        : undefined,
      depcruise: depcruise
        ? {
            orphans: depcruise.orphans[pkg.relativeFolder] ?? [],
            cycles: depcruise.cycles.filter((c) => c.some((m) => m.includes(pkg.relativeFolder))),
          }
        : undefined,
    };
  });

  packageNodes.sort((a, b) => (b.riskScore ?? 0) + (b.cleanupScore ?? 0) - ((a.riskScore ?? 0) + (a.cleanupScore ?? 0)));

  const tsStatsRecord: GraphData["tsStats"] = {};
  for (const [name, stats] of tsStatsMap) {
    tsStatsRecord[name] = {
      perKloc: stats.perKloc,
      typedIdentifierPct: stats.typedIdentifierPct,
      worstFile: stats.worstFile,
    };
  }

  const graph: GraphData = {
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    packageCount: packageNodes.length,
    packages: packageNodes,
    edges,
    violations,
    cycles,
    usageMatrix,
    consolidationCandidates,
    toolVersions: getToolVersions(REPO_ROOT),
    toolErrors: toolErrors.length ? toolErrors : undefined,
    tsStats: tsStatsRecord,
    redundancy: {
      cloneClusters: redundancyFull.cloneClusters.map((c) => ({
        id: c.id,
        classification: c.classification,
        packages: c.packages,
        lines: c.lines,
      })),
      nameCollisions: redundancyFull.nameCollisions.map((c) => ({
        name: c.name,
        sites: c.sites.map((s) => ({ package: s.package, file: s.file })),
      })),
      reinventionHits: redundancyFull.reinventionHits.map((h) => ({
        ruleId: h.ruleId,
        package: h.package,
        file: h.file,
        line: h.line,
      })),
      shadowEdges: redundancyFull.shadowEdges,
    },
    snapshots: existsSync(SNAPSHOT_DIR)
      ? readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))
      : [],
  };

  mkdirSync(DATA_DIR, { recursive: true });
  const json = JSON.stringify(graph, null, 2);
  const outPath = join(DATA_DIR, "graph.json");
  writeFileSync(outPath, json);
  const publicDir = join(APP_ROOT, "public/data");
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, "graph.json"), json);

  if (snapshot) {
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    writeFileSync(join(SNAPSHOT_DIR, `${snapshot}.json`), json);
    console.log(`  snapshot saved: ${snapshot}`);
  }

  console.log(`\nWrote ${outPath} (${packageNodes.length} packages, ${edges.length} edges)`);
  if (toolErrors.length) console.warn("Tool errors:", toolErrors);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
