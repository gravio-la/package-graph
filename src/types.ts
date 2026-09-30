/** Shared schema for deterministic analysis output (graph.json). */

export type LayerId =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | "tooling"
  | "experimental"
  | "unknown";

export type ExportKind =
  | "function"
  | "hook"
  | "component"
  | "class"
  | "const"
  | "type"
  | "interface"
  | "enum"
  | "namespace"
  | "unknown";

export interface PackageExport {
  name: string;
  kind: ExportKind;
  declaringFile: string;
  isReExport: boolean;
  reExportFrom?: string;
  consumers: ExportConsumer[];
  usedOnlyByApps: boolean;
  usedOnlyByTests: boolean;
  unused: boolean;
  knipUnused?: boolean;
}

export interface ExportConsumer {
  package: string;
  importCount: number;
  referenceCount: number;
  isTypeOnly: boolean;
  isTest: boolean;
  isDeepImport: boolean;
}

export interface ExternalDepIssue {
  package: string;
  kind:
    | "unused-declared"
    | "used-undeclared"
    | "type-only-candidate"
    | "should-be-peer"
    | "peer-missing-in-dev"
    | "version-drift"
    | "catalog-missing";
  declaredIn?: string;
  usedIn: string[];
  detail?: string;
}

export interface WorkspaceEdge {
  from: string;
  to: string;
  edgeType: "prod" | "peer" | "dev";
  declared: boolean;
  imported: boolean;
  symbolCount: number;
}

export interface GraphViolation {
  kind: "layer" | "runtime-constraint" | "cycle";
  from: string;
  to: string;
  detail: string;
}

export interface CodeMetrics {
  loc: number;
  files: number;
  testFiles: number;
  testRatio: number;
  largestFile: { path: string; loc: number };
  anyCount: number;
  tsIgnoreCount: number;
  eslintDisableCount: number;
  todoCount: number;
  commentDensity: number;
  domainVocabHits: { term: string; file: string; line: number }[];
}

export interface GitMetrics {
  commits6mo: number;
  lastChange: string | null;
  aiCoauthorRatio: number;
}

export interface ReviewScoreBreakdown {
  apiBloat: number;
  dependencySmells: number;
  violations: number;
  sizeChurn: number;
  slopHeuristics: number;
  total: number;
  risk?: number;
  cleanup?: number;
  /** Per-signal percentile (0–100) behind the risk axis. */
  riskParts?: Record<string, number>;
  /** Per-signal percentile (0–100) behind the cleanup axis. */
  cleanupParts?: Record<string, number>;
  /** False when no coverage was measured, so the untested-API signal is missing, not zero. */
  coverageKnown?: boolean;
}

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
  perKloc: FileTsStats;
  typedIdentifierPct: number;
  worstFile: { path: string; hits: number } | null;
}

export interface SecuritySink {
  file: string;
  line: number;
  kind: string;
  snippet: string;
  sanitized: boolean;
  sanitizer?: string;
}

export interface PackageSecurityReport {
  classification?: string;
  sinks: SecuritySink[];
  cveCount: number;
}

export interface PackageCoverageInfo {
  status: "measured" | "not-measured";
  reason?: string;
  runner?: "bun" | "jest";
  linePct?: number;
  functionPct?: number;
  branchPct?: number;
}

export interface RedundancySummary {
  cloneClusterCount: number;
  nameCollisionCount: number;
  reinventionHitCount: number;
  topCollisions: { name: string; count: number }[];
}

export interface CloneCluster {
  id: string;
  classification: "intra-file" | "intra-package" | "cross-package";
  packages: string[];
  lines: number;
}

export interface PackageNode {
  name: string;
  folder: string;
  version: string;
  layer: LayerId;
  layerProposed?: boolean;
  inactive: boolean;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  exports: PackageExport[];
  externalIssues: ExternalDepIssue[];
  metrics: CodeMetrics;
  git: GitMetrics;
  fanIn: number;
  fanOut: number;
  instability: number;
  reviewScore: ReviewScoreBreakdown;
  riskScore?: number;
  cleanupScore?: number;
  tsStats?: PackageTsStats;
  security?: PackageSecurityReport;
  coverage?: PackageCoverageInfo;
  redundancy?: RedundancySummary;
  knip?: {
    unusedExports: string[];
    unusedFiles: string[];
    unusedDeps: string[];
    unlistedDeps: string[];
    duplicates?: { name: string; files: string[] }[];
  };
  depcruise?: {
    orphans: string[];
    cycles: string[][];
  };
}

export interface ConsolidationCandidate {
  kind: "single-consumer" | "tiny" | "co-imported" | "cycle-group";
  packages: string[];
  reason: string;
}

export interface GraphData {
  generatedAt: string;
  repoRoot: string;
  packageCount: number;
  packages: PackageNode[];
  edges: WorkspaceEdge[];
  violations: GraphViolation[];
  cycles: string[][];
  usageMatrix: Record<string, Record<string, number>>;
  consolidationCandidates: ConsolidationCandidate[];
  toolVersions: {
    typescript: string;
    knip?: string;
    depcruise?: string;
  };
  toolErrors?: string[];
  tsStats?: Record<string, PackageTsStats>;
  redundancy?: {
    cloneClusters: CloneCluster[];
    nameCollisions: { name: string; sites: { package: string; file: string }[] }[];
    reinventionHits: { ruleId: string; package: string; file: string; line: number }[];
    shadowEdges: { from: string; to: string; reason: string }[];
  };
  baseline?: string;
  snapshots?: string[];
}
