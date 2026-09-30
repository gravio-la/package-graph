import ts from "typescript";
import type { ExportConsumer, PackageExport } from "../../src/types";
import {
  type WorkspacePackage,
  packageForFile,
  isTestFile,
} from "./workspace";

export interface UsageResult {
  exportsByPackage: Map<string, PackageExport[]>;
  workspaceImports: Map<string, Set<string>>;
  symbolUsageCounts: Map<string, Map<string, ExportConsumer>>;
  appOnlySymbols: Set<string>;
}

function extractPackageRoot(specifier: string): string | null {
  if (!specifier.startsWith("@graviola/")) {
    if (specifier === "eslint-config-edb") return specifier;
    return null;
  }
  const parts = specifier.split("/");
  if (parts.length >= 2 && parts[1]) {
    return `${parts[0]}/${parts[1]}`;
  }
  return null;
}

function consumerKey(provider: string, symbol: string, consumer: string): string {
  return `${provider}::${symbol}::${consumer}`;
}

export function analyzeUsage(
  program: ts.Program,
  checker: ts.TypeChecker,
  libraryPackages: WorkspacePackage[],
  exportsByPackage: Map<string, PackageExport[]>,
  libraryFiles: string[],
  appFiles: string[],
): UsageResult {
  const workspaceImports = new Map<string, Set<string>>();
  const symbolUsageCounts = new Map<string, Map<string, ExportConsumer>>();
  const appOnlySymbols = new Set<string>();

  function processFile(file: string, isAppScope: boolean) {
    const source = program.getSourceFile(file);
    if (!source) return;

    const consumerPkg = packageForFile(file, libraryPackages);
    const isTest = isTestFile(file);
    const importBindings = new Map<string, { provider: string; names: Map<string, boolean> }>();

    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
        const spec = (node.moduleSpecifier as ts.StringLiteral).text;
        const providerRoot = extractPackageRoot(spec);
        if (!providerRoot) return;

        const isDeep = spec.includes("/dist/") || spec.includes("/src/");
        const isTypeOnly = !!node.importClause?.isTypeOnly;

        if (consumerPkg) {
          if (!workspaceImports.has(consumerPkg.name)) {
            workspaceImports.set(consumerPkg.name, new Set());
          }
          workspaceImports.get(consumerPkg.name)!.add(providerRoot);
        }

        const clause = node.importClause;
        if (!clause) return;

        if (clause.name) {
          trackImport(providerRoot, "*", isTypeOnly, isDeep, isAppScope, isTest, consumerPkg?.name);
        }

        if (clause.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            trackImport(
              providerRoot,
              clause.namedBindings.name.text,
              isTypeOnly,
              isDeep,
              isAppScope,
              isTest,
              consumerPkg?.name,
            );
            importBindings.set(clause.namedBindings.name.text, {
              provider: providerRoot,
              names: new Map([["*", true]]),
            });
          } else if (ts.isNamedImports(clause.namedBindings)) {
            for (const el of clause.namedBindings.elements) {
              const imported = (el.propertyName ?? el.name).text;
              trackImport(
                providerRoot,
                imported,
                isTypeOnly || el.isTypeOnly,
                isDeep,
                isAppScope,
                isTest,
                consumerPkg?.name,
              );
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    function trackImport(
      provider: string,
      symbol: string,
      isTypeOnly: boolean,
      isDeep: boolean,
      isApp: boolean,
      isTestFile_: boolean,
      consumerName?: string,
    ) {
      const key = `${provider}::${symbol}`;
      if (isApp) {
        appOnlySymbols.add(key);
        return;
      }
      if (!consumerName) return;

      if (!symbolUsageCounts.has(provider)) {
        symbolUsageCounts.set(provider, new Map());
      }
      const map = symbolUsageCounts.get(provider)!;
      const cKey = consumerKey(provider, symbol, consumerName);
      const existing = map.get(cKey) ?? {
        package: consumerName,
        importCount: 0,
        referenceCount: 0,
        isTypeOnly,
        isTest: isTestFile_,
        isDeepImport: isDeep,
      };
      existing.importCount += 1;
      map.set(cKey, existing);
    }

    // Second pass: count references to named imports
    const namedImports = new Map<string, { provider: string; local: string; typeOnly: boolean }>();
    for (const stmt of source.statements) {
      if (!ts.isImportDeclaration(stmt) || !stmt.moduleSpecifier) continue;
      const spec = (stmt.moduleSpecifier as ts.StringLiteral).text;
      const provider = extractPackageRoot(spec);
      if (!provider) continue;
      const clause = stmt.importClause;
      if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
      for (const el of clause.namedBindings.elements) {
        const imported = (el.propertyName ?? el.name).text;
        namedImports.set(el.name.text, {
          provider,
          local: imported,
          typeOnly: el.isTypeOnly || !!clause.isTypeOnly,
        });
      }
    }

    function countRefs(node: ts.Node) {
      if (ts.isIdentifier(node)) {
        const binding = namedImports.get(node.text);
        if (binding && consumerPkg) {
          const cKey = consumerKey(binding.provider, binding.local, consumerPkg.name);
          const map = symbolUsageCounts.get(binding.provider);
          if (map?.has(cKey)) {
            map.get(cKey)!.referenceCount += 1;
          }
        }
      }
      ts.forEachChild(node, countRefs);
    }

    visit(source);
    countRefs(source);
  }

  for (const f of libraryFiles) processFile(f, false);
  for (const f of appFiles) processFile(f, true);

  // Merge usage into exports — index by provider::symbol::consumer once per export
  for (const [pkgName, exports] of exportsByPackage) {
    const usageMap = symbolUsageCounts.get(pkgName);
    for (const exp of exports) {
      const consumers: ExportConsumer[] = [];
      if (usageMap) {
        const seen = new Set<string>();
        for (const [key, consumer] of usageMap) {
          const prefix = `${pkgName}::${exp.name}::`;
          if (!key.startsWith(prefix)) continue;
          if (seen.has(consumer.package)) continue;
          seen.add(consumer.package);
          consumers.push({ ...consumer });
        }
      }

      exp.consumers = consumers;
      const libConsumers = consumers.filter((c) => !c.isTest);
      const testConsumers = consumers.filter((c) => c.isTest);
      exp.usedOnlyByTests = libConsumers.length === 0 && testConsumers.length > 0;
      exp.unused = libConsumers.length === 0 && testConsumers.length === 0;

      const appKey = `${pkgName}::${exp.name}`;
      if (appOnlySymbols.has(appKey) && libConsumers.length === 0) {
        exp.usedOnlyByApps = true;
      }
    }
  }

  return {
    exportsByPackage,
    workspaceImports,
    symbolUsageCounts,
    appOnlySymbols,
  };
}

export function buildUsageMatrix(
  exportsByPackage: Map<string, PackageExport[]>,
): Record<string, Record<string, number>> {
  const matrix: Record<string, Record<string, number>> = {};
  for (const [provider, exports] of exportsByPackage) {
    for (const exp of exports) {
      for (const c of exp.consumers) {
        if (c.isTest) continue;
        if (!matrix[provider]) matrix[provider] = {};
        matrix[provider][c.package] = (matrix[provider][c.package] ?? 0) + c.referenceCount + c.importCount;
      }
    }
  }
  return matrix;
}
