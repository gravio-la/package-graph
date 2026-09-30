import { THREAT_MODEL } from "../../config/security";
import type { GraphData } from "../types";

interface Props {
  graph: GraphData;
  onSelect: (name: string) => void;
}

export function SecurityView({ graph, onSelect }: Props) {
  const sensitive = graph.packages.filter((p) => p.security && (p.security.sinks.length > 0 || p.security.classification));

  return (
    <div className="security-view">
      <h2>Security</h2>
      <section className="threat-model">
        <h3>Threat model</h3>
        <p>{THREAT_MODEL}</p>
      </section>
      {sensitive.map((pkg) => (
        <section key={pkg.name} className="security-pkg">
          <h3>
            <button type="button" onClick={() => onSelect(pkg.name)}>{pkg.name}</button>
            {pkg.security?.classification && (
              <span className="badge">{pkg.security.classification}</span>
            )}
            {pkg.security?.cveCount ? (
              <span className="badge warn">{pkg.security.cveCount} CVE(s)</span>
            ) : null}
          </h3>
          <table>
            <thead>
              <tr><th>Kind</th><th>File</th><th>Line</th><th>Sanitized</th><th>Snippet</th></tr>
            </thead>
            <tbody>
              {(pkg.security?.sinks ?? []).map((s, i) => (
                <tr key={i} className={!s.sanitized ? "hot" : ""}>
                  <td>{s.kind}</td>
                  <td>{s.file}</td>
                  <td>{s.line}</td>
                  <td>{s.sanitized ? `yes (${s.sanitizer})` : "no"}</td>
                  <td><code>{s.snippet}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
