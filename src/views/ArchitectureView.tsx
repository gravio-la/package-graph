import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Filters } from "../components/FilterBar";
import type { GraphData, PackageNode } from "../types";
import { layerColor, scoreColor } from "../utils/colors";
import { layoutWithElk } from "../utils/elkLayout";
import { filterPackages } from "../utils/filterPackages";

interface Props {
  graph: GraphData;
  filters: Filters;
  selected: string | null;
  onSelect: (name: string) => void;
  focusNeighborhood?: boolean;
}

function nodeSize(loc: number): { width: number; height: number } {
  const w = Math.min(220, Math.max(120, 80 + Math.sqrt(loc) * 2));
  const h = Math.min(80, Math.max(44, 36 + Math.sqrt(loc)));
  return { width: w, height: h };
}

export function ArchitectureView({ graph, filters, selected, onSelect, focusNeighborhood }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const filteredPackages = useMemo(
    () => filterPackages(graph.packages, filters),
    [graph.packages, filters],
  );

  const pkgSet = useMemo(() => new Set(filteredPackages.map((p) => p.name)), [filteredPackages]);

  const neighborhood = useMemo(() => {
    if (!focusNeighborhood || !selected) return pkgSet;
    const result = new Set<string>([selected]);
    for (const e of graph.edges) {
      if (e.from === selected) result.add(e.to);
      if (e.to === selected) result.add(e.from);
    }
    return new Set([...result].filter((n) => pkgSet.has(n)));
  }, [focusNeighborhood, selected, graph.edges, pkgSet]);

  const buildGraph = useCallback(async () => {
    const pkgs = filteredPackages.filter((p) => neighborhood.has(p.name));
    const violationPairs = new Set(
      graph.violations.map((v) => `${v.from}->${v.to}`),
    );

    const rawNodes: Node[] = pkgs.map((p: PackageNode) => {
      const size = nodeSize(p.metrics.loc);
      const vCount = graph.violations.filter((v) => v.from === p.name || v.to === p.name).length;
      const short = p.name.replace("@graviola/", "");
      return {
        id: p.name,
        data: { label: short },
        position: { x: 0, y: 0 },
        style: {
          ...size,
          background: layerColor(p.layer),
          color: "#fff",
          border: selected === p.name ? "3px solid #fff" : `2px solid ${scoreColor(p.reviewScore.total)}`,
          borderRadius: 8,
          fontSize: 11,
          padding: 4,
          cursor: "pointer",
        },
        draggable: true,
      };
    });

    const rawEdges: Edge[] = graph.edges
      .filter((e) => neighborhood.has(e.from) && neighborhood.has(e.to))
      .filter((e) => {
        if (e.edgeType === "prod") return filters.edgeKinds.has("prod");
        if (e.edgeType === "peer") return filters.edgeKinds.has("peer");
        if (e.edgeType === "dev") return filters.edgeKinds.has("dev");
        return true;
      })
      .map((e, i) => {
        const isViolation = violationPairs.has(`${e.from}->${e.to}`);
        const isCycle = graph.cycles.some((c) => c.includes(e.from) && c.includes(e.to));
        return {
          id: `e-${i}-${e.from}-${e.to}`,
          source: e.from,
          target: e.to,
          label: e.symbolCount > 0 ? String(e.symbolCount) : undefined,
          style: {
            stroke: isViolation || isCycle ? "#e74c3c" : e.declared ? "#888" : "#aaa",
            strokeWidth: Math.min(6, 1 + Math.log2(e.symbolCount + 1)),
            strokeDasharray: e.declared && !e.imported ? "6 4" : undefined,
          },
          animated: isCycle,
        };
      });

    const laid = await layoutWithElk(rawNodes, rawEdges);
    setNodes(laid);
    setEdges(rawEdges);
  }, [filteredPackages, neighborhood, graph, filters.edgeKinds, selected, setNodes, setEdges]);

  useEffect(() => {
    buildGraph();
  }, [buildGraph]);

  return (
    <div className="view architecture-view">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, n) => onSelect(n.id)}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
