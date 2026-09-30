import ts from "typescript";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PEER_CANDIDATES, BROWSER_ONLY_EXTERNALS } from "../../config/rules";
import type { ExternalDepIssue } from "../../src/types";
import { isTestFile, type WorkspacePackage } from "./workspace";

const BUILTIN_PREFIXES = ["node:", "bun:"];
const TYPE_ONLY_PACKAGES: Record<string, string> = {
  "json-schema": "@types/json-schema",
};

export interface FileImportInfo {
  specifier: string;
  root: string;
  isTypeOnly: boolean;
  isTestFile: boolean;
}

function rootPackageName(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split("/")[0];
}

function isWorkspaceSpecifier(spec: string): boolean {
  return spec.startsWith("@graviola/") || spec === "eslint-config-edb";
}

function isBuiltin(spec: string): boolean {
  return BUILTIN_PREFIXES.some((p) => spec.startsWith(p));
}

function resolvePathAlias(
  spec: string,
  pkg: WorkspacePackage,
  repoRoot: string,
): string | null {
  if (!spec.startsWith("@/") && !spec.startsWith("#")) return null;
  const tsconfigPath = join(pkg.folder, "tsconfig.json");
  if (!existsSync(tsconfigPath)) return null;
  try {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
    const paths = tsconfig.compilerOptions?.paths as Record<string, string[]> | undefined;
    if (!paths) return null;
    for (const [pattern, targets] of Object.entries(paths)) {
      const star = pattern.endsWith("/*");
      const prefix = star ? pattern.slice(0, -2) : pattern.replace("*", "");
      if (star && spec.startsWith(prefix + "/")) {
        const rest = spec.slice(prefix.length + 1);
        const target = targets[0]?.replace("/*", "") ?? "";
        return join(pkg.folder, target, rest);
      }
      if (pattern === spec || spec === prefix) {
        return join(pkg.folder, targets[0] ?? "");
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function normalizeExternalRoot(spec: string): string {
  if (TYPE_ONLY_PACKAGES[spec]) return TYPE_ONLY_PACKAGES[spec];
  return rootPackageName(spec);
}

export function collectExternalImports(
  program: ts.Program,
  files: string[],
  packages: WorkspacePackage[],
  repoRoot: string,
): Map<string, FileImportInfo[]> {
  const byFile = new Map<string, FileImportInfo[]>();
  const pkgByFolder = new Map(packages.map((p) => [p.folder, p]));

  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source) continue;
    const pkg = [...pkgByFolder.entries()].find(([folder]) => file.startsWith(folder + "/"))?.[1];
    const isTest = isTestFile(file);
    const imports: FileImportInfo[] = [];

    function addImport(spec: string, isTypeOnly: boolean) {
      if (spec.startsWith(".") || isWorkspaceSpecifier(spec) || isBuiltin(spec)) return;
      if (pkg && resolvePathAlias(spec, pkg, repoRoot)) return;
      imports.push({
        specifier: spec,
        root: normalizeExternalRoot(spec),
        isTypeOnly,
        isTestFile: isTest,
      });
    }

    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
        const spec = (node.moduleSpecifier as ts.StringLiteral).text;
        addImport(spec, !!node.importClause?.isTypeOnly);
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const spec = (node.moduleSpecifier as ts.StringLiteral).text;
        addImport(spec, !!node.isTypeOnly);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          addImport(arg.text, false);
        }
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        addImport(node.argument.literal.text, true);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (imports.length) byFile.set(file, imports);
  }

  return byFile;
}

export function analyzeExternalDeps(
  pkg: WorkspacePackage,
  externalImports: Map<string, FileImportInfo[]>,
  workspaceImports: Map<string, Set<string>>,
): ExternalDepIssue[] {
  const issues: ExternalDepIssue[] = [];
  const pkgPrefix = pkg.folder + "/";
  const pkgFiles = [...externalImports.entries()].filter(([f]) => f.startsWith(pkgPrefix));

  const usedProd = new Set<string>();
  const usedDev = new Set<string>();
  const usedTypeOnly = new Set<string>();

  for (const [file, imports] of pkgFiles) {
    const isTest = isTestFile(file);
    for (const imp of imports) {
      if (imp.isTypeOnly) usedTypeOnly.add(imp.root);
      if (isTest || imp.isTestFile) usedDev.add(imp.root);
      else usedProd.add(imp.root);
    }
  }

  // Credit workspace package usage — if we import @graviola/foo, don't flag foo's deps as unused
  const wsImports = workspaceImports.get(pkg.name) ?? new Set();
  for (const ws of wsImports) {
    usedProd.add(ws);
  }

  const declaredProd = new Set(Object.keys(pkg.dependencies));
  const declaredPeer = new Set(Object.keys(pkg.peerDependencies));
  const declaredDev = new Set(Object.keys(pkg.devDependencies));
  const allDeclared = new Set([...declaredProd, ...declaredPeer, ...declaredDev]);

  for (const dep of declaredProd) {
    if (isWorkspaceSpecifier(dep)) continue;
    if (wsImports.has(dep)) continue;
    if (!usedProd.has(dep) && !usedDev.has(dep) && !usedTypeOnly.has(dep)) {
      issues.push({
        package: dep,
        kind: "unused-declared",
        declaredIn: "dependencies",
        usedIn: [],
      });
    }
  }

  for (const dep of declaredDev) {
    if (isWorkspaceSpecifier(dep)) continue;
    if (!usedDev.has(dep) && !usedProd.has(dep) && !usedTypeOnly.has(dep)) {
      // dev deps used only in prod code would be caught below
    }
  }

  const allUsed = new Set([...usedProd, ...usedDev, ...usedTypeOnly]);
  for (const ext of allUsed) {
    if (isWorkspaceSpecifier(ext)) continue;
    if (allDeclared.has(ext)) continue;
    // bun:test and vitest in test files are OK if in devDeps or known test runners
    if (ext === "bun:test" || ext === "vitest" || ext.startsWith("@vitest/")) {
      if (declaredDev.has(ext) || declaredDev.has("vitest")) continue;
    }
    const usedIn = pkgFiles
      .filter(([, imps]) => imps.some((i) => i.root === ext))
      .map(([f]) => f.replace(pkgPrefix, ""));

    const isTestOnly = pkgFiles
      .filter(([, imps]) => imps.some((i) => i.root === ext))
      .every(([f]) => isTestFile(f));

    if (isTestOnly && !declaredDev.has(ext)) {
      issues.push({ package: ext, kind: "used-undeclared", usedIn, detail: "test-only import" });
    } else if (!isTestOnly) {
      issues.push({ package: ext, kind: "used-undeclared", usedIn });
    }

    if (PEER_CANDIDATES.includes(ext) && !declaredPeer.has(ext) && declaredProd.has(ext)) {
      issues.push({
        package: ext,
        kind: "should-be-peer",
        usedIn,
      });
    }
    if (declaredPeer.has(ext) && !declaredDev.has(ext)) {
      issues.push({ package: ext, kind: "peer-missing-in-dev", usedIn: [] });
    }
  }

  return issues;
}

export function findRuntimeConstraintViolations(
  packages: WorkspacePackage[],
  workspaceImports: Map<string, Set<string>>,
  externalImports: Map<string, FileImportInfo[]>,
): { package: string; external: string; path: string[] }[] {
  const pkgMap = new Map(packages.map((p) => [p.name, p]));
  const violations: { package: string; external: string; path: string[] }[] = [];

  function getExternals(pkgName: string, visited = new Set<string>()): Set<string> {
    if (visited.has(pkgName)) return new Set();
    visited.add(pkgName);
    const pkg = pkgMap.get(pkgName);
    if (!pkg) return new Set();

    const result = new Set<string>();
    for (const [file, imports] of externalImports) {
      if (file.startsWith(pkg.folder + "/")) {
        for (const imp of imports) result.add(imp.root);
      }
    }

    const deps = workspaceImports.get(pkgName) ?? new Set();
    for (const dep of deps) {
      for (const ext of getExternals(dep, visited)) result.add(ext);
    }
    return result;
  }

  for (const pkg of packages) {
    if (typeof pkg.layer !== "number" || pkg.layer > 2) continue;
    const closure = getExternals(pkg.name);
    for (const ext of closure) {
      if (BROWSER_ONLY_EXTERNALS.some((b) => ext === b || ext.startsWith(b + "/"))) {
        violations.push({
          package: pkg.name,
          external: ext,
          path: [pkg.name],
        });
      }
    }
  }

  return violations;
}
