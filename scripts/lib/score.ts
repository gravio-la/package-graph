import {
  RISK_SCORE_WEIGHTS,
  CLEANUP_SCORE_WEIGHTS,
} from "../../config/rules";
import type {
  CodeMetrics,
  ExternalDepIssue,
  GitMetrics,
  GraphViolation,
  PackageExport,
  ReviewScoreBreakdown,
  PackageTsStats,
  PackageSecurityReport,
  PackageCoverageInfo,
  RedundancySummary,
} from "../../src/types";

export interface ScoreInput {
  exports: PackageExport[];
  externalIssues: ExternalDepIssue[];
  violations: GraphViolation[];
  metrics: CodeMetrics;
  git: GitMetrics;
  tsStats?: PackageTsStats;
  security?: PackageSecurityReport;
  coverage?: PackageCoverageInfo;
  redundancy?: RedundancySummary;
  fanIn: number;
}

export interface AxisScores {
  risk: number;
  cleanup: number;
  breakdown: ReviewScoreBreakdown;
}

type RiskPart = keyof typeof RISK_SCORE_WEIGHTS;
type CleanupPart = keyof typeof CLEANUP_SCORE_WEIGHTS;

function perKloc(value: number, loc: number): number {
  return loc > 0 ? (value / loc) * 1000 : value;
}

/** Heavily depended-on packages amplify their defects: 0 consumers → 1, 7 consumers → 3. */
function exposure(fanIn: number): number {
  return Math.log2(2 + fanIn);
}

/** Raw (unscaled) risk signals. Each is 0 when the signal is absent or unknown. */
function rawRiskParts(input: ScoreInput): Record<RiskPart, number> {
  const { exports, metrics, security, coverage, tsStats, fanIn } = input;
  const loc = metrics.loc || 1;
  const unsanitizedSinks = (security?.sinks ?? []).filter((s) => !s.sanitized).length;

  // Only measured coverage counts; an unmeasured package is "unknown", not "half untested".
  const coverageGap =
    coverage?.status === "measured" && coverage.linePct != null
      ? (100 - coverage.linePct) / 100
      : 0;
  const publicValueExports = exports.filter((e) => e.kind !== "type" && e.kind !== "interface").length;

  return {
    securitySinks: perKloc(unsanitizedSinks, loc) * exposure(fanIn),
    cves: (security?.cveCount ?? 0) * exposure(fanIn),
    untestedApi: coverageGap * Math.log2(1 + publicValueExports) * exposure(fanIn),
    anyInPublicApi: tsStats?.perKloc.anyInPublicApi ?? 0,
  };
}

/** Raw (unscaled) cleanup signals. */
function rawCleanupParts(input: ScoreInput): Record<CleanupPart, number> {
  const { exports, externalIssues, violations, metrics, tsStats, redundancy } = input;
  const loc = metrics.loc || 1;
  const unused = exports.filter((e) => e.unused && !e.usedOnlyByApps).length;

  const tsHealth = tsStats
    ? tsStats.perKloc.explicitAny +
      tsStats.perKloc.asAny +
      tsStats.perKloc.doubleCast +
      tsStats.perKloc.tsIgnore +
      tsStats.perKloc.tsNocheck * 10
    : perKloc(metrics.anyCount + metrics.tsIgnoreCount, loc);

  return {
    // Share of the public API nobody uses, damped by absolute count so a 1-of-2 package is not "worst".
    apiBloat: exports.length > 0 ? (unused / exports.length) * Math.log2(1 + unused) : 0,
    dependencySmells: externalIssues.length,
    violations: violations.filter((v) => v.kind !== "cycle").length + violations.filter((v) => v.kind === "cycle").length * 2,
    duplication: perKloc(
      (redundancy?.cloneClusterCount ?? 0) + (redundancy?.reinventionHitCount ?? 0),
      loc,
    ),
    tsHealth,
    slopHeuristics:
      perKloc(metrics.todoCount, loc) * 0.2 + perKloc(metrics.domainVocabHits.length, loc) * 1.5,
  };
}

/**
 * Percentile of `value` among `all` (mid-rank for ties). An absent signal (≤ 0) is always 0,
 * so packages without a problem sit at the origin instead of sharing a tie rank.
 */
function percentile(value: number, all: number[]): number {
  if (value <= 0 || all.length === 0) return 0;
  const below = all.filter((v) => v < value).length;
  const equal = all.filter((v) => v === value).length;
  return ((below + equal / 2) / all.length) * 100;
}

function weightedMean<K extends string>(
  parts: Record<K, number>,
  weights: Record<K, number>,
): number {
  let sum = 0;
  let weightSum = 0;
  for (const key of Object.keys(weights) as K[]) {
    sum += parts[key] * weights[key];
    weightSum += weights[key];
  }
  return weightSum > 0 ? sum / weightSum : 0;
}

function rankParts<K extends string>(raw: Record<K, number>[]): Record<K, number>[] {
  if (raw.length === 0) return [];
  const keys = Object.keys(raw[0]) as K[];
  const columns = new Map(keys.map((k) => [k, raw.map((r) => r[k])]));
  return raw.map((r) => {
    const ranked = {} as Record<K, number>;
    for (const k of keys) ranked[k] = percentile(r[k], columns.get(k)!);
    return ranked;
  });
}

/**
 * Scores all packages together. Each signal is ranked across packages on its own scale, and each
 * axis is the weighted mean of those ranks (0–100). A package scores high only when it ranks high
 * on several heavily weighted signals.
 */
export function computeAllAxisScores(inputs: ScoreInput[]): AxisScores[] {
  const riskRanks = rankParts(inputs.map(rawRiskParts));
  const cleanupRanks = rankParts(inputs.map(rawCleanupParts));

  return inputs.map((input, i) => {
    const riskParts = riskRanks[i];
    const cleanupParts = cleanupRanks[i];
    const risk = round(weightedMean(riskParts, RISK_SCORE_WEIGHTS));
    const cleanup = round(weightedMean(cleanupParts, CLEANUP_SCORE_WEIGHTS));

    const breakdown: ReviewScoreBreakdown = {
      apiBloat: round(cleanupParts.apiBloat),
      dependencySmells: round(cleanupParts.dependencySmells),
      violations: round(cleanupParts.violations),
      sizeChurn: 0,
      slopHeuristics: round(cleanupParts.slopHeuristics),
      total: round((risk + cleanup) / 2),
      risk,
      cleanup,
      riskParts: mapValues(riskParts, round),
      cleanupParts: mapValues(cleanupParts, round),
      coverageKnown: input.coverage?.status === "measured",
    };
    return { risk, cleanup, breakdown };
  });
}

function mapValues<K extends string>(obj: Record<K, number>, fn: (n: number) => number): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k of Object.keys(obj) as K[]) out[k] = fn(obj[k]);
  return out;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
