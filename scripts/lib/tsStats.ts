import ts from "typescript";
import type { WorkspacePackage } from "./workspace";
import { isTestFile } from "./workspace";

export interface FileTsStats {
  explicitAny: number;
  implicitAny: number;
  asCasts: number;
  asAny: number;
  doubleCast: number;
  asConst: number;
  nonNullAssertions: number;
  tsIgnore: number;
  tsExpectError: number;
  tsNocheck: number;
  eslintDisable: number;
  weakTypes: number;
  satisfies: number;
  typeGuards: number;
  assertNever: number;
  exportedWithoutReturnType: number;
  anyInPublicApi: number;
  unvalidatedJsonParse: number;
  loc: number;
}

export interface PackageTsStats {
  perKloc: Omit<FileTsStats, never>;
  typedIdentifierPct: number;
  worstFile: { path: string; hits: number } | null;
  files: Record<string, FileTsStats>;
}

const EMPTY: FileTsStats = {
  explicitAny: 0,
  implicitAny: 0,
  asCasts: 0,
  asAny: 0,
  doubleCast: 0,
  asConst: 0,
  nonNullAssertions: 0,
  tsIgnore: 0,
  tsExpectError: 0,
  tsNocheck: 0,
  eslintDisable: 0,
  weakTypes: 0,
  satisfies: 0,
  typeGuards: 0,
  assertNever: 0,
  exportedWithoutReturnType: 0,
  anyInPublicApi: 0,
  unvalidatedJsonParse: 0,
  loc: 0,
};

function addStats(a: FileTsStats, b: FileTsStats): FileTsStats {
  const out = { ...a };
  for (const k of Object.keys(EMPTY) as (keyof FileTsStats)[]) {
    out[k] = (a[k] as number) + (b[k] as number);
  }
  return out;
}

function scalePerKloc(stats: FileTsStats, loc: number): FileTsStats {
  const k = loc > 0 ? 1000 / loc : 0;
  const out = { ...stats };
  for (const key of Object.keys(EMPTY) as (keyof FileTsStats)[]) {
    if (key !== "loc") (out[key] as number) *= k;
  }
  return out;
}

export function analyzeTsStats(
  program: ts.Program,
  checker: ts.TypeChecker,
  packages: WorkspacePackage[],
): Map<string, PackageTsStats> {
  const result = new Map<string, PackageTsStats>();

  for (const pkg of packages) {
    const files: Record<string, FileTsStats> = {};
    let total = { ...EMPTY };
    let typedIds = 0;
    let totalIds = 0;

    for (const sf of program.getSourceFiles()) {
      if (!sf.fileName.startsWith(pkg.folder + "/")) continue;
      if (isTestFile(sf.fileName)) continue;
      if (sf.fileName.includes("node_modules")) continue;

      const rel = sf.fileName.replace(pkg.folder + "/", "");
      const stats = walkFile(sf, checker);
      files[rel] = stats;
      total = addStats(total, stats);

      const idCounts = countTypedIdentifiers(sf, checker);
      typedIds += idCounts.typed;
      totalIds += idCounts.total;
    }

    const loc = total.loc || 1;
    let worst: { path: string; hits: number } | null = null;
    for (const [path, s] of Object.entries(files)) {
      const hits = s.explicitAny + s.asAny + s.nonNullAssertions + s.tsIgnore + s.tsExpectError;
      if (!worst || hits > worst.hits) worst = { path, hits };
    }

    result.set(pkg.name, {
      perKloc: scalePerKloc(total, loc),
      typedIdentifierPct: totalIds > 0 ? (typedIds / totalIds) * 100 : 100,
      worstFile: worst,
      files,
    });
  }

  return result;
}

function walkFile(source: ts.SourceFile, checker: ts.TypeChecker): FileTsStats {
  const stats = { ...EMPTY };
  stats.loc = source.getLineAndCharacterOfPosition(source.end).line + 1;

  function isAnyType(node: ts.Node): boolean {
    const t = checker.getTypeAtLocation(node);
    if ((t.flags & ts.TypeFlags.Any) !== 0) return true;
    const text = checker.typeToString(t);
    return text === "any";
  }

  function visit(node: ts.Node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const parent = node.parent;
      if (parent && (ts.isTypeReferenceNode(parent) || ts.isTypeNode(node))) {
        stats.explicitAny += 1;
      }
    }

    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      stats.asCasts += 1;
      const typeText = node.type.getText(source);
      if (typeText === "any") stats.asAny += 1;
      else if (typeText.includes("unknown")) stats.doubleCast += 1;
      else if (typeText === "const") stats.asConst += 1;
    }

    if (ts.isNonNullExpression(node)) stats.nonNullAssertions += 1;

    if (ts.isSatisfiesExpression(node)) stats.satisfies += 1;

    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) {
      if (node.type && ts.isTypePredicateNode(node.type)) stats.typeGuards += 1;
      if (ts.isFunctionDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (!node.type) stats.exportedWithoutReturnType += 1;
        if (node.type && isAnyType(node)) stats.anyInPublicApi += 1;
      }
    }

    if (ts.isCallExpression(node) && node.expression.getText(source) === "JSON.parse") {
      const parent = node.parent;
      if (parent && !ts.isCallExpression(parent)) {
        stats.unvalidatedJsonParse += 1;
      }
    }

    if (ts.isIdentifier(node) && isAnyType(node)) stats.implicitAny += 1;

    ts.forEachChild(node, visit);
  }

  for (const line of source.text.split("\n")) {
    if (/@ts-ignore\b/.test(line)) stats.tsIgnore += 1;
    if (/@ts-expect-error\b/.test(line)) stats.tsExpectError += 1;
    if (/@ts-nocheck\b/.test(line)) stats.tsNocheck += 1;
    if (/eslint-disable/.test(line)) stats.eslintDisable += 1;
    if (/\bFunction\b|\bobject\b|\bunknown\b/.test(line)) stats.weakTypes += 1;
    if (/assertNever|exhaustive/.test(line)) stats.assertNever += 1;
  }

  visit(source);
  return stats;
}

function countTypedIdentifiers(source: ts.SourceFile, checker: ts.TypeChecker) {
  let typed = 0;
  let total = 0;

  function visit(node: ts.Node) {
    if (ts.isIdentifier(node) && node.parent && !ts.isPropertyAccessExpression(node.parent)) {
      const t = checker.getTypeAtLocation(node);
      total += 1;
      if ((t.flags & ts.TypeFlags.Any) === 0) typed += 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { typed, total };
}
