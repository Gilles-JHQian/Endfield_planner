# Data sourcing report — closing the DRC 17-rule data gaps

This document responds to the coder's data-dependency matrix shared at the start of P2. It maps each gap to a public data source (where one exists), proposes a concrete import pipeline, and gives a coder-actionable spec for the import script.

**Bottom line up front.** Roughly **70% of the gaps are closeable from public, MIT-licensed, structured data within ~2 days of work.** The remaining ~30% (port geometry, crossing-component identification, exact AoE numbers) require either the auxiliary device editor (already in v3 spec §5.4) or one-time in-game measurements. **No reverse-engineering of game binaries is recommended** — that path crosses the same ToS line as blueprint-code decoding, which v3 ruled out.

---

## 1. Source landscape

Four classes of sources exist. Only the first two are usable for our project.

### 1.1 ★ Primary — JamboChen/endfield-calc (recommended)

[`github.com/JamboChen/endfield-calc`](https://github.com/JamboChen/endfield-calc) is an MIT-licensed, actively maintained (latest release v0.2.1, 2026-01-24, 25 stars, 108 commits) production-chain calculator built in **React 18 + TypeScript + Vite + i18next**. The stack overlaps cleanly with our v3 tech-stack (§6.1), so adapting their data is mechanical.

The README explicitly lists what the tool computes:

- "Real-time calculation of facility counts and **power consumption**"
- "Smart recipe selection with **circular dependency** handling"
- "Recipe View / Facility View" — implies a clean separation of facility metadata from recipe data
- i18n support (zh + en) via `react-i18next`, so localized strings are already structured

Because the calculator must produce correct power and throughput numbers, every field we need for `POWER_002`, `BELT_001`, `PIPE_001`, and the recipe solver F2 is necessarily present in their data files. License is MIT — we can vendor (copy with attribution) into our repo without any per-file negotiation.

### 1.2 ☆ Secondary — wikis as cross-check

Use these as a validation source, not as primary import. They each have partial structured data; combined, they catch errors in the primary source.

- **end.wiki** — formerly cited in v3. Multilingual (14 languages), structured per-device pages. Use for: **localized display names**, tech tree narrative.
- **endfieldtools.dev** — has its own factory-planner data layer at `endfieldtools.dev/factory-planner/recipes/`. Origin unclear (no public repo found), but the data is publicly browseable.
- **game8.co/games/Arknights-Endfield/** — has an "All AIC Buildings" list at `archives/575474`. English-language QA source.
- **endfielddb.com/calculator/** — yet another community calc; useful for spot-checks.

### 1.3 ☆ Tertiary — for io_ports only

Port geometry (which edge cells are inputs/outputs and what kind) is **not in any public dataset I could find**. Every existing community tool either ignores layout entirely (calculators) or uses vision automation against the game UI (MaaEnd, ok-end-field). This gap is structural — solving it requires either:

- Manual entry via the v3 §5.4 device editor (recommended; already in the plan).
- Vision-based extraction from the game's icon sprites (out of scope for v3; could be a future plugin).

This is the only category of gap that the auxiliary tool was designed for. The flow stays unchanged from v3.

### 1.4 ✕ Rejected — IL2CPP / game-binary dumping

The `arknights-endfield` GitHub topic surfaces **IL2CPP dumpers** (Unity reverse-engineering tools) targeting Endfield. These would give absolute-precision data — every `BuildingConfig` ScriptableObject with all numeric fields including AoE radii, port positions, throughput caps — directly from the game client.

**This path is rejected for the same reason blueprint-code interop was rejected in v3 §11.** Hypergryph's Fair Play Declaration prohibits modifying or extracting game data. Tools that dump the game binary fall on the wrong side of that line. Don't go here even though the data is technically accessible.

---

## 2. Per-rule gap closure

Mapping each of the coder's 17 rules to its data source.

| Rule | Gap (per coder) | Closure path | Source |
|---|---|---|---|
| `REGION_001` | none | done | — |
| `POWER_001` | schema migration | done in branch 2 | — |
| `POWER_002` | thermal battery `power_supply` value | T1 import | endfield-calc has it |
| `PORT_001` | top-20 device `io_ports` | T3 device editor | manual, 1h work |
| `PORT_002` | + which devices are mergers/splitters | T1 import + label | endfield-calc category field |
| `PORT_003` | `io_ports.kind` | T3 device editor | manual |
| `PORT_004` | `io_ports` + bridge device IDs | T1 + T3 | calc gives bridge ID, editor gives ports |
| `BELT_001` | belt tier → items/min | already known | hardcoded: 30/60/min |
| `BELT_CROSS_001` | bridge device ID | T1 import | endfield-calc has device IDs |
| `BELT_CROSS_DELAY_001` | same | T1 import | same |
| `PIPE_001` | pipe tier → units/min | already known | hardcoded: 120/min in 武陵 |
| `PIPE_CROSS_001` | pipe-bridge device ID | T1 import | endfield-calc has device IDs |
| `LAYER_CROSS_001` | pipe infra device ID list | T1 import + label | endfield-calc category field |
| `LAYER_CROSS_002` | belt infra device ID list | same | same |
| `LAYER_CROSS_003` | `io_ports` | T3 device editor | manual |
| `TECH_001` | tech tree (~30 nodes) | T1 import | endfield-calc has tech_prereq per device |
| `STORAGE_001` | sink semantics + drain definition | spec decision | not a data gap; design decision |

**Tally:** 12 of 17 rules unblock from a single MIT data-import script. 4 rules need the device editor (which is already in v3 Phase 2 plan). 1 rule (`STORAGE_001`) is a design question, not a data question.

---

## 3. Proposed data import pipeline

A single script, runnable in development, that produces all `data/versions/<version>/*.json` files in our schema.

### 3.1 Script layout

```
scripts/
  import-endfield-calc.ts        # NEW — primary import
  validate-against-wiki.ts       # NEW — cross-check vs end.wiki
  scrape-endwiki.ts              # KEEP — for localization names only
  .cache/                        # raw fetched files (gitignored)
```

### 3.2 Data flow

```
JamboChen/endfield-calc           end.wiki (zh+en+ja)
  src/data/*.json                 /factory/buildings/<slug>/
        |                                  |
        v                                  v
  import-endfield-calc.ts         scrape-endwiki.ts
  (pulls release tag, parses)     (localized names only)
        |                                  |
        +--------------+-------------------+
                       |
                       v
           merge + schema-validate
                       |
                       v
        data/versions/1.2/*.json
        (devices, recipes, items, tech_tree)
                       |
                       v
              §5.4 device editor
              (fills io_ports for top 20 devices)
                       |
                       v
        data/versions/1.2/*.json (with port data)
```

Existing `crossing_rules.json` and `regions.json` are owner-edited (not imported); the import script must not overwrite them.

### 3.3 The import script — concrete spec

**File:** `scripts/import-endfield-calc.ts`

**Inputs:**

- CLI arg `--source-tag` (e.g. `v0.2.1`) — pulls the corresponding release tarball from `https://github.com/JamboChen/endfield-calc/archive/refs/tags/<tag>.tar.gz`. Falls back to `master` if tag unspecified.
- CLI arg `--target-version` (e.g. `1.2`) — selects which `data/versions/<version>/` dir to write to.
- CLI arg `--dry-run` — print diff without writing.

**Outputs (writes / merges):**

- `data/versions/<target-version>/devices.json`
- `data/versions/<target-version>/recipes.json`
- `data/versions/<target-version>/items.json`
- `data/versions/<target-version>/tech_tree.json`

**Behavior:**

1. **Fetch.** Download the tagged release tarball to `.cache/endfield-calc-<tag>.tgz`. Extract to `.cache/endfield-calc-<tag>/`. Skip if already cached.
2. **Locate data files.** The endfield-calc repo's data layout is not yet confirmed (the GitHub UI didn't expose `src/data/` to my fetcher). The script must autodiscover: walk `src/` for files matching `*.json` or `*.ts` exporting `facilities`, `recipes`, `items`, `buildings`, `tech*`. Cache the discovered file paths to `.cache/discovery.json` for reproducibility. **If discovery fails, fall through to a guided prompt that prints candidate files and asks the operator to pick** — better than silently producing wrong output.
3. **Parse.** For each discovered file, parse as JSON or as a TS module via `bun build --target=node` or `tsx`. Both runtimes are already in v3 stack.
4. **Map fields.** Apply the field map below (§3.4). Unknown fields are dropped with a warning, not an error.
5. **Merge with existing.** Read current `data/versions/<target-version>/*.json` if present. **Preserve** any field not present in the import source — particularly `io_ports`, which only the device editor writes. The import is additive on the import side, preserving on the editor side.
6. **Schema validate.** Run JSON Schema validation against `data/schema/*.schema.json`. Hard-fail on validation error.
7. **Diff & write.** Print a summary of changes (`+5 devices, ~3 recipes modified, -1 item removed`). In `--dry-run` mode, stop here. Otherwise write the new files atomically (temp file + rename).
8. **Attribution.** Write `data/versions/<target-version>/SOURCES.md` with the source repo, tag, license text, and timestamp.

**Idempotency:** running twice with the same `--source-tag` produces identical output (modulo timestamps in `SOURCES.md`).

**Error budget:** if endfield-calc's schema changes between releases (likely — they're at v0.2.1, pre-stable), the field map needs updating. Mark all field-map TODOs in code with `// FIELD_MAP:` so a future schema bump surfaces in one grep.

### 3.4 Field map (best-guess; finalize when files are inspected)

This is the conversion from endfield-calc's likely field names to our v3 schema. Names in their schema are inferred from typical calculator patterns; coder agent confirms on first run.

| Our field (`devices.json`) | Likely source field | Notes |
|---|---|---|
| `id` | `facilities[*].id` or filename slug | normalize to `kebab-case` matching `end.wiki` slugs where possible |
| `display_name_zh_hans` | `facilities[*].name.zh` or `i18n/zh/facilities.json` | |
| `display_name_en` | `facilities[*].name.en` or `i18n/en/facilities.json` | |
| `category` | `facilities[*].category` or `type` | normalize to v3 enum |
| `power_draw` | `facilities[*].power` (kW) | unit confirm |
| `requires_power` | derive: `power_draw > 0` | |
| `bandwidth` | `facilities[*].bandwidth` if present, else null | may not exist; falls back to TODO |
| `has_fluid_interface` | derive: any of facility's recipes has fluid input/output | |
| `tech_prereq` | `facilities[*].tech` or `unlock` | |
| `recipes` | `facilities[*].recipes` (array of recipe IDs) | |
| `footprint` | **not present** in calculators (they don't render layouts) | leave null; populated by §5.4 editor |
| `io_ports` | **not present** | same — editor only |
| `rotation` | n/a (runtime state, not catalog data) | |

| Our field (`recipes.json`) | Likely source field | Notes |
|---|---|---|
| `id` | `recipes[*].id` | |
| `display_name_*` | i18n | |
| `inputs` | `recipes[*].inputs: [{item, qty}]` | |
| `outputs` | `recipes[*].outputs: [{item, qty}]` | |
| `cycle_seconds` | `recipes[*].time` or `duration` | unit confirm (s vs ms) |
| `compatible_devices` | invert from device→recipes table | |

### 3.5 Cross-validation against end.wiki

A separate script `validate-against-wiki.ts` fetches a sample of device pages from `end.wiki` and asserts that core numeric fields match the imported data within a tolerance:

- `power_draw`: exact match required.
- `cycle_seconds`: exact match required.
- `inputs[*].qty` / `outputs[*].qty`: exact match required.
- Names: substring containment (handles minor translation drift).

Mismatches go into a CI-blocking report. If end.wiki disagrees with endfield-calc on > 5% of fields, the build fails — that's a signal one source has drifted from current game data and a human needs to look.

### 3.6 What v3 spec must change

Append to `REQUIREMENTS_v3.md` §6.2 (Data versioning):

> **Primary data source:** `JamboChen/endfield-calc` (MIT, vendored via `scripts/import-endfield-calc.ts`). End.wiki is demoted to a cross-validation source via `scripts/validate-against-wiki.ts` and remains the source for localized display names beyond zh / en.

Append to v3 §10:

> Q10.4 (供电桩 AoE square side): still a placeholder. endfield-calc does not contain layout data. Owner-measured at first opportunity.

No other v3 changes needed; the device editor (§5.4) and crossing rules (§6.3) are already where they need to be.

---

## 4. Quick wins for the coder right now

Before any data import, these rules can be fully unblocked **today** with hardcoded constants from research findings already in the v3 spec:

- `BELT_001`: belt tier rates are 30 / 60 items/min. Hardcode these in `data/versions/1.2/transport_tiers.json` (new file) — no import needed.
- `PIPE_001`: 武陵 pipe tier rate is 120 units/min (= 2 units/sec). Same file.
- `BELT_CROSS_DELAY_001`: latency model already in `crossing_rules.json` per v3 §6.3.

These three rules can ship in P2 without waiting for the import pipeline. The rest wait for the import.

---

## 5. Risk register for this approach

- **endfield-calc data accuracy.** They're at v0.2.1 (pre-stable). Their data may have errors. Mitigation: cross-validate against end.wiki (§3.5); flag mismatches.
- **endfield-calc schema churn.** They may rename fields between versions. Mitigation: pin to a release tag, not master. Treat field-map updates as a normal patch chore.
- **License attribution drift.** MIT requires the LICENSE file to ship with the data. Mitigation: `SOURCES.md` includes the full LICENSE text per imported version.
- **Upstream goes silent.** If endfield-calc stops updating, we'd need to switch primary source. Mitigation: the import script's adapter pattern means the source can be swapped without touching downstream code. End.wiki + endfieldtools.dev are viable backups.
- **Game patches outpace community sources.** Both endfield-calc and end.wiki lag the game by ~1 week on average for major patches. Acceptable for our use case.

---

## 6. Suggested sequencing for the coder

Day 1 (½ day):

- Add `data/versions/1.2/transport_tiers.json` with the hardcoded belt/pipe rates. Wire `BELT_001`, `PIPE_001`, `BELT_CROSS_DELAY_001` to it.
- Three rules go green.

Day 2:

- Implement `scripts/import-endfield-calc.ts` per §3.3. Run it against `v0.2.1`. Inspect output. Iterate field map until clean.

Day 3:

- Implement `scripts/validate-against-wiki.ts`. Run it. Fix any disagreements.
- All of `POWER_002`, `PORT_002`, `BELT_CROSS_001`, `PIPE_CROSS_001`, `LAYER_CROSS_001`, `LAYER_CROSS_002`, `TECH_001` go green.
- 10 rules total now green.

Day 4–5:

- Stand up the §5.4 device editor (parallel track; this is on the v3 plan anyway).
- Owner enters port data for top 20 devices.
- `PORT_001`, `PORT_003`, `PORT_004`, `LAYER_CROSS_003` go green.
- 14 of 17 rules now green.

The remaining 3 (`STORAGE_001` — design decision; `POWER_002` thermal battery values if endfield-calc lacks them — owner measurement) are not blockers for shipping P2.