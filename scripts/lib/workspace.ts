import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { PACKAGE_LAYERS } from "../../config/layers";
import { INACTIVE_PACKAGES } from "../../config/rules";
import type { LayerId } from "../../src/types";

export interface WorkspacePackage {
  name: string;
  folder: string;
  relativeFolder: string;
  version: string;
  private: boolean;
  layer: LayerId;
  inactive: boolean;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  exportSubpaths: string[];
  entryPoint: string | null;
}

interface RootPackageJson {
  workspaces?: {
    packages?: string[];
    catalog?: Record<string, string>;
    catalogs?: Record<string, Record<string, string>>;
  };
}

function expandGlob(root: string, pattern: string): string[] {
  const parts = pattern.split("/");
  const results: string[] = [];

  function walk(base: string, idx: number) {
    if (idx >= parts.length) {
      if (existsSync(join(base, "package.json"))) results.push(base);
      return;
    }
    const part = parts[idx];
    if (part === "**" || part === "*") {
      if (!existsSync(base)) return;
      for (const entry of readdirSync(base)) {
        const full = join(base, entry);
        if (!statSync(full).isDirectory()) continue;
        if (part === "**") {
          walk(full, idx);
          walk(full, idx + 1);
        } else {
          walk(full, idx + 1);
        }
      }
      return;
    }
    walk(join(base, part), idx + 1);
  }

  walk(root, 0);
  return [...new Set(results)];
}

export function resolveCatalogVersion(
  spec: string,
  rootPkg: RootPackageJson,
): string {
  if (!spec.startsWith("catalog:")) return spec;
  const rest = spec.slice("catalog:".length);
  if (!rest) return rootPkg.workspaces?.catalog?.[""] ?? spec;
  const [catalogName, key] = rest.includes(":") ? rest.split(":") : ["", rest];
  if (catalogName && rootPkg.workspaces?.catalogs?.[catalogName]) {
    return rootPkg.workspaces.catalogs[catalogName][key ?? ""] ?? spec;
  }
  return rootPkg.workspaces?.catalog?.[rest] ?? spec;
}

function resolveDeps(
  deps: Record<string, string> | undefined,
  rootPkg: RootPackageJson,
): Record<string, string> {
  if (!deps) return {};
  return Object.fromEntries(
    Object.entries(deps).map(([k, v]) => [k, resolveCatalogVersion(v, rootPkg)]),
  );
}

function parseExportSubpaths(exportsField: unknown): string[] {
  if (!exportsField) return ["."];
  if (typeof exportsField === "string") return ["."];
  if (typeof exportsField === "object" && exportsField !== null) {
    return Object.keys(exportsField);
  }
  return ["."];
}

function findEntryPoint(folder: string): string | null {
  const candidates = ["src/index.ts", "src/index.tsx", "index.ts"];
  for (const c of candidates) {
    const p = join(folder, c);
    if (existsSync(p)) return p;
  }
  const srcDir = join(folder, "src");
  if (existsSync(srcDir)) {
    for (const f of readdirSync(srcDir)) {
      if (f.startsWith("index.")) return join(srcDir, f);
    }
  }
  return null;
}

export function discoverWorkspacePackages(repoRoot: string): WorkspacePackage[] {
  const rootPkg: RootPackageJson = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  );
  const globs = (rootPkg.workspaces?.packages ?? []).filter(
    (g) => g.startsWith("packages/") || g.startsWith("packages"),
  );

  const folders = globs.flatMap((g) => expandGlob(repoRoot, g));
  const packages: WorkspacePackage[] = [];

  for (const folder of folders) {
    const pkgPath = join(folder, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const name = pkg.name as string;
    if (!name) continue;

    const isGraviola = name.startsWith("@graviola/") || name === "eslint-config-edb";
    if (!isGraviola) continue;
    if (pkg.private === true) continue;

    const rel = relative(repoRoot, folder);
    packages.push({
      name,
      folder,
      relativeFolder: rel,
      version: pkg.version ?? "0.0.0",
      private: !!pkg.private,
      layer: PACKAGE_LAYERS[name] ?? "unknown",
      inactive: INACTIVE_PACKAGES.includes(name) || !existsSync(join(folder, "src")),
      dependencies: resolveDeps(pkg.dependencies, rootPkg),
      peerDependencies: resolveDeps(pkg.peerDependencies, rootPkg),
      devDependencies: resolveDeps(pkg.devDependencies, rootPkg),
      exportSubpaths: parseExportSubpaths(pkg.exports),
      entryPoint: findEntryPoint(folder),
    });
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildPathsMap(packages: WorkspacePackage[]): Record<string, string[]> {
  const paths: Record<string, string[]> = {};
  for (const pkg of packages) {
    if (!pkg.entryPoint) continue;
    paths[pkg.name] = [pkg.entryPoint];
    for (const sub of pkg.exportSubpaths) {
      if (sub === ".") continue;
      const subName = `${pkg.name}/${sub.replace(/^\.\//, "")}`;
      const candidate = join(dirname(pkg.entryPoint), sub.replace(/^\.\//, "") + ".ts");
      if (existsSync(candidate)) {
        paths[subName] = [candidate];
      }
    }
  }
  return paths;
}

export function collectSourceFiles(
  repoRoot: string,
  scope: "libraries" | "apps" | "all",
): string[] {
  const dirs: string[] = [];
  if (scope === "libraries" || scope === "all") {
    dirs.push(join(repoRoot, "packages"));
  }
  if (scope === "apps" || scope === "all") {
    dirs.push(join(repoRoot, "apps"));
    if (existsSync(join(repoRoot, "platform"))) {
      dirs.push(join(repoRoot, "platform"));
    }
  }

  const files: string[] = [];
  const exts = new Set([".ts", ".tsx"]);

  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === "dist") continue;
        walk(full);
      } else if (exts.has(full.slice(full.lastIndexOf(".")))) {
        files.push(full);
      }
    }
  }

  for (const d of dirs) walk(d);
  return files;
}

export function packageForFile(
  file: string,
  packages: WorkspacePackage[],
): WorkspacePackage | undefined {
  return packages.find((p) => file.startsWith(p.folder + "/"));
}

export function isTestFile(file: string): boolean {
  return (
    /\.(test|spec)\.[tj]sx?$/.test(file) ||
    file.includes("/__tests__/") ||
    file.includes(".stories.")
  );
}
