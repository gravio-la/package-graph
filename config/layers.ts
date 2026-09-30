import type { LayerId } from "../src/types";

/** Seeded from CLAUDE.md layer tables; unknown packages stay "unknown" until assigned here. */
export const PACKAGE_LAYERS: Record<string, LayerId> = {
  // Layer 1 — Foundation
  "@graviola/edb-core-types": 1,
  "@graviola/edb-core-utils": 1,
  "@graviola/edb-global-types": 1,
  "@graviola/store-core": 1,
  "@graviola/search-facet-schema": 1,
  "@graviola/typed-query-types": 1,
  "@graviola/json-schema-utils": 1,
  "@graviola/edb-build-helper": "tooling",
  "@graviola/edb-config-helper": 1,
  "@graviola/edb-tsconfig": "tooling",
  "@graviola/edb-tsup-config": "tooling",
  "@graviola/meta-schema": 1,
  "@graviola/provenance-types": 1,
  "@graviola/statement-meta": 1,
  "@graviola/entity-ref-core": 1,
  "@graviola/fulltext-search-core": 1,
  "@graviola/facet-core": 1,
  "@graviola/sidecar-core": 1,

  // Layer 2 — Schema → Query
  "@graviola/sparql-schema": 2,
  "@graviola/edb-graph-traversal": 2,
  "@graviola/sparql-db-impl": 2,
  "@graviola/prisma-db-impl": 2,
  "@graviola/restfull-fetch-db-impl": 2,
  "@graviola/json-schema-prisma-utils": 2,
  "@graviola/json-schema2prisma-schema": 2,
  "@graviola/remote-query-implementations": 2,
  "@graviola/edb-data-mapping": 2,
  "@graviola/data-acquisition": 2,
  "@graviola/job-schema": 2,
  "@graviola/edb-authorities": 2,
  "@graviola/edb-wikidata-utils": 2,
  "@graviola/edb-file-import": 2,
  "@graviola/edb-maintenance-utils": 2,
  "@graviola/formula-dependency": 2,
  "@graviola/formula-runtime": 2,
  "@graviola/formula-materialization": 2,
  "@graviola/calc-engine": 2,
  "@graviola/calc-worker": 2,
  "@graviola/sparql-tools": 2,
  "@graviola/meilisearch-sparql-store": 2,
  "@graviola/rest-store-server": 2,
  "@graviola/rest-store-client": 2,
  "@graviola/rest-server-hono": 2,
  "@graviola/store-factory": 2,
  "@graviola/jsonld-utils": 2,

  // Layer 3 — State & hooks
  "@graviola/edb-state-hooks": 3,
  "@graviola/data-mapping-hooks": 3,
  "@graviola/edb-debug-utils": 3,
  "@graviola/formula-runtime-react": 3,

  // Layer 4 — Store providers
  "@graviola/sparql-store-provider": 4,
  "@graviola/local-oxigraph-store-provider": 4,
  "@graviola/rest-store-provider": 4,
  "@graviola/async-oxigraph": 4,

  // Layer 5 — Form rendering
  "@graviola/semantic-json-form": 5,
  "@graviola/semantic-jsonform-types": 5,
  "@graviola/edb-basic-renderer": 5,
  "@graviola/edb-linked-data-renderer": 5,
  "@graviola/edb-layout-renderer": 5,
  "@graviola/linked-markdown-renderer": 5,
  "@graviola/edb-markdown-renderer": 5,
  "@graviola/edb-detail-renderer-core": 5,
  "@graviola/edb-detail-renderer": 5,

  // Layer 6 — UI components
  "@graviola/edb-basic-components": 6,
  "@graviola/edb-advanced-components": 6,
  "@graviola/edb-table-components": 6,
  "@graviola/edb-virtualized-components": 6,
  "@graviola/edb-ui-utils": 6,
  "@graviola/entity-finder": 6,
  "@graviola/edb-default-theme": 6,
  "@graviola/entity-embed": 6,
  "@graviola/facet-components": 6,
  "@graviola/semantic-views": 6,
  "@graviola/edb-table-mrt-adapter": 6,
  "@graviola/edb-table-renderer-jsonld": 6,
  "@graviola/edb-table-renderer-sparql-select": 6,
  "@graviola/edb-table-types": 6,
  "@graviola/edb-import-components": 6,
  "@graviola/edb-import-demo-schema": 6,
  "@graviola/edb-import-staging": 6,
  "@graviola/edb-secondary-sources": 6,
  "@graviola/graviola-app-config": 6,

  // Tooling
  "eslint-config-edb": "tooling",
  "@graviola/edb-cli-creator": "tooling",

  // Private / fixtures (excluded from published graph but mapped if seen)
  "@graviola/calc-fixtures": "experimental",
  "@graviola/sample-data-geo": "experimental",
  "@graviola/indexeddb-dataset": "experimental",
  "@graviola/indexeddb-store-provider": "experimental",
};

export function layerNumber(layer: LayerId): number {
  if (typeof layer === "number") return layer;
  if (layer === "tooling") return 0;
  if (layer === "experimental") return 7;
  return 99;
}

export function isLayerViolation(fromLayer: LayerId, toLayer: LayerId): boolean {
  const from = layerNumber(fromLayer);
  const to = layerNumber(toLayer);
  if (from === 99 || to === 99 || from === 0 || to === 0) return false;
  return to > from;
}
