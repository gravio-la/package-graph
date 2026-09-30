import { useEffect, useState } from "react";
import type { GraphData } from "../types";

export function useGraphData() {
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/data/graph.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load graph.json (${r.status})`);
        return r.json();
      })
      .then((json: GraphData) => {
        setData(json);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  return { data, error, loading };
}
