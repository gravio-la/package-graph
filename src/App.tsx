import { useMemo, useState } from "react";
import { FilterBar, type Filters } from "./components/FilterBar";
import { PackageCard } from "./components/PackageCard";
import { useGraphData } from "./hooks/useGraphData";
import { ArchitectureView } from "./views/ArchitectureView";
import { ApiSurfaceView } from "./views/ApiSurfaceView";
import { ConsolidationView } from "./views/ConsolidationView";
import { CoverageView } from "./views/CoverageView";
import { DependencyHygieneView } from "./views/DependencyHygieneView";
import { DuplicationView } from "./views/DuplicationView";
import { QuadrantView } from "./views/QuadrantView";
import { SecurityView } from "./views/SecurityView";
import { TriageView } from "./views/TriageView";
import { TsHealthView } from "./views/TsHealthView";
import { UsageMatrixView } from "./views/UsageMatrixView";

type ViewId =
  | "quadrant"
  | "architecture"
  | "api"
  | "deps"
  | "matrix"
  | "consolidation"
  | "duplication"
  | "coverage"
  | "tshealth"
  | "security"
  | "triage";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "quadrant", label: "Risk × Cleanup" },
  { id: "architecture", label: "Architecture" },
  { id: "security", label: "Security" },
  { id: "tshealth", label: "TS health" },
  { id: "coverage", label: "Coverage" },
  { id: "duplication", label: "Duplication" },
  { id: "api", label: "API surface" },
  { id: "deps", label: "Dependency hygiene" },
  { id: "matrix", label: "Usage matrix" },
  { id: "consolidation", label: "Consolidation" },
  { id: "triage", label: "Review triage" },
];

export default function App() {
  const { data, error, loading } = useGraphData();
  const [view, setView] = useState<ViewId>("quadrant");
  const [selected, setSelected] = useState<string | null>(null);
  const [focusNeighborhood, setFocusNeighborhood] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    layer: "all",
    hideTooling: false,
    edgeKinds: new Set(["prod", "peer", "dev", "undeclared"]),
  });

  const selectedPkg = useMemo(
    () => data?.packages.find((p) => p.name === selected) ?? null,
    [data, selected],
  );

  if (loading) return <div className="app loading">Loading graph.json…</div>;
  if (error || !data) {
    return (
      <div className="app error">
        <h1>Package Graph</h1>
        <p>{error ?? "No data"}</p>
        <p>Run <code>bun run analyze:packages</code> from the repo root.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top-bar">
        <h1>Graviola Package Graph</h1>
        <span className="meta">
          {data.packageCount} packages · {data.edges.length} edges · {data.generatedAt.slice(0, 10)}
          {data.toolErrors?.length ? ` · ${data.toolErrors.length} tool warning(s)` : ""}
        </span>
        <nav className="view-tabs">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={view === v.id ? "active" : ""}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="main-layout">
        <FilterBar filters={filters} onChange={setFilters} />

        <main className="content">
          {view === "quadrant" && (
            <QuadrantView graph={data} filters={filters} selected={selected} onSelect={setSelected} />
          )}
          {view === "architecture" && (
            <>
              <label className="focus-toggle">
                <input
                  type="checkbox"
                  checked={focusNeighborhood}
                  onChange={(e) => setFocusNeighborhood(e.target.checked)}
                />
                Focus neighborhood
              </label>
              <ArchitectureView
                graph={data}
                filters={filters}
                selected={selected}
                onSelect={setSelected}
                focusNeighborhood={focusNeighborhood}
              />
            </>
          )}
          {view === "api" && (
            <ApiSurfaceView graph={data} selected={selected} onSelect={setSelected} />
          )}
          {view === "deps" && (
            <DependencyHygieneView graph={data} selected={selected} onSelect={setSelected} />
          )}
          {view === "matrix" && <UsageMatrixView graph={data} />}
          {view === "consolidation" && (
            <ConsolidationView graph={data} onSelect={setSelected} />
          )}
          {view === "duplication" && (
            <DuplicationView graph={data} onSelect={setSelected} />
          )}
          {view === "coverage" && (
            <CoverageView graph={data} onSelect={setSelected} />
          )}
          {view === "tshealth" && (
            <TsHealthView graph={data} onSelect={setSelected} />
          )}
          {view === "security" && (
            <SecurityView graph={data} onSelect={setSelected} />
          )}
          {view === "triage" && (
            <TriageView graph={data} selected={selected} onSelect={setSelected} />
          )}
        </main>

        <PackageCard pkg={selectedPkg} graph={data} />
      </div>
    </div>
  );
}
