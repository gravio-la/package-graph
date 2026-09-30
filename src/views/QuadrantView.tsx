import type { Filters } from "../components/FilterBar";
import type { GraphData } from "../types";
import { layerColor } from "../utils/colors";
import { filterPackages } from "../utils/filterPackages";

interface Props {
  graph: GraphData;
  filters: Filters;
  selected: string | null;
  onSelect: (name: string) => void;
}

export function QuadrantView({ graph, filters, selected, onSelect }: Props) {
  const packages = filterPackages(graph.packages, filters);
  const maxLoc = Math.max(...packages.map((p) => p.metrics.loc), 1);
  const coverageUnknown = packages.filter((p) => !p.reviewScore.coverageKnown).length;

  return (
    <div className="quadrant-view">
      <h2>Risk × Cleanup</h2>
      <p className="hint">
        Top-right quadrant = review in depth first. Size = LOC, color = layer. Each axis is the
        weighted mean of per-signal percentiles, so 0 means no signal was found.
      </p>
      {coverageUnknown > 0 && (
        <p className="hint warning">
          Coverage not measured for {coverageUnknown} of {packages.length} packages: their risk
          excludes the untested-API signal. Run <code>bun run analyze:coverage</code> in apps/package-graph.
        </p>
      )}
      <svg viewBox="0 0 600 600" className="quadrant-chart">
        <line x1="50" y1="550" x2="550" y2="550" stroke="#666" />
        <line x1="50" y1="50" x2="50" y2="550" stroke="#666" />
        <text x="300" y="580" textAnchor="middle" fontSize="12">Cleanup →</text>
        <text x="20" y="300" textAnchor="middle" fontSize="12" transform="rotate(-90 20 300)">Risk →</text>
        {[25, 50, 75].map((t) => (
          <g key={t}>
            <line x1={50 + t * 5} y1="50" x2={50 + t * 5} y2="550" stroke="#333" strokeDasharray="4" />
            <line x1="50" y1={550 - t * 5} x2="550" y2={550 - t * 5} stroke="#333" strokeDasharray="4" />
          </g>
        ))}
        {packages.map((pkg) => {
          const x = 50 + ((pkg.cleanupScore ?? 0) / 100) * 500;
          const y = 550 - ((pkg.riskScore ?? 0) / 100) * 500;
          const r = 4 + (pkg.metrics.loc / maxLoc) * 20;
          return (
            <circle
              key={pkg.name}
              cx={x}
              cy={y}
              r={r}
              fill={layerColor(pkg.layer)}
              opacity={selected === pkg.name ? 1 : 0.7}
              stroke={selected === pkg.name ? "#fff" : "none"}
              strokeWidth={2}
              onClick={() => onSelect(pkg.name)}
              style={{ cursor: "pointer" }}
            >
              <title>{`${pkg.name}\nRisk: ${pkg.riskScore ?? 0} Cleanup: ${pkg.cleanupScore ?? 0}\nLOC: ${pkg.metrics.loc}`}</title>
            </circle>
          );
        })}
      </svg>
      <ol className="top-review">
        {[...packages]
          .sort((a, b) => (b.riskScore ?? 0) + (b.cleanupScore ?? 0) - ((a.riskScore ?? 0) + (a.cleanupScore ?? 0)))
          .slice(0, 10)
          .map((p) => (
            <li key={p.name}>
              <button type="button" onClick={() => onSelect(p.name)}>
                {p.name}
              </button>
              {" — risk "}{p.riskScore ?? 0}, cleanup {p.cleanupScore ?? 0}
            </li>
          ))}
      </ol>
    </div>
  );
}
