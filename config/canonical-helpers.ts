/** Canonical helper registry — "reuse before reinvent" detectors. */

export interface CanonicalHelperRule {
  id: string;
  pattern: RegExp;
  replacement: string;
  provider: string;
  layer: number;
}

export const CANONICAL_HELPERS: CanonicalHelperRule[] = [
  {
    id: "clone-deep",
    pattern: /JSON\.parse\s*\(\s*JSON\.stringify\s*\(/,
    replacement: "lodash-es/cloneDeep",
    provider: "lodash-es",
    layer: 1,
  },
  {
    id: "uniq-set",
    pattern: /\[\s*\.\.\.\s*new\s+Set\s*\(/,
    replacement: "lodash-es/uniq",
    provider: "lodash-es",
    layer: 1,
  },
  {
    id: "path-get",
    pattern: /\.split\s*\(\s*['"][.]['"]\s*\)\.reduce\s*\(/,
    replacement: "lodash-es/get",
    provider: "lodash-es",
    layer: 1,
  },
  {
    id: "debounce",
    pattern: /setTimeout\s*\([^)]*debounc/i,
    replacement: "lodash-es/debounce",
    provider: "lodash-es",
    layer: 1,
  },
  {
    id: "definition-ref",
    pattern: /#\/definitions\/|#\$defs\//,
    replacement: "@graviola/json-schema-utils (definitionNameFromRef, definitionScope)",
    provider: "@graviola/json-schema-utils",
    layer: 1,
  },
  {
    id: "local-resolve-ref",
    pattern: /function\s+resolveRef\s*\(|const\s+resolveRef\s*=/,
    replacement: "@graviola/json-schema-utils",
    provider: "@graviola/json-schema-utils",
    layer: 1,
  },
  {
    id: "iri-encode",
    pattern: /encodeURIComponent\s*\([^)]*iri|encodeURIComponent\s*\([^)]*IRI/i,
    replacement: "@graviola/edb-core-utils",
    provider: "@graviola/edb-core-utils",
    layer: 1,
  },
  {
    id: "sparql-escape",
    pattern: /function\s+(escapeLiteral|sanitizeVariableName)\s*\(/,
    replacement: "canonical SPARQL escaper module (Layer 1/2)",
    provider: "@graviola/sparql-schema",
    layer: 2,
  },
];
