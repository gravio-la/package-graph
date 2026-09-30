import type { GraphData } from "../types";

interface Props {
  graph: GraphData;
  onSelect: (name: string) => void;
}

export function CoverageView({ graph, onSelect }: Props) {
  const withCoverage = graph.packages.filter((p) => p.coverage);
  const measured = withCoverage.filter((p) => p.coverage?.status === "measured");
  const notMeasured = withCoverage.filter((p) => p.coverage?.status === "not-measured");

  return (
    <div className="coverage-view">
      <h2>Test Coverage</h2>
      <p>{measured.length} measured · {notMeasured.length} not measured</p>
      <table>
        <thead>
          <tr>
            <th>Package</th>
            <th>Status</th>
            <th>Line %</th>
            <th>Branch %</th>
            <th>Function %</th>
            <th>Runner</th>
          </tr>
        </thead>
        <tbody>
          {graph.packages.map((pkg) => (
            <tr key={pkg.name} onClick={() => onSelect(pkg.name)} style={{ cursor: "pointer" }}>
              <td>{pkg.name.replace("@graviola/", "")}</td>
              <td>
                {pkg.coverage?.status ?? "—"}
                {pkg.coverage?.reason && (
                  <span className="badge" title={pkg.coverage.reason}>?</span>
                )}
              </td>
              <td>{pkg.coverage?.linePct?.toFixed(1) ?? "—"}</td>
              <td>{pkg.coverage?.branchPct?.toFixed(1) ?? "—"}</td>
              <td>{pkg.coverage?.functionPct?.toFixed(1) ?? "—"}</td>
              <td>{pkg.coverage?.runner ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
