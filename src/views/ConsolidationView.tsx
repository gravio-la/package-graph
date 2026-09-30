import type { GraphData } from "../types";

interface Props {
  graph: GraphData;
  onSelect: (name: string) => void;
}

export function ConsolidationView({ graph, onSelect }: Props) {
  const deterministic = graph.consolidationCandidates;

  return (
    <div className="view consolidation-view">
      <section>
        <h3>Deterministic candidates ({deterministic.length})</h3>
        <ul className="candidates">
          {deterministic.map((c, i) => (
            <li key={i}>
              <span className="kind">{c.kind}</span>
              {c.packages.map((p) => (
                <button key={p} onClick={() => onSelect(p)}>{p.replace("@graviola/", "")}</button>
              ))}
              <span className="reason">{c.reason}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
