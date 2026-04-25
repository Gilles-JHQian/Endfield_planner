# Endfield Planner

Design automation tool for the integrated industry system in _Arknights: Endfield_. See [plan/REQUIREMENT.md](plan/REQUIREMENT.md) for scope, priorities, and technical decisions; [plan/RESEARCH_FINDINGS.md](plan/RESEARCH_FINDINGS.md) for community-sourced domain research.

## Status

Phase 0 + Phase 1 in progress. See `git log --first-parent main` for milestone commits.

## Requirements

- Node.js ≥ 20 (corepack enabled or pnpm installed manually)
- pnpm ≥ 10

## Scripts

```bash
pnpm install         # install dependencies
pnpm dev             # start vite dev server (http://localhost:5173)
pnpm build           # typecheck + production build to dist/
pnpm test            # run vitest (core + ui projects)
pnpm test:watch      # vitest in watch mode
pnpm lint            # eslint
pnpm format          # prettier --write .
pnpm format:check    # prettier --check . (used by CI)
pnpm typecheck       # tsc --noEmit (project references)
pnpm verify          # local pre-commit pipeline = format:check + lint + typecheck + test
```

Future scripts (added in later branches):

- `pnpm scrape:endwiki --version <v>` — regenerate `data/versions/<v>/` from end.wiki.
- `pnpm validate:data` — JSON-Schema-check every bundled data version.

## Layout

```
src/core/      pure domain logic — no React, no DOM, no Vite imports (enforced by ESLint)
src/ui/        React components, Konva canvas (later phases)
src/workers/   web workers (later phases)
src/i18n/      string tables
data/          versioned device/recipe/item/region JSON
data/schema/   JSON Schemas
scripts/       build-time scripts (scraper, validators)
plan/          REQUIREMENT.md + RESEARCH_FINDINGS.md (specs)
tests/         shared fixtures + jsdom setup
```
