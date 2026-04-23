# Endfield EDA — Requirements & Implementation Plan

A design automation tool for the integrated industry system in *Arknights: Endfield* (《明日方舟：终末地》), modeled loosely on electronic design automation (EDA) tools from IC design. The target user is an experienced player who wants to design, validate, and iterate on factory layouts **outside the game**, then reproduce them in-game, instead of demolishing and rebuilding live bases every time the game updates or requirements change.

This document is the single source of truth for scope, priorities, and technical decisions. Read it end-to-end before starting work.

---

## 1. Background & problem statement

The integrated industry system ("基建") lets the player build automated production lines on grid-based plots: placing machines (miners, smelters, grinders, assemblers, planters, etc.), connecting them with conveyor belts and fluid pipes, powering them via power poles from a protocol core, and configuring recipes. Outputs feed into gameplay progression (equipment, consumables, dispatch tickets, etc.).

Key pain points motivating this tool:

- **Space is scarce.** Each region (e.g. 四号谷地, 武陵) has a bounded build plot. Designing a new layout almost always requires demolishing the existing one first, and demolition is largely irreversible within a session.
- **Complexity grows with patches.** Each major version adds machines, recipes, and mechanics (e.g. the recent split between solid-belt and fluid-pipe layers). Existing designs become obsolete and must be redone.
- **In-game editing is slow.** The game UI is for *building*, not for *designing*. Iterating on routing, re-checking power coverage, and tweaking machine ratios in-game is painful.
- **The official blueprint system only solves "copying other people's designs."** It does not help you *design your own* or *validate* one before committing.

The goal of this project is a tool where the user designs the layout on a virtual canvas, gets immediate feedback on correctness and throughput, and then transfers the verified design into the game.

---

## 2. Scope and non-goals

### In scope

- Recipe/throughput solver (given a target output, compute required machines and raw material rates).
- A 2D grid-based graphical editor for placing machines, belts, pipes, power infrastructure.
- Design rule checking (DRC) for power coverage, connector validity, belt throughput, layer-crossing rules.
- Production simulation (per-minute throughput estimation with bottleneck detection).
- Automated routing for belts/pipes between user-specified endpoints.
- One-shot layout optimization for a given machine set and bounding box.
- Given a bounding box and a target recipe, generate a full layout end-to-end.
- Export: screenshot, build-order checklist, JSON save file, machine BOM (bill of materials).

### Explicitly out of scope (for now)

- **Reading or writing the in-game blueprint code (`EF01...`).** The encoding is proprietary and possibly server-validated; attempting it risks ToS issues and is a rabbit hole. The tool outputs a build-order guide; the user rebuilds manually in-game. (May be revisited in a future phase after a ToS review; see §11.)
- **Multiplayer / collaborative editing.** Single-user local tool only.
- **Save-file parsing from the installed game client.** Out of scope for the same reason as blueprint codes.
- **Mobile-first UI.** Design for desktop browsers. Mobile viewing is nice-to-have; mobile editing is not.
- **Combat buildings / defense turrets / ziplines.** The tool is scoped to production-chain infrastructure.

---

## 3. Target user and usage workflow

The primary user is a player who:

- Already understands the integrated industry system.
- Wants to prototype multiple layout variants before demolishing in-game.
- Is willing to manually rebuild from a reference image + build-order list.

Intended workflow:

1. Open the tool in a browser.
2. Pick a region (四号谷地 / 武陵 / future regions), which sets available machines, tech tier, and plot dimensions.
3. Either:
   - **Top-down:** declare a target output ("6/min high-grade batteries"), get a recommended machine set from the solver, then place and route.
   - **Bottom-up:** drag machines onto the canvas freely and let the solver tell you what throughput you get.
4. Iterate with live DRC and throughput feedback.
5. Export a build-order checklist + annotated screenshot; rebuild in-game.

---

## 4. Domain model

These are the core concepts the code must represent. Get these right before writing UI.

### 4.1 Devices (machines)

Each device has:

- `id`: stable string key (e.g. `refiner_t1`, `grinder_t2`).
- `display_name_zh`, `display_name_en`.
- `footprint`: width × height in grid cells. Most are rectangular; assume axis-aligned.
- `rotation`: 0°/90°/180°/270°. Footprint rotates with it.
- `io_ports`: list of `{side, offset, kind, direction}`. `side` ∈ {N,E,S,W} relative to the device's current rotation. `kind` ∈ {solid, fluid, power}. `direction` ∈ {input, output, bidirectional}. A port occupies exactly one cell on the device's perimeter.
- `power_draw`: watts (or whatever unit the game uses) when running.
- `tech_prereq`: tech-tree node(s) required to unlock.
- `recipes`: list of recipe IDs this device can execute.
- `category`: one of {miner, smelter, grinder, refiner, planter, harvester, assembler, storage, logistics, power_source, power_distribution, connector, ...}.

### 4.2 Recipes

Each recipe has:

- `id`, `display_name_zh`, `display_name_en`.
- `inputs`: `[{item_id, qty_per_cycle}]`.
- `outputs`: `[{item_id, qty_per_cycle}]`.
- `cycle_seconds`: base duration.
- `compatible_devices`: list of device IDs that can run it.

### 4.3 Items / materials

Items have an id, display name, and `kind` ∈ {solid, fluid}. The kind determines which transport layer carries them (belt vs pipe). A single item has exactly one kind.

### 4.4 Transport links

There are two transport layers:

- **Solid layer:** conveyor belts. Tiered by speed (e.g. 30/min, 60/min).
- **Fluid layer:** pipes. Also tiered (武陵 管道 reportedly 60/min).

Each link is a path of grid cells carrying one layer's flow. Links have:

- `layer` ∈ {solid, fluid}.
- `tier` (determines max throughput per cell per minute).
- `path`: ordered list of grid cells.
- `source_port`, `sink_port`: device port references.

### 4.5 Crossings and layer rules

**This is a core constraint and must be modeled correctly.** From the user's spec:

- **Same-layer crossing is NOT free.** On the solid layer, two belts cannot simply occupy the same cell. Crossing requires a dedicated **overpass/crossing component** — a 1×1 device with two input ports and two output ports, one pair on each axis (N↔S for one belt, E↔W for the other). The two flows pass through orthogonally without mixing.
- **Only fully perpendicular crossings are allowed** via the overpass component. A belt cannot merge into the overpass at 45°; entry and exit must be axis-aligned and use opposite sides.
- **Cross-layer crossing has its own rules.** A solid belt and a fluid pipe occupy different "layers." They are *not strictly forbidden* from overlapping, but not all configurations are allowed. The exact rule set must be captured in a dedicated config block (see §6.3) and checked by the DRC.

Model this as:

- `Cell` has two slots: `solid_occupant`, `fluid_occupant`. Each slot is either empty, a device footprint cell, or a transport link cell.
- A **crossing device** is a normal 1×1 device on the solid layer whose semantics declare "I route N↔S and E↔W as two independent non-mixing flows."
- A **layer-cross rule table** governs which `(solid_occupant_kind, fluid_occupant_kind)` combinations are legal in the same cell.

Do not hardcode "belts can't cross." Do capture that a plain straight belt crossing another plain straight belt is illegal without the crossing component.

### 4.6 Power model

- Protocol core has a radius of influence (area of effect).
- Core does not power devices directly; **power poles inside the core's AoE** distribute power to devices within each pole's own AoE.
- Every device consumes power while running; power budget is a hard constraint.
- DRC must flag: devices outside any pole's AoE; poles outside the core's AoE; power budget overrun.

### 4.7 Region / plot

- `region_id` (e.g. `valley_4`, `wuling`).
- `plot`: polygonal or rectangular bounded area of legal build cells. Model as a boolean grid mask — cells outside the mask cannot be built on.
- `core_position`: fixed, non-movable.
- `sub_core_positions`: list of secondary cores (no power, but storage/logistics).
- `available_tech_tiers`: which tiers are unlocked in this region.
- `mining_nodes`: fixed resource spawn points on the plot or just outside.

---

## 5. Feature breakdown

Features are split into **basic** (must-have, P0) and **advanced** (P1/P2). Each feature has acceptance criteria. Build in the order listed; each tier should be shippable on its own.

### 5.1 Basic features (P0)

#### F1. Device & recipe data layer

Load device, recipe, item definitions from versioned JSON files. Support multiple game versions (`1.1`, `1.2`, ...) — the user picks one at project creation.

*Acceptance:* A new device can be added by editing JSON only, with no code changes. Loading a project created under v1.1 into the v1.2 schema reports which devices/recipes are missing or changed.

#### F2. Recipe / throughput solver

Given a target `{item_id, rate_per_minute}`, compute:

- Full dependency tree of required recipes (respecting the user's chosen region, since some recipes are region-specific).
- Machine count per recipe, rounded up to integers.
- Raw material input rates.
- Total power draw.
- Total footprint (sum of machine areas — a lower bound on plot usage, not a layout).

Formulate as an LP when fractional machines are allowed, then round up. Handle cyclic recipes (e.g. 酮化灌木 self-loop via seeds). Handle byproducts that feed back into earlier stages.

Solver output is a **recipe graph**, not a layout. This is a separate deliverable from the editor.

*Acceptance:* For known reference recipes (e.g. 高谷电池 6/min), solver output matches hand-verified values from community guides within rounding tolerance.

#### F3. Grid canvas editor

A 2D grid-based canvas where the user can:

- Pan, zoom, and scroll.
- Place devices from a palette, with rotation (R key) and mirroring.
- Drag-select, move, copy, paste, delete.
- Undo / redo with unlimited history within a session.
- Drag to draw a belt or pipe path between two ports. The path is a sequence of cells along 4-neighbour directions.
- Edit placed devices' recipe selection inline.

Visuals: top-down orthographic, same grid resolution as the game. Distinct visual treatment for solid vs fluid links. Device sprites can be simple colored rectangles with icons in v1.

*Acceptance:* User can recreate a published community blueprint (e.g. a small 高谷电池 production line) by hand in under 5 minutes.

#### F4. Manual layout with snap / align

- Cells snap to the grid.
- Devices refuse to place if their footprint collides with another device or falls outside the plot mask.
- Belts/pipes refuse to route through illegal cells.
- Visual indicators for port connectivity (green = connected, red = floating, yellow = connected but wrong material).

*Acceptance:* Invalid placements are rejected at placement time (not silently saved and flagged later).

#### F5. Design rule checker (DRC)

Runs continuously in the background; results shown as a lint panel with clickable entries that pan the viewport to the offending cell. Rules include:

- `POWER_001`: device outside power coverage.
- `POWER_002`: power pole outside core AoE.
- `POWER_003`: total power draw exceeds supply.
- `PORT_001`: device port is required-input but not connected.
- `PORT_002`: two outputs connected together (no valid merger/splitter present).
- `PORT_003`: fluid port connected to solid belt or vice versa.
- `BELT_001`: belt throughput exceeds tier limit.
- `CROSS_001`: two solid links occupy the same cell without a crossing component.
- `CROSS_002`: illegal layer-cross configuration (see §6.3 rule table).
- `REGION_001`: device placed outside plot mask.
- `TECH_001`: device used but its tech prereq is not unlocked in the project's tech profile.
- `STORAGE_001`: sink storage full — no drain configured (a soft warning, not an error).

Each rule has a severity (`error` | `warning` | `info`), a stable id, and a human-readable message in zh + en.

*Acceptance:* Every rule has at least one unit test built from a minimal synthetic layout. A clean known-good layout produces zero errors.

### 5.2 Advanced features (P1)

#### F6. Production simulation

A tick-based discrete-event simulator that runs the designed layout forward for N simulated minutes and reports:

- Per-output item throughput (items/min).
- Per-machine utilization (%).
- Bottleneck identification (which belt or machine limits steady-state output).
- Time-to-steady-state.
- Backpressure visualization: heat-map overlay showing belts that are full or machines that starve.

Use a fixed timestep (e.g. 0.1s). Represent belts as FIFO queues with capacity = tier × length. Machines are state machines: `idle → consuming → producing → idle`. Model storage input/output buffers.

*Acceptance:* Simulator output matches the solver's theoretical max within ~5% for a well-designed layout; matches the actual bottleneck identified by hand for a deliberately under-provisioned layout.

#### F7. Auto-router

Given two ports and the current occupied-cell state, compute a legal belt/pipe path. Algorithm: cost-weighted A* on the grid, where:

- Empty cells have low cost.
- Cells occupied on the *other* layer have medium cost if the layer-cross rule permits (to discourage but not forbid), high cost otherwise.
- Placing a crossing component has a configurable cost (default moderate — prefer detour when short, prefer crossing when detour is long).
- Turns add small cost (prefer straight).
- Routing through occupied solid cells is forbidden unless a crossing is inserted.

Support multi-net simultaneous routing (route N pairs together minimizing total cost + crossings), initially via sequential A* with rip-up-and-reroute when conflicts arise; upgrade to a proper multi-net router later if needed.

*Acceptance:* On a test set of 20 hand-designed routing problems, auto-router produces a legal path in 100% of cases and a path no more than 20% longer than the hand-optimal in 80% of cases.

#### F8. Placement optimizer

Given a fixed set of machines (from the solver) and a bounding-box constraint, find a placement that:

- Keeps all devices inside the box.
- Minimizes total estimated routing length (Manhattan sum over the recipe graph's connections).
- Respects port orientation (try to face producer outputs toward consumer inputs).

Algorithm: simulated annealing on `(position, rotation)` for each device, with an objective = weighted sum of estimated wire length + overflow penalty. Run the auto-router on the candidate placement for a final check.

*Acceptance:* On reference layouts, optimizer produces a placement whose auto-routed total belt length is within 25% of a hand-designed reference layout's total belt length.

#### F9. End-to-end layout generation

Given `(region, target recipe, target rate, bounding box)`, produce a complete placed-and-routed layout by chaining F2 → F8 → F7 with DRC validation. This is the "one-button design" feature.

*Acceptance:* Produces a DRC-clean layout for at least 5 common target recipes within 60 seconds each on a modern laptop.

### 5.3 Advanced features (P2, nice-to-have)

#### F10. Version diff and migration

When the user loads a project created under an older data version, offer a migration wizard: show which devices/recipes changed, suggest substitutions, re-run the solver, flag manual steps.

#### F11. Export formats

- PNG screenshot with grid overlay, device labels, and belt directions.
- Annotated PDF build guide: numbered build-order steps, per-step screenshot highlighting what to place, BOM, total power/material checklist.
- JSON project save (full editable state).

#### F12. Library of reference blueprints

Users can save layouts as reusable modules and import them as a black box (like hierarchical cells in IC design). A module exposes external ports and internal DRC is precomputed.

---

## 6. Key design decisions

### 6.1 Tech stack

- **Frontend:** TypeScript + React + a canvas library. Recommend **Konva.js** over raw canvas for the editor (built-in hit detection, transformers, layers) unless the team has strong reason otherwise. Tailwind for the non-canvas UI chrome.
- **Solver:** JavaScript **glpk.js** (WASM build of GLPK) for the LP, or a hand-rolled fractional solver since the LP is small (< 100 variables in practice). Do not introduce Python unless the solver grows beyond LP.
- **Simulation:** pure TypeScript, worker thread.
- **Auto-router & placement:** pure TypeScript, worker thread. The A* and SA implementations should be plain functions over plain data for testability.
- **Persistence:** LocalStorage for project list, IndexedDB for project blobs. Export/import as JSON files.
- **Distribution:** static site, deployable to GitHub Pages / Cloudflare Pages. No backend in v1.

### 6.2 Data versioning

All device/recipe/item data lives in `data/versions/<version>/*.json`. The project file records which version it was created under. The app bundles multiple versions and lets the user pick. Community contributions land as PRs to this data directory.

Schema for each JSON file is documented via JSON Schema in `data/schema/`. Every PR to the data directory is validated in CI against the schema.

### 6.3 Crossing / layer-cross rule table

Do not hardcode. Represent as a declarative table in `data/versions/<version>/crossing_rules.json`:

```json
{
  "same_layer_crossing": {
    "solid": {
      "allowed_without_component": false,
      "crossing_component_id": "belt_overpass_1x1",
      "rules": [
        "Orthogonal crossing only via belt_overpass_1x1.",
        "Two straight belts cannot share a cell."
      ]
    },
    "fluid": {
      "allowed_without_component": false,
      "crossing_component_id": "pipe_overpass_1x1",
      "rules": []
    }
  },
  "cross_layer_crossing": {
    "default": "allowed",
    "exceptions": [
      {
        "when": { "solid_occupant": "belt_straight", "fluid_occupant": "pipe_junction" },
        "result": "forbidden",
        "reason_zh": "管道接口占据整个格子，固体带无法穿过。",
        "reason_en": "Pipe junctions occupy the full cell; belts cannot pass through."
      }
    ]
  }
}
```

The DRC consults this table. When the user updates the tool for a new game version, they update this file — code does not change.

**Important:** The exact rules for cross-layer crossing are not yet fully specified. The agent should implement the rule engine and rule-check infrastructure, but leave the specific rule entries as TODOs with clearly marked placeholders. The project owner will fill in the actual rules as they are verified in-game.

### 6.4 Coordinate system and rotation

- Grid origin: top-left, x increases right, y increases down. This matches the screen and most game top-down views.
- Rotations: 0° = device faces east (ports defined in east-facing orientation); positive rotation is clockwise. 90°, 180°, 270° are the only legal rotations.
- Port coordinates in device definitions are given in the device's *unrotated* frame and transformed at render/query time.

### 6.5 Performance targets

- Editor stays at 60 fps when panning a 100×100 grid with 200 devices and 500 belt segments.
- DRC incremental update completes within 50 ms for a single edit on the above scene.
- Full simulation of 10 minutes of sim-time completes within 2 seconds for the above scene.
- Auto-router completes in under 1 second per net on the above scene.

If any of these targets prove infeasible with the chosen stack, reduce the scene size first; do not degrade UX.

---

## 7. Architecture overview

```
data/
  versions/
    1.2/
      devices.json
      recipes.json
      items.json
      regions.json
      crossing_rules.json
      tech_tree.json
  schema/
    *.schema.json

src/
  core/                 # Pure, no DOM, fully unit-tested
    domain/             # Types: Device, Recipe, Item, Project, Layout, Link, Cell
    data-loader/        # Loads & validates data JSON
    solver/             # Recipe / throughput LP
    layout/             # Grid, placement, port geometry, rotation math
    drc/                # Rule engine + rule definitions
    sim/                # Tick-based simulator
    router/             # A* auto-router
    placer/             # SA placement optimizer
    export/             # JSON, PNG, PDF, checklist generators
  ui/
    editor/             # Canvas (Konva), palette, inspector
    solver-panel/
    drc-panel/
    sim-panel/
    project-manager/
    components/         # Reusable React components
  workers/              # Web Workers for solver, sim, router, placer
  i18n/                 # zh-CN, en locales

test/
  unit/
  integration/
  fixtures/             # Hand-crafted reference layouts
```

The `core/` tree must not import from `ui/` or any browser API. It should be usable from Node for CI tests.

---

## 8. Phased delivery plan

Each phase ends with a deployable build. Do not move on until the previous phase's acceptance criteria are met.

### Phase 0 — Project skeleton (week 1)

- Repo, TypeScript config, Vite, React, Tailwind, ESLint, Prettier, Vitest.
- Empty `core/` and `ui/` trees.
- Data schema for v1.2 defined in JSON Schema; at least 10 devices, 5 recipes, 15 items populated.
- CI runs lint + tests on PR.

### Phase 1 — Solver MVP (weeks 2–3)

- F1 (data layer), F2 (solver).
- UI: a single-page form. Pick region, pick target output, enter rate, see solver result as a tree + BOM.
- Deliverable: standalone solver page. Useful on its own even without the editor.

### Phase 2 — Editor MVP (weeks 4–7)

- F3 (canvas), F4 (manual layout), F5 (DRC).
- Integration with F2: user can drag solver-recommended machines from the solver panel onto the canvas.
- Deliverable: full manual design flow. Users can hand-design layouts and export a build checklist.

### Phase 3 — Simulation (weeks 8–9)

- F6 (simulator).
- Deliverable: user can press "Simulate" on any layout and see throughput / bottleneck analysis.

### Phase 4 — Routing and placement (weeks 10–13)

- F7 (auto-router), F8 (placement optimizer).
- Deliverable: user selects a set of machines, draws a bounding box, clicks "Place and route." Gets a DRC-clean layout back.

### Phase 5 — End-to-end generation (weeks 14–15)

- F9 (full pipeline).
- Deliverable: one-button "design me a factory for 6/min 高谷电池."

### Phase 6 — Polish (weeks 16+)

- F10, F11, F12 as time allows.
- Documentation site, video walkthrough, community onboarding.

This timeline is intentionally generous; a focused engineer can compress Phases 1–2 significantly.

---

## 9. Testing strategy

- **Unit tests** for every `core/` module. Aim for >85% line coverage on `core/`.
- **Golden tests** for the solver: for ~20 reference target recipes, expected machine counts are stored as fixtures and checked on every commit.
- **Integration tests** that load a fixture layout, run DRC and sim, and assert on the results.
- **Visual regression tests** for the canvas via Playwright, using fixed seeds for anything random.
- **Manual QA checklist** per release, covering at least one full hand-designed layout per supported region.

---

## 10. Open questions for the project owner

The coder agent should **ask, not guess**, on any of the following before implementing the affected module. Flag each as a blocker for its dependent feature.

1. **Exact cross-layer crossing rules.** §4.5 and §6.3 describe the mechanism but the specific allowed/forbidden configurations are a TODO. Need a full table.
2. **Belt tier throughputs and unlock conditions** per region.
3. **Fluid pipe rules** — is there a pressure/distance limit? Branching rules?
4. **Storage / buffer semantics** — do machine internal buffers hold full cycles or item-by-item? Does belt backpressure immediately halt upstream or buffer first?
5. **Crossing component capacity** — can the overpass itself hit throughput limits per lane?
6. **Recipe cycle times** — authoritative source? Community wiki numbers vary.
7. **Tech tree data** — is there a clean community-maintained dump, or must we transcribe by hand?
8. **Localization scope** — is English localization required at launch, or zh-CN-only with en to follow?

---

## 11. Blueprint code interop (deferred)

Reading/writing the in-game `EF01...` blueprint code is explicitly out of scope for v1. Reasons:

- Format is undocumented; reverse-engineering it is time-expensive and the payoff is speculative.
- The server-side component (if any) is unknown; client-only decoding may not be sufficient.
- ToS implications are unclear. Hypergryph has not publicly sanctioned third-party blueprint tools.

A future phase may add read-only import after: (a) confirming the format is stable, (b) confirming ToS permits it, (c) confirming there is a clean decoder path without touching live game memory or network traffic.

Until then, the tool's output is a human-executable build guide.

---

## 12. Coding conventions

- TypeScript strict mode. No `any` without a `// TODO:` justification.
- Follow existing project ESLint config. Prettier on save.
- Functions in `core/` are pure where possible; side effects isolated in `ui/` and `workers/`.
- Domain types are immutable (`readonly` fields); state transitions return new objects.
- Test files colocated with source: `foo.ts` + `foo.test.ts`.
- Commit messages: conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).
- Comments: Google-style JSDoc for exported functions. No inline comments restating the code. Comments explain *why*, not *what*.
- UI text is never hardcoded; all strings go through the i18n layer with both zh-CN and en keys. If a translation is unavailable, mark the en key as `[TODO-EN]` and leave the zh-CN.
- No MVP over-engineering: do not build an abstraction until there are two concrete use cases. The solver should not have a plugin system until there are two solvers.

---

## 13. Definition of done (per feature)

A feature is "done" when:

1. All acceptance criteria in §5 are met.
2. Unit tests exist and pass in CI.
3. At least one end-to-end test exercises the feature in combination with adjacent features.
4. The feature is wired into the UI behind a stable, documented entry point.
5. User-visible strings are localized.
6. If the feature changes data schema, the schema file is updated and a migration is provided for existing projects.
7. A short paragraph in `docs/features/<feature>.md` describes what it does, how to use it, and known limitations.