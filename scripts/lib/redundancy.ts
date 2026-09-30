import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join as joinPath } from "node:path";
import { relative } from "node:path";
import ts from "typescript";
import { CANONICAL_HELPERS } from "../../config/canonical-helpers";
import type { WorkspacePackage } from "./workspace";
import { isTestFile } from "./workspace";

export interface CloneSite {
  file: string;
  startLine: number;
  endLine: number;
}

export interface CloneCluster {
  id: string;
  classification: "intra-file" | "intra-package" | "cross-package";
  sites: CloneSite[];
  lines: number;
  packages: string[];
}

export interface NameCollision {
  name: string;
  sites: { package: string; file: string; line: number; exported: boolean }[];
}

export interface ReinventionHit {
  ruleId: string;
  replacement: string;
  provider: string;
  package: string;
  file: string;
  line: number;
  alreadyDependsOnProvider: boolean;
}

export interface RedundancyReport {
  cloneClusters: CloneCluster[];
  nameCollisions: NameCollision[];
  reinventionHits: ReinventionHit[];
  shadowEdges: { from: string; to: string; reason: string }[];
}

function pkgForFile(file: string, packages: WorkspacePackage[]): string | null {
  for (const p of packages) {
    if (file.startsWith(p.folder + "/")) return p.name;
  }
  return null;
}

function hashFunctionBody(node: ts.FunctionLikeDeclaration, source: ts.SourceFile): string | null {
  const body = node.body;
  if (!body) return null;
  const start = body.getStart(source);
  const end = body.getEnd();
  let text = source.text.slice(start, end);
  // Normalize identifiers and literals
  text = text.replace(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g, "ID");
  text = text.replace(/['"`][^'"`]*['"`]/g, "STR");
  text = text.replace(/\d+/g, "NUM");
  const lines = text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("//"));
  if (lines.length < 5) return null;
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function analyzeRedundancy(
  program: ts.Program,
  packages: WorkspacePackage[],
  repoRoot: string,
  jscpdClusters: CloneCluster[] = [],
): RedundancyReport {
  const fingerprintMap = new Map<string, CloneSite[]>();
  const nameMap = new Map<string, { package: string; file: string; line: number; exported: boolean }[]>();
  const reinventionHits: ReinventionHit[] = [];

  for (const sf of program.getSourceFiles()) {
    if (sf.fileName.includes("node_modules")) continue;
    if (isTestFile(sf.fileName)) continue;
    const pkgName = pkgForFile(sf.fileName, packages);
    if (!pkgName) continue;
    const currentPkg = pkgName;
    const pkg = packages.find((p) => p.name === currentPkg)!;
    const rel = relative(repoRoot, sf.fileName);

    const content = sf.text;
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      for (const rule of CANONICAL_HELPERS) {
        if (rule.pattern.test(line)) {
          reinventionHits.push({
            ruleId: rule.id,
            replacement: rule.replacement,
            provider: rule.provider,
            package: currentPkg,
            file: rel,
            line: idx + 1,
            alreadyDependsOnProvider:
              !!pkg.dependencies[rule.provider] ||
              !!pkg.devDependencies[rule.provider] ||
              rule.provider.startsWith("@graviola/") &&
                !!pkg.dependencies[rule.provider],
          });
        }
      }
    });

    function visit(node: ts.Node) {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)
      ) {
        const hash = hashFunctionBody(node, sf);
        if (hash) {
          const start = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
          const site: CloneSite = { file: rel, startLine: start, endLine: end };
          if (!fingerprintMap.has(hash)) fingerprintMap.set(hash, []);
          fingerprintMap.get(hash)!.push(site);
        }
      }

      if (ts.isFunctionDeclaration(node) && node.name) {
        const n = node.name.text;
        const line = sf.getLineAndCharacterOfPosition(node.name.getStart()).line + 1;
        const exported = !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        if (!nameMap.has(n)) nameMap.set(n, []);
        nameMap.get(n)!.push({ package: currentPkg, file: rel, line, exported });
      }

      ts.forEachChild(node, visit);
    }
    visit(sf);
  }

  const cloneClusters: CloneCluster[] = [...jscpdClusters];
  let clusterIdx = jscpdClusters.length;

  for (const [hash, sites] of fingerprintMap) {
    if (sites.length < 2) continue;
    const pkgs = [...new Set(sites.map((s) => pkgForFile(joinPath(repoRoot, s.file), packages) ?? "?"))];
    const classification =
      pkgs.length > 1 ? "cross-package" : sites.every((s) => s.file === sites[0].file) ? "intra-file" : "intra-package";
    cloneClusters.push({
      id: `fp-${hash}`,
      classification,
      sites,
      lines: sites.reduce((a, s) => a + (s.endLine - s.startLine), 0),
      packages: pkgs,
    });
    clusterIdx += 1;
  }

  const nameCollisions: NameCollision[] = [];
  for (const [name, sites] of nameMap) {
    const pkgs = new Set(sites.map((s) => s.package));
        if (sites.length >= 2 && (pkgs.size > 1 || sites.length >= 2)) {
      nameCollisions.push({ name, sites });
    }
  }

  const shadowEdges: RedundancyReport["shadowEdges"] = [];
  for (const cluster of cloneClusters) {
    if (cluster.classification !== "cross-package" || cluster.packages.length < 2) continue;
    for (let i = 0; i < cluster.packages.length; i++) {
      for (let j = i + 1; j < cluster.packages.length; j++) {
        shadowEdges.push({
          from: cluster.packages[i],
          to: cluster.packages[j],
          reason: `clone cluster ${cluster.id}`,
        });
      }
    }
  }

  return { cloneClusters, nameCollisions, reinventionHits, shadowEdges };
}

export function runJscpd(
  repoRoot: string,
  packages: WorkspacePackage[],
  outDir: string,
): CloneCluster[] {
  // The json reporter writes `<output>/jscpd-report.json`; it prints nothing useful on stdout.
  Bun.spawnSync(
    ["bunx", "jscpd", "packages", "--reporters", "json", "--output", outDir, "--silent", "--ignore", "**/*.test.*,**/*.spec.*,**/dist/**"],
    { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
  );
  const reportPath = joinPath(outDir, "jscpd-report.json");
  if (!existsSync(reportPath)) return [];

  try {
    const raw = JSON.parse(readFileSync(reportPath, "utf8")) as {
      duplicates?: { firstFile: { name: string; startLoc: { line: number }; endLoc: { line: number } }; secondFile: { name: string; startLoc: { line: number }; endLoc: { line: number } }; lines: number }[];
    };
    const clusters: CloneCluster[] = [];
    for (const dup of raw.duplicates ?? []) {
      const pkgs = [
        ...new Set(
          [dup.firstFile.name, dup.secondFile.name]
            .map((f) => pkgForFile(joinPath(repoRoot, f), packages))
            .filter(Boolean) as string[],
        ),
      ];
      clusters.push({
        id: `jscpd-${clusters.length}`,
        classification: pkgs.length > 1 ? "cross-package" : "intra-package",
        sites: [
          { file: dup.firstFile.name, startLine: dup.firstFile.startLoc.line, endLine: dup.firstFile.endLoc.line },
          { file: dup.secondFile.name, startLine: dup.secondFile.startLoc.line, endLine: dup.secondFile.endLoc.line },
        ],
        lines: dup.lines,
        packages: pkgs,
      });
    }
    return clusters;
  } catch {
    return [];
  }
}
