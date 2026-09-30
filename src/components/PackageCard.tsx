import type { GraphData, PackageNode } from "../types";
import { layerColor, scoreColor } from "../utils/colors";

interface Props {
  pkg: PackageNode | null;
  graph: GraphData;
}

export function PackageCard({ pkg, graph }: Props) {
  if (!pkg) {
    return (
      <aside className="package-card empty">
        <p>Select a package to inspect</p>
      </aside>
    );
  }

  const violations = graph.violations.filter(
    (v) => v.from === pkg.name || v.to === pkg.name,
  );

  return (
    <aside className="package-card">
      <header>
        <h2>{pkg.name}</h2>
        <span className="layer-badge" style={{ background: layerColor(pkg.layer) }}>
          L{String(pkg.layer)}
        </span>
        <span className="score-badge" style={{ background: scoreColor(pkg.riskScore ?? pkg.reviewScore.total) }}>
          R{pkg.riskScore ?? 0} C{pkg.cleanupScore ?? 0}
        </span>
      </header>

      <section>
        <h3>Metrics</h3>
        <dl className="metrics-dl">
          <dt>LOC</dt><dd>{pkg.metrics.loc}</dd>
          <dt>Fan-in / out</dt><dd>{pkg.fanIn} / {pkg.fanOut}</dd>
          <dt>Exports</dt><dd>{pkg.exports.length}</dd>
          <dt>Unused exports</dt><dd>{pkg.exports.filter((e) => e.unused).length}</dd>
          <dt>Git (6mo)</dt><dd>{pkg.git.commits6mo} commits</dd>
          <dt>AI co-author</dt><dd>{(pkg.git.aiCoauthorRatio * 100).toFixed(0)}%</dd>
        </dl>
      </section>

      {pkg.externalIssues.length > 0 && (
        <section>
          <h3>Dependency issues ({pkg.externalIssues.length})</h3>
          <ul className="issues">
            {pkg.externalIssues.slice(0, 8).map((i) => (
              <li key={`${i.package}-${i.kind}`}>
                <code>{i.kind}</code> {i.package}
              </li>
            ))}
          </ul>
        </section>
      )}

      {violations.length > 0 && (
        <section>
          <h3>Violations ({violations.length})</h3>
          <ul className="issues">
            {violations.slice(0, 6).map((v, idx) => (
              <li key={idx}>{v.kind}: {v.detail}</li>
            ))}
          </ul>
        </section>
      )}

      {pkg.tsStats && (
        <section>
          <h3>TS health</h3>
          <dl className="metrics-dl">
            <dt>Typed identifiers</dt><dd>{pkg.tsStats.typedIdentifierPct.toFixed(0)}%</dd>
            <dt>any / KLOC</dt><dd>{pkg.tsStats.perKloc.explicitAny.toFixed(1)}</dd>
            <dt>as any / KLOC</dt><dd>{pkg.tsStats.perKloc.asAny.toFixed(1)}</dd>
            <dt>! assertions / KLOC</dt><dd>{pkg.tsStats.perKloc.nonNullAssertions.toFixed(1)}</dd>
          </dl>
        </section>
      )}

      {pkg.coverage && (
        <section>
          <h3>Coverage</h3>
          <p>{pkg.coverage.status}{pkg.coverage.linePct != null ? ` — ${pkg.coverage.linePct}% lines` : ""}{pkg.coverage.reason ? ` (${pkg.coverage.reason})` : ""}</p>
        </section>
      )}

      {pkg.security && pkg.security.sinks.length > 0 && (
        <section>
          <h3>Security sinks ({pkg.security.sinks.length})</h3>
          <ul className="issues">
            {pkg.security.sinks.slice(0, 5).map((s, i) => (
              <li key={i}>{s.kind} {s.file}:{s.line}{s.sanitized ? "" : " ⚠"}</li>
            ))}
          </ul>
        </section>
      )}

      {pkg.redundancy && (pkg.redundancy.cloneClusterCount > 0 || pkg.redundancy.reinventionHitCount > 0) && (
        <section>
          <h3>Duplication</h3>
          <p>{pkg.redundancy.cloneClusterCount} clone clusters, {pkg.redundancy.reinventionHitCount} reinvention hits</p>
        </section>
      )}

      <section>
        <h3>Risk {pkg.riskScore ?? 0} — signal percentiles</h3>
        <ul className="score-breakdown">
          {Object.entries(pkg.reviewScore.riskParts ?? {}).map(([k, v]) => (
            <li key={k}>{k}: {v}</li>
          ))}
          {!pkg.reviewScore.coverageKnown && <li className="muted">coverage not measured</li>}
        </ul>
        <h3>Cleanup {pkg.cleanupScore ?? 0} — signal percentiles</h3>
        <ul className="score-breakdown">
          {Object.entries(pkg.reviewScore.cleanupParts ?? {}).map(([k, v]) => (
            <li key={k}>{k}: {v}</li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
