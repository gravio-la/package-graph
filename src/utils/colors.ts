import type { LayerId } from "../types";

const LAYER_COLORS: Record<string, string> = {
  "1": "#4a90d9",
  "2": "#50b86c",
  "3": "#e6a817",
  "4": "#e67e22",
  "5": "#9b59b6",
  "6": "#e74c3c",
  tooling: "#95a5a6",
  experimental: "#bdc3c7",
  unknown: "#7f8c8d",
};

export function layerColor(layer: LayerId): string {
  return LAYER_COLORS[String(layer)] ?? LAYER_COLORS.unknown;
}

export function scoreColor(score: number): string {
  if (score >= 30) return "#e74c3c";
  if (score >= 15) return "#e67e22";
  if (score >= 8) return "#f1c40f";
  return "#2ecc71";
}
