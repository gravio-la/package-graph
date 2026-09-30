#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphData, PackageNode } from "../src/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "..");
const DATA_DIR = join(APP_ROOT, "data");
const GEN_DIR = join(APP_ROOT, "generated");

function renderPackageCard(pkg: PackageNode): string {
  const lines: string[] = [
    `# ${pkg.name}`,
    "",
    `> Layer **${pkg.layer}** · v${pkg.version} · \`${pkg.folder}\``,
    "",
  ];

  lines.push(
    "## Metrics",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| LOC | ${pkg.metrics.loc} |`,
    `| Files | ${pkg.metrics.files} |`,
    `| Test ratio | ${(pkg.metrics.testRatio * 100).toFixed(0)}% |`,
    `| Fan-in / fan-out | ${pkg.fanIn} / ${pkg.fanOut} |`,
    `| Review score | ${pkg.reviewScore.total} |`,
    `| Risk / Cleanup | ${pkg.riskScore ?? "—"} / ${pkg.cleanupScore ?? "—"} |`,
    "",
  );

  if (pkg.tsStats) {
    lines.push(
      "## TS health",
      "",
      `- Typed identifiers: ${pkg.tsStats.typedIdentifierPct.toFixed(0)}%`,
      `- explicit any / KLOC: ${pkg.tsStats.perKloc.explicitAny.toFixed(1)}`,
      `- any in public API / KLOC: ${pkg.tsStats.perKloc.anyInPublicApi.toFixed(1)}`,
      "",
    );
  }
  if (pkg.coverage) {
    lines.push("## Coverage", "", `- ${pkg.coverage.status}${pkg.coverage.linePct != null ? `: ${pkg.coverage.linePct}% lines` : ""}`, "");
  }
  if (pkg.security?.sinks.length) {
    lines.push("## Security sinks", "", ...pkg.security.sinks.slice(0, 10).map((s) => `- ${s.kind} ${s.file}:${s.line}${s.sanitized ? "" : " (unsanitized)"}`), "");
  }
  if (pkg.redundancy) {
    lines.push("## Duplication", "", `- ${pkg.redundancy.cloneClusterCount} clone clusters, ${pkg.redundancy.reinventionHitCount} reinvention hits`, "");
  }

  if (pkg.exports.length) {
    lines.push("## Exports", "", "| Symbol | Kind | Consumers | Unused |", "|--------|------|-----------|--------|");
    for (const e of pkg.exports.slice(0, 50)) {
      lines.push(
        `| ${e.name} | ${e.kind} | ${e.consumers.length} | ${e.unused ? "yes" : "no"} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function main() {
  const graphPath = join(DATA_DIR, "graph.json");
  if (!existsSync(graphPath)) {
    console.error("Run analyze:packages first");
    process.exit(1);
  }

  const graph: GraphData = JSON.parse(readFileSync(graphPath, "utf8"));
  mkdirSync(join(GEN_DIR, "packages"), { recursive: true });

  const indexLines = [
    "# Graviola Package Map",
    "",
    `Generated: ${graph.generatedAt}`,
    "",
    "| Package | Layer | Score | LOC |",
    "|---------|-------|-------|-----|",
  ];

  for (const pkg of graph.packages) {
    const slug = pkg.name.replace(/[/@]/g, "_");
    const md = renderPackageCard(pkg);
    writeFileSync(join(GEN_DIR, "packages", `${slug}.md`), md);
    indexLines.push(
      `| [${pkg.name}](packages/${slug}.md) | ${pkg.layer} | ${pkg.reviewScore.total} | ${pkg.metrics.loc} |`,
    );
  }

  writeFileSync(join(GEN_DIR, "PACKAGE-MAP.md"), indexLines.join("\n"));

  const quality = [
    "# Quality Report",
    "",
    `Generated: ${graph.generatedAt}`,
    "",
    "## Top risk packages",
    "",
    ...graph.packages
      .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
      .slice(0, 15)
      .map((p) => `- ${p.name}: risk ${p.riskScore ?? 0}, cleanup ${p.cleanupScore ?? 0}`),
    "",
    "## Top cleanup packages",
    "",
    ...graph.packages
      .sort((a, b) => (b.cleanupScore ?? 0) - (a.cleanupScore ?? 0))
      .slice(0, 15)
      .map((p) => `- ${p.name}: cleanup ${p.cleanupScore ?? 0}`),
    "",
    "## Name collisions",
    "",
    ...(graph.redundancy?.nameCollisions ?? [])
      .slice(0, 20)
      .map((c) => `- **${c.name}** (${c.sites.length} sites)`),
    "",
    "## Reinvention hits (sample)",
    "",
    ...(graph.redundancy?.reinventionHits ?? [])
      .slice(0, 20)
      .map((h) => `- ${h.ruleId} in ${h.package} (${h.file}:${h.line})`),
  ];
  writeFileSync(join(GEN_DIR, "QUALITY-REPORT.md"), quality.join("\n"));

  console.log(`Wrote ${GEN_DIR}/PACKAGE-MAP.md, QUALITY-REPORT.md and ${graph.packages.length} package cards`);
}

main();
