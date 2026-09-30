import type { GraphData } from "../types";

interface Props {
  graph: GraphData;
  onSelect: (name: string) => void;
}

const METRICS = [
  "explicitAny",
  "asAny",
  "nonNullAssertions",
  "tsIgnore",
  "tsExpectError",
  "anyInPublicApi",
] as const;

export function TsHealthView({ graph, onSelect }: Props) {
  return (
    <div className="ts-health-view">
      <h2>TypeScript Health (per KLOC)</h2>
      <table>
        <thead>
          <tr>
            <th>Package</th>
            {METRICS.map((m) => (
              <th key={m}>{m}</th>
            ))}
            <th>typed %</th>
          </tr>
        </thead>
        <tbody>
          {graph.packages
            .filter((p) => p.tsStats)
            .sort((a, b) => (b.tsStats?.perKloc.explicitAny ?? 0) - (a.tsStats?.perKloc.explicitAny ?? 0))
            .map((pkg) => (
              <tr key={pkg.name} onClick={() => onSelect(pkg.name)} style={{ cursor: "pointer" }}>
                <td>{pkg.name.replace("@graviola/", "")}</td>
                {METRICS.map((m) => (
                  <td key={m} className={((pkg.tsStats?.perKloc[m] ?? 0) > 5) ? "hot" : ""}>
                    {(pkg.tsStats?.perKloc[m] ?? 0).toFixed(1)}
                  </td>
                ))}
                <td>{(pkg.tsStats?.typedIdentifierPct ?? 0).toFixed(0)}%</td>
              </tr>
            ))}
        </tbody>
      </table>
      <h3>Any in public API</h3>
      <table>
        <thead>
          <tr><th>Package</th><th>anyInPublicApi / KLOC</th><th>Worst file</th></tr>
        </thead>
        <tbody>
          {graph.packages
            .filter((p) => (p.tsStats?.perKloc.anyInPublicApi ?? 0) > 0)
            .sort((a, b) => (b.tsStats?.perKloc.anyInPublicApi ?? 0) - (a.tsStats?.perKloc.anyInPublicApi ?? 0))
            .map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>{p.tsStats?.perKloc.anyInPublicApi.toFixed(2)}</td>
                <td>{p.tsStats?.worstFile?.path ?? "—"}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
