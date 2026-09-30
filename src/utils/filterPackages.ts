import type { Filters } from "../components/FilterBar";
import type { PackageNode } from "../types";

/** Applies the sidebar filters (tooling, layer, name search) shared by all package views. */
export function filterPackages(packages: PackageNode[], filters: Filters): PackageNode[] {
  const search = filters.search.toLowerCase();
  return packages.filter((p) => {
    if (filters.hideTooling && p.layer === "tooling") return false;
    if (filters.layer !== "all" && p.layer !== filters.layer) return false;
    if (search && !p.name.toLowerCase().includes(search)) return false;
    return true;
  });
}
