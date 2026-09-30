import ts from "typescript";
import { relative } from "node:path";
import type { ExportKind, PackageExport } from "../../src/types";
import type { WorkspacePackage } from "./workspace";

function classifyExport(name: string, symbol: ts.Symbol, checker: ts.TypeChecker): ExportKind {
  if (name.startsWith("use") && name.length > 3 && name[3]?.toUpperCase() === name[3]) {
    return "hook";
  }
  const decls = symbol.getDeclarations() ?? [];
  for (const decl of decls) {
    if (ts.isInterfaceDeclaration(decl)) return "interface";
    if (ts.isTypeAliasDeclaration(decl)) return "type";
    if (ts.isEnumDeclaration(decl)) return "enum";
    if (ts.isClassDeclaration(decl)) return "class";
    if (ts.isFunctionDeclaration(decl)) {
      if (/^[A-Z]/.test(name)) return "component";
      return "function";
    }
    if (ts.isVariableDeclaration(decl)) {
      if (/^[A-Z]/.test(name)) {
        const type = checker.getTypeAtLocation(decl);
        const sig = type.getCallSignatures()[0];
        if (sig) {
          const ret = checker.getReturnTypeOfSignature(sig);
          if (ret.symbol?.escapedName === "Element" || ret.symbol?.escapedName === "ReactElement") {
            return "component";
          }
        }
        return "component";
      }
      return "const";
    }
  }
  if (/^[A-Z]/.test(name)) return "component";
  return "unknown";
}

export function extractPackageExports(
  pkg: WorkspacePackage,
  program: ts.Program,
  checker: ts.TypeChecker,
  allPackages: WorkspacePackage[],
): PackageExport[] {
  if (!pkg.entryPoint) return [];

  const source = program.getSourceFile(pkg.entryPoint);
  if (!source) return [];

  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) return [];

  const exports: PackageExport[] = [];
  const exported = checker.getExportsOfModule(moduleSymbol);

  for (const sym of exported) {
    const aliased =
      (sym.flags & ts.SymbolFlags.Alias) !== 0
        ? checker.getAliasedSymbol(sym)
        : sym;
    const name = sym.getName();
    if (name === "default") continue;

    const decls = aliased.getDeclarations() ?? sym.getDeclarations() ?? [];
    const declFile = decls[0]?.getSourceFile().fileName ?? pkg.entryPoint;
    const relFile = relative(pkg.folder, declFile);

    let isReExport = false;
    let reExportFrom: string | undefined;
    for (const decl of decls) {
      if (ts.isExportDeclaration(decl) && decl.moduleSpecifier) {
        isReExport = true;
        reExportFrom = (decl.moduleSpecifier as ts.StringLiteral).text;
        break;
      }
    }

    if (isReExport && reExportFrom?.startsWith("@graviola/")) {
      const targetPkg = allPackages.find((p) => reExportFrom!.startsWith(p.name));
      if (targetPkg && targetPkg.name !== pkg.name) {
        // re-export of another package — API smell
      }
    }

    exports.push({
      name,
      kind: classifyExport(name, aliased, checker),
      declaringFile: relFile,
      isReExport,
      reExportFrom,
      consumers: [],
      usedOnlyByApps: false,
      usedOnlyByTests: false,
      unused: true,
    });
  }

  return exports.sort((a, b) => a.name.localeCompare(b.name));
}
