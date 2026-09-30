/** Thresholds and classification lists for the analyzer. */

export const PEER_CANDIDATES = [
  "react",
  "react-dom",
  "react-router-dom",
  "@mui/material",
  "@mui/icons-material",
  "@mui/x-date-pickers",
  "@mui/x-tree-view",
  "@emotion/react",
  "@emotion/styled",
  "@emotion/cache",
  "@jsonforms/core",
  "@jsonforms/react",
  "@jsonforms/material-renderers",
  "@tanstack/react-query",
  "@tanstack/react-query-devtools",
];

export const BROWSER_ONLY_EXTERNALS = [
  "react",
  "react-dom",
  "react-router-dom",
  "@mui/material",
  "@mui/icons-material",
  "@mui/x-date-pickers",
  "@mui/x-tree-view",
  "@emotion/react",
  "@emotion/styled",
  "@jsonforms/react",
  "@jsonforms/material-renderers",
  "@graviola/async-oxigraph",
];

export const DOMAIN_VOCABULARY = [
  "Garden",
  "Landtag",
  "Lehrplan",
  "slub",
  "kxp",
  "K10plus",
  "parliament",
  "kulinarik",
  "exhibition",
  "http://example.org/",
  "http://slub",
];

export const INACTIVE_PACKAGES = [
  "@graviola/indexeddb-dataset",
  "@graviola/indexeddb-store-provider",
];

export const RISK_SCORE_WEIGHTS = {
  securitySinks: 3.0,
  cves: 2.0,
  untestedApi: 2.5,
  anyInPublicApi: 1.5,
};

export const CLEANUP_SCORE_WEIGHTS = {
  apiBloat: 2.0,
  dependencySmells: 1.5,
  violations: 2.5,
  duplication: 2.0,
  tsHealth: 1.0,
  slopHeuristics: 1.0,
};

export const EXTERNAL_FAMILIES: Record<string, string[]> = {
  react: ["react", "react-dom", "react-router-dom", "react-i18next", "react-redux"],
  mui: ["@mui/material", "@mui/icons-material", "@mui/x-date-pickers", "@mui/x-tree-view"],
  emotion: ["@emotion/react", "@emotion/styled", "@emotion/cache"],
  jsonforms: ["@jsonforms/core", "@jsonforms/react", "@jsonforms/material-renderers"],
  rdf: ["@rdfjs/data-model", "@rdfjs/types", "@rdfjs/namespace", "@rdfjs/dataset", "n3", "jsonld"],
  query: ["@tanstack/react-query", "@tanstack/react-query-devtools"],
  prisma: ["@prisma/client", "prisma"],
};

export const GIT_WINDOW_MONTHS = 6;

