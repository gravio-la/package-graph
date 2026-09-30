import type { LayerId } from "../types";

export interface Filters {
  search: string;
  layer: LayerId | "all";
  hideTooling: boolean;
  edgeKinds: Set<"prod" | "peer" | "dev" | "undeclared">;
}

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
}

const LAYERS: (LayerId | "all")[] = ["all", 1, 2, 3, 4, 5, 6, "tooling", "experimental", "unknown"];

export function FilterBar({ filters, onChange }: Props) {
  return (
    <aside className="filter-bar">
      <label>
        Search
        <input
          type="search"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="package name…"
        />
      </label>
      <label>
        Layer
        <select
          value={String(filters.layer)}
          onChange={(e) => {
            const v = e.target.value;
            onChange({
              ...filters,
              layer: v === "all" ? "all" : (Number.isNaN(Number(v)) ? v : Number(v)) as LayerId | "all",
            });
          }}
        >
          {LAYERS.map((l) => (
            <option key={String(l)} value={String(l)}>
              {l === "all" ? "All layers" : `Layer ${l}`}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={filters.hideTooling}
          onChange={(e) => onChange({ ...filters, hideTooling: e.target.checked })}
        />
        Hide tooling
      </label>
    </aside>
  );
}
