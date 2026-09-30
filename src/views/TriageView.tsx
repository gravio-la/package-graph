import type { GraphData } from "../types";
import { layerColor, scoreColor } from "../utils/colors";

interface Props {
  graph: GraphData;
  selected: string | null;
  onSelect: (name: string) => void;
}

export function TriageView({ graph, selected, onSelect }: Props) {
  const sorted = [...graph.packages].sort((a, b) => b.reviewScore.total - a.reviewScore.total);

  return (
    <div className="view triage-view">
      <table>
        <thead>
          <tr>
            <th>Score</th>
            <th>Package</th>
            <th>Layer</th>
            <th>LOC</th>
            <th>Exports</th>
            <th>Unused</th>
            <th>Dep issues</th>
            <th>Violations</th>
            <th>API</th>
            <th>Deps</th>
            <th>Slop</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr
              key={p.name}
              className={selected === p.name ? "selected" : ""}
              onClick={() => onSelect(p.name)}
            >
              <td>
                <span className="score-pill" style={{ background: scoreColor(p.reviewScore.total) }}>
                  {p.reviewScore.total}
                </span>
              </td>
              <td className="pkg-name">{p.name.replace("@graviola/", "")}</td>
              <td>
                <span className="layer-dot" style={{ background: layerColor(p.layer) }} />
                {String(p.layer)}
              </td>
              <td>{p.metrics.loc}</td>
              <td>{p.exports.length}</td>
              <td>{p.exports.filter((e) => e.unused).length}</td>
              <td>{p.externalIssues.length}</td>
              <td>{graph.violations.filter((v) => v.from === p.name).length}</td>
              <td>{p.reviewScore.apiBloat}</td>
              <td>{p.reviewScore.dependencySmells}</td>
              <td>{p.reviewScore.slopHeuristics}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
