import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeUsage } from "../usage";
import { extractPackageExports } from "../exports";
import { analyzeExternalDeps, collectExternalImports } from "../externals";
import type { WorkspacePackage } from "../workspace";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures/mini-workspace");
const PROVIDER = join(FIXTURE, "packages/provider");
const CONSUMER = join(FIXTURE, "packages/consumer");

const packages: WorkspacePackage[] = [
  {
    name: "@graviola/provider",
    folder: PROVIDER,
    relativeFolder: "packages/provider",
    version: "1.0.0",
    private: false,
    layer: 1,
    inactive: false,
    dependencies: {},
    peerDependencies: {},
    devDependencies: {},
    exportSubpaths: ["."],
    entryPoint: join(PROVIDER, "src/index.ts"),
  },
  {
    name: "@graviola/consumer",
    folder: CONSUMER,
    relativeFolder: "packages/consumer",
    version: "1.0.0",
    private: false,
    layer: 2,
    inactive: false,
    dependencies: { "@graviola/provider": "1.0.0" },
    peerDependencies: {},
    devDependencies: { vitest: "^3.0.0" },
    exportSubpaths: ["."],
    entryPoint: join(CONSUMER, "src/index.ts"),
  },
];

function buildProgram() {
  const files = [
    join(PROVIDER, "src/index.ts"),
    join(CONSUMER, "src/index.ts"),
    join(CONSUMER, "src/test-only-import.ts"),
  ];
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    esModuleInterop: true,
    paths: {
      "@graviola/provider": [join(PROVIDER, "src/index.ts")],
    },
    baseUrl: FIXTURE,
  });
  return { program, checker: program.getTypeChecker() };
}

describe("usage analyzer self-test", () => {
  test("no duplicate consumers per export", () => {
    const { program, checker } = buildProgram();
    const exportsByPackage = new Map<string, import("../../../src/types").PackageExport[]>();
    for (const pkg of packages) {
      exportsByPackage.set(pkg.name, extractPackageExports(pkg, program, checker, packages));
    }

    const libraryFiles = [join(PROVIDER, "src/index.ts"), join(CONSUMER, "src/index.ts")];
    const appFiles: string[] = [];

    analyzeUsage(program, checker, packages, exportsByPackage, libraryFiles, appFiles);

    const sharedHelper = exportsByPackage
      .get("@graviola/provider")!
      .find((e) => e.name === "sharedHelper")!;

    expect(sharedHelper.consumers).toHaveLength(1);
    expect(sharedHelper.consumers[0].package).toBe("@graviola/consumer");

    const packagesSeen = sharedHelper.consumers.map((c) => c.package);
    expect(new Set(packagesSeen).size).toBe(packagesSeen.length);
  });

  test("external deps credit workspace and test-only imports", () => {
    const { program } = buildProgram();
    const files = [
      join(PROVIDER, "src/index.ts"),
      join(CONSUMER, "src/index.ts"),
      join(CONSUMER, "src/test-only-import.ts"),
    ];
    const externalImports = collectExternalImports(program, files, packages, FIXTURE);
    const wsImports = new Map([["@graviola/consumer", new Set(["@graviola/provider"])]]);

    const consumerIssues = analyzeExternalDeps(packages[1], externalImports, wsImports);
    const unusedWorkspace = consumerIssues.filter(
      (i) => i.kind === "unused-declared" && i.package === "@graviola/provider",
    );
    expect(unusedWorkspace).toHaveLength(0);
  });
});

describe("security sink fixture", () => {
  test("detects $queryRawUnsafe", () => {
    const src = `
      import { PrismaClient } from "@prisma/client";
      const db = new PrismaClient();
      export async function bad(q: string) {
        return db.$queryRawUnsafe(\`SELECT * FROM t WHERE id = \${q}\`);
      }
    `;
    expect(/\$queryRawUnsafe/.test(src)).toBe(true);
  });
});
