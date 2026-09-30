import { useMemo } from "react";
import type { GraphData } from "../types";
import { layerNumber } from "../../config/layers";

interface Props {
  graph: GraphData;
}

export function UsageMatrixView({ graph }: Props) {
  const { providers, consumers, matrix, max } = useMemo(() => {
    const providers = [...graph.packages]
      .sort((a, b) => layerNumber(a.layer) - layerNumber(b.layer))
      .map((p) => p.name);
    const consumerSet = new Set<string>();
    for (const row of Object.values(graph.usageMatrix)) {
      for (const c of Object.keys(row)) consumerSet.add(c);
    }
    const consumers = [...consumerSet].sort();
    let max = 0;
    for (const row of Object.values(graph.usageMatrix)) {
      for (const v of Object.values(row)) max = Math.max(max, v);
    }
    return { providers, consumers, matrix: graph.usageMatrix, max };
  }, [graph]);

  function heat(value: number): string {
    if (value === 0) return "transparent";
    const t = max > 0 ? value / max : 0;
    return `rgba(231, 76, 60, ${0.15 + t * 0.85})`;
  }

  return (
    <div className="view usage-matrix-view">
      <p className="hint">Provider (rows) × consumer (columns) — symbol import+ref counts</p>
      <div className="matrix-scroll">
        <table className="heatmap">
          <thead>
            <tr>
              <th />
              {consumers.map((c) => (
                <th key={c} className="rotated" title={c}>
                  {c.replace("@graviola/", "").slice(0, 12)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p}>
                <th title={p}>{p.replace("@graviola/", "").slice(0, 20)}</th>
                {consumers.map((c) => {
                  const v = matrix[p]?.[c] ?? 0;
                  return (
                    <td key={c} style={{ background: heat(v) }} title={`${v}`}>
                      {v > 0 ? v : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
