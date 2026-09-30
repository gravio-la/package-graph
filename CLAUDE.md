# CLAUDE.md — package-graph

Private monorepo review tool: visualizes `@graviola/*` packages (architecture, risk, coverage, security, duplication, API surface). All metrics are computed locally from the framework checkout — no LLM calls.

When run standalone, point analysis scripts at a sibling `graviola-framework` checkout (see `scripts/lib/workspace.ts`).

## Run

```bash
bun install
bun run analyze        # writes data/graph.json (+ public/data copy)
bun run dev            # Vite viewer
bun run analyze:coverage   # optional: runs all package tests for coverage
```

## Layout

| Path | Role |
| --- | --- |
| `scripts/analyze.ts` | Main pipeline entry |
| `scripts/lib/` | knip, depcruise, jscpd, TS stats, graph builder |
| `config/` | Layer rules, security sinks, canonical helpers |
| `src/views/` | React Flow visualization tabs |
