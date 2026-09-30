import type { GraphData } from "../types";

interface Props {
  graph: GraphData;
  selected: string | null;
  onSelect: (name: string) => void;
}

export function ApiSurfaceView({ graph, selected, onSelect }: Props) {
  const pkg = graph.packages.find((p) => p.name === selected) ?? graph.packages[0];
  if (!pkg) return <div className="view">No packages</div>;

  const sorted = [...pkg.exports].sort((a, b) => {
    if (a.unused !== b.unused) return a.unused ? -1 : 1;
    return a.consumers.length - b.consumers.length;
  });

  return (
    <div className="view api-surface-view">
      <div className="pkg-picker">
        {graph.packages.map((p) => (
          <button
            key={p.name}
            className={p.name === pkg.name ? "active" : ""}
            onClick={() => onSelect(p.name)}
          >
            {p.name.replace("@graviola/", "")}
          </button>
        ))}
      </div>
      <h3>{pkg.name} — {pkg.exports.length} exports</h3>
      <table>
        <thead>
          <tr>
            <th>Export</th>
            <th>Kind</th>
            <th>Consumers</th>
            <th>Refs</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const flags = [
              e.unused && "unused",
              e.usedOnlyByTests && "test-only",
              e.usedOnlyByApps && "app-only",
              e.isReExport && "re-export",
              e.knipUnused && "knip",
            ].filter(Boolean).join(", ");
            const refs = e.consumers.reduce((s, c) => s + c.referenceCount, 0);
            return (
              <tr key={e.name} className={e.unused ? "unused" : ""}>
                <td><code>{e.name}</code></td>
                <td>{e.kind}</td>
                <td>{e.consumers.filter((c) => !c.isTest).length}</td>
                <td>{refs}</td>
                <td>{flags || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
