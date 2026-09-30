# @graviola/package-graph

A private review tool that shows the published `@graviola/*` library packages from several angles, so it's easy to decide where review effort should go before a release.

All data is derived deterministically from the repository (TypeScript compiler API, `package.json` files, knip, dependency-cruiser, jscpd, `bun audit`, git). Nothing is sent to an LLM.

## Usage

```bash
# from the repository root
bun run analyze:packages      # writes apps/package-graph/data/graph.json (+ public/data copy)
bun run dev:package-graph     # starts the viewer
bun run analyze:packages:md   # optional: markdown cards in apps/package-graph/generated/
```

Coverage is collected separately because it runs every package's test suite:

```bash
cd apps/package-graph && bun run analyze:coverage
```

The generated data (`data/`, `public/data/`, `generated/`) isn't committed. Run the analyzer after checkout.

## Views

| View | Question it answers |
| --- | --- |
| Risk × Cleanup | Which packages deserve an in-depth review first? Each axis is the weighted mean of per-signal percentiles; 0 means no signal was found. |
| Architecture | How do the packages depend on each other, layer by layer, and where are layer violations and cycles? |
| Security | Where are unsanitized query, HTML and code-execution sinks, and are they tested? |
| TS health | How often do packages use `any`, casts, non-null assertions and suppressions (per 1,000 lines)? |
| Coverage | Line, function and branch coverage per package, and untested public API. |
| Duplication | Clone clusters, same-name helpers across packages, and re-implementations of canonical helpers. |
| API surface | Which exports are used by whom, and which are unused or test-only? |
| Dependency hygiene | Unused or undeclared dependencies, peer-dependency candidates, version drift. |
| Usage matrix | Symbol usage between every pair of packages. |
| Consolidation | Single-consumer, tiny, co-imported and cyclic packages. |
| Review triage | All packages in one sortable table. |

## Configuration

- `config/layers.ts`: package → layer assignment (seeded from the layer tables in `CLAUDE.md`).
- `config/rules.ts`: peer and browser-only lists, domain vocabulary, score weights.
- `config/canonical-helpers.ts`: helpers that must not be re-implemented, and how to detect copies.

## Known analyzer limitations

- Some imports are missed by the usage scan (e.g. `X_CALC` in `formula-dependency`), so "unused" needs a grep before acting on it.
- UPPER_CASE constants are classified as `component`.
- Reinvention hits are also reported inside the canonical package itself.
