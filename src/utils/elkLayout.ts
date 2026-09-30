import ELK from "elkjs/lib/elk.bundled.js";
import type { Node, Edge } from "@xyflow/react";

const elk = new ELK();

export async function layoutWithElk(
  nodes: Node[],
  edges: Edge[],
  direction: "DOWN" | "RIGHT" = "DOWN",
): Promise<Node[]> {
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "60",
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: (n.style?.width as number) ?? 160,
      height: (n.style?.height as number) ?? 60,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const layout = await elk.layout(graph);
  const posMap = new Map(layout.children?.map((c) => [c.id, c]) ?? []);

  return nodes.map((n) => {
    const laid = posMap.get(n.id);
    return {
      ...n,
      position: { x: laid?.x ?? 0, y: laid?.y ?? 0 },
    };
  });
}
