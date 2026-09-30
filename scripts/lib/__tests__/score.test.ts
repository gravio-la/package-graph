import { describe, expect, test } from "bun:test";
import { computeAllAxisScores, type ScoreInput } from "../score";
import type { PackageExport, SecuritySink } from "../../../src/types";

function exportOf(name: string, unused: boolean): PackageExport {
  return {
    name,
    kind: "function",
    declaringFile: "src/index.ts",
    isReExport: false,
    consumers: [],
    usedOnlyByApps: false,
    usedOnlyByTests: false,
    unused,
  };
}

function input(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    exports: [exportOf("a", false)],
    externalIssues: [],
    violations: [],
    metrics: {
      loc: 1000,
      files: 10,
      testFiles: 0,
      testRatio: 0,
      largestFile: { path: "src/index.ts", loc: 100 },
      anyCount: 0,
      tsIgnoreCount: 0,
      eslintDisableCount: 0,
      todoCount: 0,
      commentDensity: 0,
      domainVocabHits: [],
    },
    git: { commits6mo: 0, lastChange: null, aiCoauthorRatio: 0 },
    fanIn: 1,
    ...overrides,
  };
}

const sink = { sanitized: false } as SecuritySink;

describe("computeAllAxisScores", () => {
  test("packages without any risk signal score 0 risk, even with many unused exports and no coverage", () => {
    const bloated = input({
      exports: Array.from({ length: 30 }, (_, i) => exportOf(`e${i}`, true)),
      fanIn: 5,
    });
    const [clean, withBloat, withSinks] = computeAllAxisScores([
      input(),
      bloated,
      input({ security: { sinks: [sink, sink], cveCount: 0 } }),
    ]);

    expect(clean.risk).toBe(0);
    expect(withBloat.risk).toBe(0);
    expect(withBloat.cleanup).toBeGreaterThan(0);
    expect(withSinks.risk).toBeGreaterThan(0);
  });

  test("risk spreads instead of saturating when most packages share a signal", () => {
    const inputs = Array.from({ length: 10 }, (_, i) =>
      input({
        security: { sinks: Array.from({ length: i }, () => sink), cveCount: 0 },
      }),
    );
    const risks = computeAllAxisScores(inputs).map((s) => s.risk);

    expect(risks[0]).toBe(0);
    for (let i = 1; i < risks.length; i++) expect(risks[i]).toBeGreaterThan(risks[i - 1]);
    expect(risks.filter((r) => r >= 90)).toHaveLength(0);
  });

  test("layer violations count toward cleanup", () => {
    const [plain, violating] = computeAllAxisScores([
      input(),
      input({ violations: [{ kind: "layer", from: "a", to: "b", detail: "Layer 1 → 6" }] }),
    ]);
    expect(violating.breakdown.cleanupParts?.violations).toBeGreaterThan(0);
    expect(violating.cleanup).toBeGreaterThan(plain.cleanup);
  });
});
