import type { GraphData } from "../types";

interface Props {
  graph: GraphData;
  onSelect: (name: string) => void;
}

export function DuplicationView({ graph, onSelect }: Props) {
  const redundancy = graph.redundancy;

  return (
    <div className="duplication-view">
      <h2>Duplication &amp; Reinvention</h2>
      <h3>Clone clusters ({redundancy?.cloneClusters.length ?? 0})</h3>
      <ul>
        {(redundancy?.cloneClusters ?? []).slice(0, 30).map((c) => (
          <li key={c.id}>
            <strong>{c.classification}</strong> — {c.packages.join(", ")} ({c.lines} lines)
          </li>
        ))}
      </ul>
      <h3>Name collisions</h3>
      <ul>
        {(redundancy?.nameCollisions ?? []).slice(0, 20).map((c) => (
          <li key={c.name}>
            <strong>{c.name}</strong> ×{c.sites.length}:
            {c.sites.map((s) => (
              <button key={`${s.package}-${s.file}`} type="button" onClick={() => onSelect(s.package)}>
                {s.package.replace("@graviola/", "")}
              </button>
            ))}
          </li>
        ))}
      </ul>
      <h3>Reinvention hits</h3>
      <table>
        <thead>
          <tr><th>Rule</th><th>Package</th><th>Location</th></tr>
        </thead>
        <tbody>
          {(redundancy?.reinventionHits ?? []).slice(0, 40).map((h, i) => (
            <tr key={i}>
              <td>{h.ruleId}</td>
              <td><button type="button" onClick={() => onSelect(h.package)}>{h.package}</button></td>
              <td>{h.file}:{h.line}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
