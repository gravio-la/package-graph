import { useMemo } from "react";
import type { GraphData } from "../types";
import { EXTERNAL_FAMILIES } from "../../config/rules";

interface Props {
  graph: GraphData;
  selected: string | null;
  onSelect: (name: string) => void;
}

function familyOf(pkg: string): string {
  for (const [family, members] of Object.entries(EXTERNAL_FAMILIES)) {
    if (members.some((m) => pkg === m || pkg.startsWith(m + "/"))) return family;
  }
  return "other";
}

export function DependencyHygieneView({ graph, selected, onSelect }: Props) {
  const pkg = graph.packages.find((p) => p.name === selected) ?? graph.packages[0];

  const allIssues = useMemo(() => {
    const issues: { package: string; issue: typeof graph.packages[0]["externalIssues"][0] }[] = [];
    for (const p of graph.packages) {
      for (const i of p.externalIssues) {
        issues.push({ package: p.name, issue: i });
      }
    }
    return issues.sort((a, b) => a.issue.kind.localeCompare(b.issue.kind));
  }, [graph.packages]);

  const runtimeViolations = graph.violations.filter((v) => v.kind === "runtime-constraint");

  return (
    <div className="view dep-hygiene-view">
      <div className="two-col">
        <section>
          <h3>All dependency issues ({allIssues.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Kind</th>
                <th>External</th>
                <th>Package</th>
                <th>Family</th>
              </tr>
            </thead>
            <tbody>
              {allIssues.slice(0, 200).map((row, i) => (
                <tr
                  key={i}
                  className={row.package === pkg?.name ? "selected" : ""}
                  onClick={() => onSelect(row.package)}
                >
                  <td><code>{row.issue.kind}</code></td>
                  <td>{row.issue.package}</td>
                  <td>{row.package.replace("@graviola/", "")}</td>
                  <td>{familyOf(row.issue.package)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h3>Browser-only → L1/L2 violations ({runtimeViolations.length})</h3>
          {runtimeViolations.length === 0 ? (
            <p className="ok">None detected</p>
          ) : (
            <ul>
              {runtimeViolations.map((v, i) => (
                <li key={i}>
                  <strong>{v.from}</strong> → {v.to}
                </li>
              ))}
            </ul>
          )}

          {pkg && (
            <>
              <h3>{pkg.name} issues</h3>
              <ul>
                {pkg.externalIssues.map((i) => (
                  <li key={`${i.kind}-${i.package}`}>
                    <code>{i.kind}</code> {i.package}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
