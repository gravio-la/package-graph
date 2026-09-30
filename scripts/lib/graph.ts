import { isLayerViolation, layerNumber } from "../../config/layers";
import type {
  ConsolidationCandidate,
  GraphViolation,
  PackageExport,
  WorkspaceEdge,
} from "../../src/types";
import type { WorkspacePackage } from "./workspace";

export function buildWorkspaceEdges(
  packages: WorkspacePackage[],
  workspaceImports: Map<string, Set<string>>,
  exportsByPackage: Map<string, PackageExport[]>,
): WorkspaceEdge[] {
  const pkgNames = new Set(packages.map((p) => p.name));
  const edges: WorkspaceEdge[] = [];
  const seen = new Set<string>();

  for (const pkg of packages) {
    for (const [dep, _v] of Object.entries(pkg.dependencies)) {
      if (!pkgNames.has(dep)) continue;
      const key = `${pkg.name}->${dep}:prod`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from: pkg.name,
        to: dep,
        edgeType: "prod",
        declared: true,
        imported: workspaceImports.get(pkg.name)?.has(dep) ?? false,
        symbolCount: countSymbols(pkg.name, dep, exportsByPackage),
      });
    }
    for (const [dep] of Object.entries(pkg.peerDependencies)) {
      if (!pkgNames.has(dep)) continue;
      const key = `${pkg.name}->${dep}:peer`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from: pkg.name,
        to: dep,
        edgeType: "peer",
        declared: true,
        imported: workspaceImports.get(pkg.name)?.has(dep) ?? false,
        symbolCount: countSymbols(pkg.name, dep, exportsByPackage),
      });
    }
    for (const [dep] of Object.entries(pkg.devDependencies)) {
      if (!pkgNames.has(dep)) continue;
      const key = `${pkg.name}->${dep}:dev`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from: pkg.name,
        to: dep,
        edgeType: "dev",
        declared: true,
        imported: workspaceImports.get(pkg.name)?.has(dep) ?? false,
        symbolCount: 0,
      });
    }
  }

  // Imported but not declared
  for (const [from, imports] of workspaceImports) {
    for (const to of imports) {
      if (!pkgNames.has(to)) continue;
      const pkg = packages.find((p) => p.name === from);
      if (!pkg) continue;
      const declared =
        to in pkg.dependencies || to in pkg.peerDependencies || to in pkg.devDependencies;
      if (!declared) {
        const key = `${from}->${to}:undeclared`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          from,
          to,
          edgeType: "prod",
          declared: false,
          imported: true,
          symbolCount: countSymbols(from, to, exportsByPackage),
        });
      }
    }
  }

  return edges;
}

function countSymbols(
  consumer: string,
  provider: string,
  exportsByPackage: Map<string, PackageExport[]>,
): number {
  const exports = exportsByPackage.get(provider) ?? [];
  let count = 0;
  for (const exp of exports) {
    for (const c of exp.consumers) {
      if (c.package === consumer) count += c.importCount + c.referenceCount;
    }
  }
  return count;
}

export function computeFanMetrics(
  packages: WorkspacePackage[],
  edges: WorkspaceEdge[],
): Map<string, { fanIn: number; fanOut: number; instability: number }> {
  const metrics = new Map<string, { fanIn: number; fanOut: number; instability: number }>();
  for (const pkg of packages) {
    metrics.set(pkg.name, { fanIn: 0, fanOut: 0, instability: 0 });
  }
  for (const edge of edges) {
    if (edge.edgeType === "dev") continue;
    metrics.get(edge.from)!.fanOut += 1;
    metrics.get(edge.to)!.fanIn += 1;
  }
  for (const [name, m] of metrics) {
    m.instability = m.fanIn + m.fanOut > 0 ? m.fanOut / (m.fanIn + m.fanOut) : 0;
    metrics.set(name, m);
  }
  return metrics;
}

export function tarjanCycles(edges: WorkspaceEdge[]): string[][] {
  const graph = new Map<string, string[]>();
  for (const e of edges) {
    if (e.edgeType === "dev") continue;
    if (!graph.has(e.from)) graph.set(e.from, []);
    graph.get(e.from)!.push(e.to);
  }

  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  let idx = 0;

  function strongConnect(v: string) {
    index.set(v, idx);
    lowlink.set(v, idx);
    idx += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
      }
    }

    if (lowlink.get(v) === index.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) cycles.push(scc.sort());
    }
  }

  for (const v of graph.keys()) {
    if (!index.has(v)) strongConnect(v);
  }
  return cycles;
}

export function findLayerViolations(
  packages: WorkspacePackage[],
  edges: WorkspaceEdge[],
): GraphViolation[] {
  const layerMap = new Map(packages.map((p) => [p.name, p.layer]));
  const violations: GraphViolation[] = [];
  for (const edge of edges) {
    if (edge.edgeType === "dev") continue;
    const fromLayer = layerMap.get(edge.from)!;
    const toLayer = layerMap.get(edge.to)!;
    if (isLayerViolation(fromLayer, toLayer)) {
      violations.push({
        kind: "layer",
        from: edge.from,
        to: edge.to,
        detail: `Layer ${layerNumber(fromLayer)} → ${layerNumber(toLayer)}`,
      });
    }
  }
  return violations;
}

export function findConsolidationCandidates(
  packages: WorkspacePackage[],
  edges: WorkspaceEdge[],
  exportsByPackage: Map<string, PackageExport[]>,
  cycles: string[][],
): ConsolidationCandidate[] {
  const candidates: ConsolidationCandidate[] = [];
  const fanIn = new Map<string, number>();

  for (const pkg of packages) fanIn.set(pkg.name, 0);
  for (const e of edges) {
    if (e.edgeType !== "dev") fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
  }

  for (const pkg of packages) {
    if ((fanIn.get(pkg.name) ?? 0) === 1) {
      candidates.push({
        kind: "single-consumer",
        packages: [pkg.name],
        reason: "Only one downstream consumer in the workspace graph",
      });
    }
    const metrics = exportsByPackage.get(pkg.name);
    const exportCount = metrics?.length ?? 0;
    if (exportCount <= 3 && pkg.folder.includes("packages")) {
      const loc = 0; // filled by caller if needed
      if (loc < 500) {
        /* tiny check uses metrics elsewhere */
      }
    }
  }

  for (const cycle of cycles) {
    candidates.push({
      kind: "cycle-group",
      packages: cycle,
      reason: `Circular dependency: ${cycle.join(" ↔ ")}`,
    });
  }

  return candidates;
}
