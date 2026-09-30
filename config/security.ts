/** Security-sensitive package classification. */

export type SecurityClass =
  | "query-builder"
  | "http-surface"
  | "outbound-fetch"
  | "untrusted-parsing"
  | "xss-rendering"
  | "expression-eval";

export const SECURITY_CLASSIFICATION: Record<string, SecurityClass> = {
  "@graviola/sparql-schema": "query-builder",
  "@graviola/sparql-db-impl": "query-builder",
  "@graviola/remote-query-implementations": "query-builder",
  "@graviola/sparql-tools": "query-builder",
  "@graviola/facet-core": "query-builder",
  "@graviola/fulltext-search-core": "query-builder",
  "@graviola/meilisearch-sparql-store": "query-builder",
  "@graviola/prisma-db-impl": "query-builder",
  "@graviola/json-schema-prisma-utils": "query-builder",
  "@graviola/rest-server-hono": "http-surface",
  "@graviola/rest-store-server": "http-surface",
  "@graviola/restfull-fetch-db-impl": "http-surface",
  "@graviola/rest-store-client": "http-surface",
  "@graviola/edb-authorities": "outbound-fetch",
  "@graviola/edb-wikidata-utils": "outbound-fetch",
  "@graviola/data-acquisition": "outbound-fetch",
  "@graviola/edb-secondary-sources": "outbound-fetch",
  "@graviola/edb-file-import": "untrusted-parsing",
  "@graviola/edb-maintenance-utils": "untrusted-parsing",
  "@graviola/edb-markdown-renderer": "xss-rendering",
  "@graviola/linked-markdown-renderer": "xss-rendering",
  "@graviola/edb-detail-renderer": "xss-rendering",
  "@graviola/formula-runtime": "expression-eval",
  "@graviola/calc-engine": "expression-eval",
};

export const THREAT_MODEL = `The attacker controls entity data: literals, IRIs, labels, records from external authorities, search strings, filter values, sort/paging params, and URL state. JSON Schemas are trusted. Main risk: stored injection — data imported today ends up interpolated into a query tomorrow.`;

export const KNOWN_SANITIZERS = [
  "escapeLiteral",
  "escapeIri",
  "sanitizeVariableName",
  "encodeIRI",
  "encodeURIComponent",
];
