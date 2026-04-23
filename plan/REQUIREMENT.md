# Endfield EDA — Requirements & Implementation Plan (v2)

A design automation tool for the integrated industry system in *Arknights: Endfield* (《明日方舟：终末地》), modeled loosely on electronic design automation (EDA) tools from IC design. The target user is an experienced player who wants to design, validate, and iterate on factory layouts **outside the game**, then reproduce them in-game, instead of demolishing and rebuilding live bases every time the game updates or requirements change.

This document is the single source of truth for scope, priorities, and technical decisions. Read it end-to-end before starting work.

**Document version:** v2 — revised after community-sources research. See `RESEARCH_FINDINGS.md` for the source material behind domain-model decisions.

---

## 1. Background & problem statement

The integrated industry system ("基建") lets the player build automated production lines on grid-based plots: placing machines (miners, smelters, grinders, assemblers, planters, etc.), connecting them with conveyor belts and fluid pipes, powering them via power poles from a protocol core, and configuring recipes. Outputs feed into gameplay progression (equipment, consumables, dispatch tickets, etc.).

Key pain points motivating this tool:

- **Space is scarce.** Each region (e.g. 四号谷地, 武陵) has a bounded build plot. Designing a new layout almost always requires demolishing the existing one first, and demolition is largely irreversible within a session.
- **Complexity grows with patches.** Each major version adds machines, recipes, and mechanics. The 武陵 region introduced a full fluid-pipe transport layer with fundamentally different physics from belts.
- **In-game editing is slow.** The game UI is for *building*, not for *designing*. Iterating on routing, re-checking power coverage, and tweaking machine ratios in-game is painful.
- **The official blueprint system only solves "copying other people's designs."** It does not help you *design your own* or *validate* one before committing.

The goal of this project is a tool where the user designs the layout on a virtual canvas, gets immediate feedback on correctness and throughput, and then transfers the verified design into the game.

---

## 2. Scope and non-goals

### In scope

- Recipe/throughput solver (given a target output, compute required machines and raw material rates).
- A 2D grid-based graphical editor for placing machines, belts, pipes, power infrastructure.
- Design rule checking (DRC) for power coverage, connector validity, throughput limits, same-layer and cross-layer crossing rules.
- Production simulation (per-minute throughput estimation with bottleneck detection) using **separate physical models** for belts and pipes.
- Automated routing for belts/pipes between user-specified endpoints, aware of both transport layers.
- One-shot layout optimization for a given machine set and bounding box.
- Given a bounding box and a target recipe, generate a full layout end-to-end.
- Export: screenshot, build-order checklist, JSON save file, machine BOM (bill of materials).

### Explicitly out of scope

- **Reading or writing the in-game blueprint code (`EF01...`).** Research strongly suggests the code is a server-side reference rather than self-contained encoded data — no community tool has decoded it despite months of community activity; both major third-party tools (MaaEnd, ok-end-field) use vision-based UI automation instead. Cross-server invalidity corroborates this. Additionally, Hypergryph's Fair Play Declaration creates ToS risk for write-back. **Permanently deferred; no phase will implement this.** The tool's output is a human-executable build guide. See §11 for details.
- **Save-file parsing from the installed game client.** Same reasoning.
- **Multiplayer / collaborative editing.** Single-user local tool only.
- **Mobile-first UI.** Design for desktop browsers. Mobile viewing is nice-to-have; mobile editing is not.
- **Combat buildings / defense turrets / ziplines.** Data for these devices is scraped (essentially free) but hidden behind a feature flag in the UI palette. Not supported by the solver, DRC, or simulator.

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
   - **Top-down:** declare a target output ("6/min 高谷电池"), get a recommended machine set from the solver, then place and route.
   - **Bottom-up:** drag machines onto the canvas freely and let the solver tell you what throughput you get.
4. Iterate with live DRC and throughput feedback.
5. Export a build-order checklist + annotated screenshot; rebuild in-game.

---

## 4. Domain model

These are the core concepts the code must represent. Get these right before writing UI.

### 4.1 Devices (machines)

Each device has:

- `id`: stable string key matching the `end.wiki` slug (e.g. `furnance-1`, `grinder-1`, `udpipe-loader-2`).
- `display_name_zh_hans`, `display_name_zh_hant`, `display_name_en`, `display_name_ja`, ... (via i18n layer; end.wiki provides 14 languages).
- `footprint`: width × height in grid cells. Most are rectangular; assume axis-aligned. The `end.wiki` field `占地面积: W×H×D` provides `W × H` — the `D` dimension is a visual-height indicator and is ignored by the grid model. Confirm this convention with a second device page during the scraper implementation.
- `rotation`: 0°/90°/180°/270°. Footprint rotates with it.
- `io_ports`: list of `{side, offset, kind, direction}`. `side` ∈ {N,E,S,W} relative to the device's current rotation. `kind` ∈ {solid, fluid, power}. `direction` ∈ {input, output, bidirectional}. A port occupies exactly one cell on the device's perimeter.
- `bandwidth`: integer from `end.wiki` field `带宽`. Caps items/tick per port.
- `power_draw`: from `end.wiki` field `电力消耗` (integer).
- `requires_power`: from `end.wiki` field `需要电力` (boolean).
- `has_fluid_interface`: from `end.wiki` field `流体接口` (boolean).
- `tech_prereq`: tech-tree node(s) required to unlock.
- `recipes`: list of recipe IDs this device can execute.
- `category`: from `end.wiki` field `建筑类型`, one of: `miner`, `storage`, `basic_production`, `synthesis`, `power`, `utility`, `combat`, `planting`.

Port positions are **not explicitly in text** on `end.wiki` — they appear only in device render sprites. For the first cut, treat devices as axis-aligned rectangles and let the user draw belts from any edge cell; the connector snaps to the nearest valid port at render time. Once the MVP is validated, hand-curate port positions for the most common ~20 devices (stored in a separate `port_overrides.json`).

### 4.2 Recipes

Each recipe has:

- `id`, `display_name_{locale}`.
- `inputs`: `[{item_id, qty_per_cycle}]`.
- `outputs`: `[{item_id, qty_per_cycle}]`.
- `cycle_seconds`: integer seconds from `end.wiki`.
- `compatible_devices`: list of device IDs that can run it. `end.wiki` lists recipes under each device's page; invert this at scrape time.

### 4.3 Items / materials

Items have an id (`item-iron-ore`, `item-liquid-water`, etc., matching `end.wiki` slugs), display names, a `kind` ∈ {solid, fluid}, and a rarity star level (1–5). Fluid items use pipes; solid items use belts. **A single item has exactly one kind.**

### 4.4 Transport layers — two physically different models

The game has two transport systems. **They do not share a simulation model.** This is the most important domain fact in this document.

#### Solid layer — belts (传送带)

- Discrete items, FIFO-like flow on a 1D path.
- Tiered by speed. Base belt: 30 items/min (1 item per 2 seconds per output port). Upgraded belt: 60 items/min. These rates apply to ports on the protocol core and to fully-provisioned machine outputs; actual machine output depends on recipe cycle time.
- Modeled as: `SolidLink { layer: 'solid', tier: number, path: Cell[], src_port, dst_port }`.
- Simulator treats each belt segment as a FIFO queue with capacity `tier × length_in_cells`.
- Backpressure: when a downstream queue saturates, upstream machines idle.

#### Fluid layer — pipes (管道 / 暗管)

- Continuous particle flow. **Not a FIFO queue.**
- Community research (cited in `RESEARCH_FINDINGS.md` §B.4) confirms: "终末地中的水流是无碰撞体积的粒子，因此速度可以简单地加和。" Fluid particles do not collide. Merging flows sum velocities; splitting divides them.
- Per-pipe rate cap at the tier's maximum. 武陵 pipes cap at 2 units/sec = 120 units/min.
- Reflux loops ("回流节点") can raise effective pressure up to the cap.
- Modeled as: `FluidLink { layer: 'fluid', tier: number, path: Cell[], src_port, dst_port }`. Simulator treats the fluid network as a directed flow graph with per-edge capacities; each sim-tick solves for steady-state flow (max-flow or LP).
- "Trailing" artifact on entry into 暗管 from empty state: a 2-unit inflow may only transport 1 unit initially. The MVP simulator may ignore this; document it as a known accuracy gap.

#### Pipe junctions / splitters / supports occupy the solid layer

Straight pipe segments coexist freely with straight belt segments in the same cell. **But:** pipe junctions, splitters (管道分流器), supports, and confluence/merge points (管道汇流器) also occupy the solid layer and block belts there. This asymmetry is captured in the crossing rules below.

### 4.5 Crossings and layer rules

Every grid `Cell` has two independent occupancy slots: `solid_occupant` and `fluid_occupant`. A device footprint cell sets both slots (devices occupy both layers at their location unless specifically marked otherwise).

The occupancy rules:

**Same-layer collision is illegal without a dedicated crossing component.**

- **Solid layer:** two belt paths cannot share a cell. The 物流桥 (logistics bridge) component routes N↔S and E↔W as two independent non-mixing flows through a single 1×1 cell. Entries and exits must be axis-aligned opposite sides (no 45° merges).
- **物流桥 latency penalty:** community testing shows that a line passing through ≥ 2 bridges suffers ~1-cell delay per 4 items (~25% throughput loss). ≥ 3 bridges saturate at the 2-bridge level — no additional penalty. The simulator must model this; the DRC should warn when a critical path crosses > 1 bridge.
- **Fluid layer:** in principle same-layer pipe crossings also need a crossing component, but research on this is thin. Treat symmetrically with belts for now and flag as TODO for in-game verification.

**Cross-layer coexistence is generally legal, with exceptions.**

- **Main runs:** a straight belt and a straight pipe can share a cell (belt on solid layer, pipe on fluid layer).
- **Exception A — pipe junction/splitter/support on a belt:** illegal. These pipe components occupy the solid layer and block belts.
- **Exception B — belt crossing on a pipe:** unknown whether a 物流桥 works over a pipe. Assume legal pending in-game verification.
- **Exception C — device cells:** no transport link may enter a device footprint cell except at a declared port.

These rules are encoded declaratively in `data/versions/<version>/crossing_rules.json`; the DRC engine is a rule interpreter. Schema shown in §6.3.

### 4.6 Power model

- **Protocol core** has a radius of influence (AoE). Core does not power devices directly.
- **供电桩** (power pole / diffuser): placed inside the core's AoE; distributes power to devices in the pole's own AoE. 息壤供电桩 is the 武陵-tier variant.
- **中继器** (repeater): extends wire runs between core and poles. Does not supply power itself. 息壤中继器 is the 武陵-tier variant. Required because **electric wire max segment length is 80 meters** (community-confirmed; assume 1 meter = 1 grid cell pending in-game verification).
- **热能池** (thermal battery): power source / storage.
- Every device with `requires_power = true` consumes its `power_draw` while running; power budget is a hard constraint.
- DRC must flag: devices outside any pole's AoE; poles outside the core's AoE (and not on a repeater chain); wire segments > 80m; power budget overrun.

### 4.7 Region / plot

- `region_id` (`valley_4`, `wuling`, `jinlong` — the third region, less documented).
- `plot`: bounded grid mask of legal build cells.
- `core_position`: fixed, non-movable.
- `sub_core_positions`: list of secondary cores (no power supply, but storage/logistics). Sub-cores in smaller satellite build areas.
- `available_tech_tiers`: which tiers are unlocked in this region.
- `mining_nodes`: fixed resource spawn points on the plot or just outside.
- **Blueprints do not transfer across game servers** (Asian vs NA); this is noted for user documentation but has no code-level impact.

Plot dimensions, core/pole AoE radii, and tech tree structure are not authoritatively documented by community sources. See §10.

---

## 5. Feature breakdown

Features are split into **basic** (must-have, P0) and **advanced** (P1/P2). Each feature has acceptance criteria. Build in the order listed; each tier should be shippable on its own.

### 5.1 Basic features (P0)

#### F1. Device & recipe data layer

Load device, recipe, item definitions from versioned JSON files sourced from `end.wiki` via a one-time scraper (see §6.2).

*Acceptance:* A new device can be added by editing JSON only, with no code changes. Loading a project created under v1.1 into the v1.2 schema reports which devices/recipes are missing or changed. A single `pnpm scrape:endwiki --version 1.2` command regenerates all data from scratch.

#### F2. Recipe / throughput solver

Given a target `{item_id, rate_per_minute}`, compute:

- Full dependency tree of required recipes (respecting the user's chosen region, since some recipes are region-specific).
- Machine count per recipe, rounded up to integers.
- Raw material input rates.
- Total power draw.
- Total footprint (sum of machine areas — a lower bound on plot usage, not a layout).

Formulate as an LP when fractional machines are allowed, then round up. Handle cyclic recipes (e.g. 酮化灌木 self-loop via seeds, 种植机 double-loop patterns). Handle byproducts that feed back into earlier stages.

Solver output is a **recipe graph**, not a layout. This is a separate deliverable from the editor.

*Acceptance:* For known reference recipes (e.g. 6/min 高谷电池, 12/min 精选荞愈胶囊), solver output matches hand-verified values from community guides within rounding tolerance.

#### F3. Grid canvas editor

A 2D grid-based canvas where the user can:

- Pan, zoom, and scroll.
- Place devices from a palette, with rotation (R key) and mirroring.
- Drag-select, move, copy, paste, delete.
- Undo / redo with unlimited history within a session.
- Drag to draw a solid belt or fluid pipe path between two ports.
- Toggle between "solid layer" and "fluid layer" view modes. In each mode the other layer's paths are rendered dimmed.
- Edit placed devices' recipe selection inline.

Visuals: top-down orthographic, same grid resolution as the game. Distinct visual treatment for solid vs fluid links (color + style). Device sprites can be simple colored rectangles with icons in v1.

*Acceptance:* User can recreate a published community blueprint (e.g. a small 高谷电池 production line) by hand in under 5 minutes.

#### F4. Manual layout with snap / align

- Cells snap to the grid.
- Devices refuse to place if their footprint collides with another device or falls outside the plot mask.
- Belts/pipes refuse to route through cells where the target layer is already occupied by an incompatible element.
- Visual indicators for port connectivity (green = connected, red = floating, yellow = connected but wrong material/layer).

*Acceptance:* Invalid placements are rejected at placement time (not silently saved and flagged later).

#### F5. Design rule checker (DRC)

Runs continuously in the background; results shown as a lint panel with clickable entries that pan the viewport to the offending cell. Rules include:

**Power**
- `POWER_001` (error): device outside power coverage.
- `POWER_002` (error): power pole outside core AoE and not on a repeater chain.
- `POWER_003` (error): total power draw exceeds supply.
- `POWER_004` (error): wire segment > 80m.

**Ports & connections**
- `PORT_001` (error): device port is required-input but not connected.
- `PORT_002` (error): two outputs connected together without a valid merger.
- `PORT_003` (error): fluid port connected to solid belt or vice versa.

**Solid-layer transport**
- `BELT_001` (error): belt throughput exceeds tier limit.
- `BELT_CROSS_001` (error): two solid links occupy the same cell without a 物流桥 component.
- `BELT_CROSS_DELAY_001` (warning): critical path crosses > 1 物流桥 — expected throughput reduced by ~25% per community measurement.

**Fluid-layer transport**
- `PIPE_001` (error): fluid throughput exceeds pipe tier cap.
- `PIPE_CROSS_001` (error): two fluid links occupy the same cell without a fluid crossing component (rule pending in-game verification).

**Cross-layer**
- `LAYER_CROSS_001` (error): pipe junction / splitter / support overlaps a belt (occupies both layers).
- `LAYER_CROSS_002` (error): transport link enters a device footprint cell other than at a declared port.

**Region / tech**
- `REGION_001` (error): device placed outside plot mask.
- `TECH_001` (warning): device used but its tech prereq is not unlocked in the project's tech profile.

**Storage**
- `STORAGE_001` (info): sink storage full — no drain configured.

Each rule has a severity (`error` | `warning` | `info`), a stable id, and a human-readable message via the i18n layer.

*Acceptance:* Every rule has at least one unit test built from a minimal synthetic layout. A clean known-good layout (use one from community blueprints) produces zero errors.

### 5.2 Advanced features (P1)

#### F6. Production simulation — two-model architecture

A tick-based simulator that runs the designed layout forward for N simulated minutes and reports:

- Per-output item throughput (items/min for solids, units/min for fluids).
- Per-machine utilization (%).
- Bottleneck identification.
- Time-to-steady-state.
- Backpressure visualization: heat-map overlay.

**The simulator is split into two subsystems coordinated at machine boundaries:**

- **Solid subsystem:** tick-based discrete simulation. Belts are FIFO queues; items advance one cell per `belt_tick_interval` / `tier`. Splitters distribute rate. Machines are state machines: `idle → consuming → producing → idle`. 物流桥 latency is applied as described in §4.5.
- **Fluid subsystem:** flow-network simulation. Each sim-step solves a max-flow / LP over the current pipe topology with per-edge capacity = tier rate and per-node demand = machine consumption rate. Reflux topology is handled naturally by the flow graph.

Machine boundaries marshal between the two subsystems. A machine with fluid inputs and solid outputs (e.g. 精炼炉 consuming 清水 and producing 赤铜块) sees its fluid inputs as a rate and its solid outputs as discrete items; the simulator reconciles at the machine's cycle boundary.

*Acceptance:* Simulator output matches the solver's theoretical max within ~5% for a well-designed layout; matches the actual bottleneck identified by hand for a deliberately under-provisioned layout. Fluid throughput matches community reports for at least one pipe-heavy reference design (e.g. a 武陵 电池 line).

#### F7. Auto-router

Given two ports and the current occupied-cell state, compute a legal belt/pipe path. Algorithm: cost-weighted A* on the grid, where:

- Empty cells have low cost.
- Cells occupied on the *other* layer have medium cost if the layer-cross rule permits (to discourage but not forbid), high cost otherwise.
- Placing a 物流桥 has a configurable cost (default moderate — prefer detour when short, prefer crossing when detour is long). Cost increases sharply for the 2nd bridge on the same logical path due to `BELT_CROSS_DELAY_001`.
- Turns add small cost (prefer straight).
- Routing through occupied solid cells is forbidden unless a 物流桥 is inserted.

Support multi-net simultaneous routing (route N pairs together minimizing total cost + crossings), initially via sequential A* with rip-up-and-reroute when conflicts arise.

The router must be layer-aware: a fluid-port-to-fluid-port net routes on the fluid layer and only sees fluid-layer occupants; a solid net routes on the solid layer. Cross-layer obstacles (pipe junctions on the solid layer) are accounted for at cell-cost evaluation time.

*Acceptance:* On a test set of 20 hand-designed routing problems (mixed solid/fluid), auto-router produces a legal path in 100% of cases and a path no more than 20% longer than the hand-optimal in 80% of cases.

#### F8. Placement optimizer

Given a fixed set of machines (from the solver) and a bounding-box constraint, find a placement that:

- Keeps all devices inside the box.
- Minimizes total estimated routing length (Manhattan sum over the recipe graph's connections).
- Respects port orientation (try to face producer outputs toward consumer inputs).
- Minimizes expected 物流桥 insertions (which cause `BELT_CROSS_DELAY_001`).

Algorithm: simulated annealing on `(position, rotation)` for each device, with an objective = weighted sum of estimated wire length + bridge-count penalty + overflow penalty. Run the auto-router on the candidate placement for a final check.

*Acceptance:* On reference layouts, optimizer produces a placement whose auto-routed total belt length is within 25% of a hand-designed reference layout's total belt length.

#### F9. End-to-end layout generation

Given `(region, target recipe, target rate, bounding box)`, produce a complete placed-and-routed layout by chaining F2 → F8 → F7 with DRC validation. This is the "one-button design" feature.

*Acceptance:* Produces a DRC-clean layout for at least 5 common target recipes within 60 seconds each on a modern laptop.

### 5.3 Advanced features (P2, nice-to-have)

#### F10. Version diff and migration

When the user loads a project created under an older data version, offer a migration wizard: show which devices/recipes changed, suggest substitutions, re-run the solver, flag manual steps.

#### F11. Export formats

- PNG screenshot with grid overlay, device labels, and belt/pipe directions (layer-colored).
- Annotated PDF build guide: numbered build-order steps, per-step screenshot highlighting what to place, BOM, total power/material checklist.
- JSON project save (full editable state).

#### F12. Library of reference blueprints

Users can save layouts as reusable modules and import them as a black box (like hierarchical cells in IC design). A module exposes external ports and internal DRC is precomputed.

---

## 6. Key design decisions

### 6.1 Tech stack

- **Frontend:** TypeScript + React + **Konva.js** for the canvas (built-in hit detection, transformers, layers). Tailwind for the non-canvas UI chrome.
- **Solver:** **glpk.js** (WASM GLPK) for the LP; the problem is small (< 100 variables) so a hand-rolled fractional solver is also acceptable. Do not introduce Python unless the solver grows beyond LP.
- **Belt simulation:** pure TypeScript, worker thread. Tick-based.
- **Fluid simulation:** pure TypeScript, worker thread. Uses glpk.js for the per-tick LP solve (reuses the solver dep).
- **Auto-router & placement:** pure TypeScript, worker thread.
- **Persistence:** LocalStorage for project list, IndexedDB for project blobs. Export/import as JSON files.
- **Distribution:** static site, deployable to GitHub Pages / Cloudflare Pages. No backend in v1.
- **Data pipeline:** `scripts/scrape-endwiki.ts` is a first-class build step. Runs on demand, commits generated JSON into `data/versions/<version>/`. Scraper caches raw HTML under `scripts/.cache/` so reruns don't re-hit `end.wiki`.

### 6.2 Data versioning

All device/recipe/item data lives in `data/versions/<version>/*.json`, generated by scraping `end.wiki`. The project file records which version it was created under. The app bundles multiple versions and lets the user pick.

Schema for each JSON file is documented via JSON Schema in `data/schema/`. Every PR to the data directory is validated in CI against the schema.

**Scraper responsibilities:**

- Fetch the building index (`/zh-Hans/factory/buildings/`), extract all device slugs.
- Fetch each device page, extract: 建筑类型, 需要电力, 电力消耗, 带宽, 流体接口, 可拆除, 占地面积 (split `W×H×D` into fields), recipe table.
- Fetch the recipe index (`/zh-Hans/factory/recipes/`), extract all recipe slugs.
- Fetch each recipe page for canonical cycle times and input/output ratios.
- Cross-reference device→recipe and recipe→device.
- Fetch localized display names from the other language versions of each page (english, japanese at minimum; more as bandwidth permits).
- Validate output against JSON Schema.

The scraper is idempotent, rate-limited (500 ms between requests), and respects the site's robots.txt. It is not run in production — only in development, and only when a new game version ships.

### 6.3 Crossing rule table

Represented declaratively as `data/versions/<version>/crossing_rules.json`:

```json
{
  "same_layer_crossing": {
    "solid": {
      "allowed_without_component": false,
      "crossing_component_id": "logistics-bridge-1",
      "latency_penalty": {
        "model": "bridge_count_step",
        "thresholds": [
          { "at_least": 2, "throughput_multiplier": 0.75 },
          { "at_least": 3, "throughput_multiplier": 0.75 }
        ],
        "source": "community_measurement_gamersky_2080424"
      },
      "rules": [
        "Two straight belts cannot share a cell.",
        "Orthogonal crossing only via 物流桥 (logistics-bridge-1)."
      ]
    },
    "fluid": {
      "allowed_without_component": false,
      "crossing_component_id": "pipe-bridge-1",
      "rules": ["TODO: verify in-game; assumed same as solid."]
    }
  },
  "cross_layer_crossing": {
    "default": "allowed",
    "exceptions": [
      {
        "when": { "fluid_occupant_type": "pipe_junction" },
        "result": "forbidden",
        "reason_en": "Pipe junctions occupy the solid layer; belts cannot pass through.",
        "reason_zh_hans": "管道接口占据固体层，传送带无法穿过。"
      },
      {
        "when": { "fluid_occupant_type": "pipe_splitter" },
        "result": "forbidden",
        "reason_en": "Pipe splitters occupy the solid layer.",
        "reason_zh_hans": "管道分流器占据固体层。"
      },
      {
        "when": { "fluid_occupant_type": "pipe_support" },
        "result": "forbidden",
        "reason_en": "Pipe supports occupy the solid layer.",
        "reason_zh_hans": "管道支架占据固体层。"
      },
      {
        "when": { "fluid_occupant_type": "pipe_confluence" },
        "result": "forbidden",
        "reason_en": "Pipe confluence (汇流器) occupies the solid layer.",
        "reason_zh_hans": "管道汇流器占据固体层。"
      }
    ]
  }
}
```

The DRC consults this table. When the user updates the tool for a new game version, they update this file — code does not change.

### 6.4 Coordinate system and rotation

- Grid origin: top-left, x increases right, y increases down. This matches the screen and most game top-down views.
- Rotations: 0° = device faces east (ports defined in east-facing orientation); positive rotation is clockwise. 90°, 180°, 270° are the only legal rotations.
- Port coordinates in device definitions are given in the device's *unrotated* frame and transformed at render/query time.

### 6.5 Performance targets

- Editor stays at 60 fps when panning a 100×100 grid with 200 devices and 500 belt/pipe segments combined.
- DRC incremental update completes within 50 ms for a single edit on the above scene.
- Full simulation of 10 minutes of sim-time completes within 2 seconds for the above scene.
- Auto-router completes in under 1 second per net on the above scene.
- Fluid LP solve per tick: under 20 ms for up to 50 fluid links.

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
      port_overrides.json       # hand-curated port positions
  schema/
    *.schema.json

scripts/
  scrape-endwiki.ts             # data pipeline
  .cache/                       # raw HTML cache (gitignored)

src/
  core/                         # Pure, no DOM, fully unit-tested
    domain/                     # Types: Device, Recipe, Item, Project, Layout, SolidLink, FluidLink, Cell
    data-loader/                # Loads & validates data JSON
    solver/                     # Recipe / throughput LP
    layout/                     # Grid, placement, port geometry, rotation math
    drc/                        # Rule engine + rule definitions
    sim/
      belt/                     # Tick-based FIFO simulator
      fluid/                    # Flow-network LP simulator
      coordinator/              # Machine-boundary reconciliation
    router/                     # Layer-aware A* auto-router
    placer/                     # SA placement optimizer
    export/                     # JSON, PNG, PDF, checklist generators
  ui/
    editor/                     # Canvas (Konva), palette, inspector, layer toggle
    solver-panel/
    drc-panel/
    sim-panel/
    project-manager/
    components/                 # Reusable React components
  workers/                      # Web Workers for solver, sim, router, placer
  i18n/                         # zh-CN, zh-TW, en, ja (minimum); scraper can add more

test/
  unit/
  integration/
  fixtures/                     # Hand-crafted reference layouts
```

The `core/` tree must not import from `ui/` or any browser API. It should be usable from Node for CI tests.

---

## 8. Phased delivery plan

Each phase ends with a deployable build. Do not move on until the previous phase's acceptance criteria are met.

### Phase 0 — Project skeleton (week 1)

- Repo, TypeScript config, Vite, React, Tailwind, ESLint, Prettier, Vitest.
- Empty `core/` and `ui/` trees.
- **Scraper for `end.wiki` implemented end-to-end**, producing populated `data/versions/1.2/` with all 69 devices + 74 recipes.
- Data schema validated in CI.
- CI runs lint + tests + schema validation on PR.

### Phase 1 — Solver MVP (weeks 2–3)

- F1 (data layer), F2 (solver).
- UI: a single-page form. Pick region, pick target output, enter rate, see solver result as a tree + BOM.
- Deliverable: standalone solver page. Useful on its own even without the editor.

### Phase 2 — Editor MVP (weeks 4–7)

- F3 (canvas with layer toggle), F4 (manual layout), F5 (DRC).
- Integration with F2: user can drag solver-recommended machines from the solver panel onto the canvas.
- Both belt and pipe placement supported manually from day one.
- Deliverable: full manual design flow. Users can hand-design layouts and export a build checklist.

### Phase 3 — Simulation (weeks 8–10)

- F6 (two-model simulator).
- Belt subsystem first (1 week), fluid subsystem second (1 week), coordinator third (1 week).
- Deliverable: user can press "Simulate" on any layout and see throughput / bottleneck analysis.

Note: one week longer than v1 estimate to account for the fluid-LP subsystem.

### Phase 4 — Routing and placement (weeks 11–14)

- F7 (layer-aware auto-router), F8 (placement optimizer with bridge-count penalty).
- Deliverable: user selects a set of machines, draws a bounding box, clicks "Place and route." Gets a DRC-clean layout back.

### Phase 5 — End-to-end generation (weeks 15–16)

- F9 (full pipeline).
- Deliverable: one-button "design me a factory for 6/min 高谷电池."

### Phase 6 — Polish (weeks 17+)

- F10, F11, F12 as time allows.
- Documentation site, video walkthrough, community onboarding.

---

## 9. Testing strategy

- **Unit tests** for every `core/` module. Aim for >85% line coverage on `core/`.
- **Golden tests** for the solver: for ~20 reference target recipes (sourced from community毕业蓝图 posts), expected machine counts are stored as fixtures and checked on every commit.
- **Scraper golden tests:** a snapshot of scraped data is committed; scraper runs in CI against cached HTML and must produce byte-identical JSON.
- **Integration tests** that load a fixture layout, run DRC and sim, and assert on the results.
- **Fluid simulator validation:** at least 3 reference fluid layouts (from community 武陵 blueprints) with published throughput numbers, asserted to within 10%.
- **Visual regression tests** for the canvas via Playwright, using fixed seeds for anything random.
- **Manual QA checklist** per release, covering at least one full hand-designed layout per supported region.

---

## 10. Unresolved questions

Items the coder agent should **implement TODO hooks for, but not block on**. Each will be resolved by the project owner taking one or more screenshots / measurements in-game; until then the listed default applies.

### 10.1 Device port positions

**Status:** Unresolved for all 69 devices. Public wikis render device sprites but do not publish port positions as data.

**Default:** treat all devices as axis-aligned rectangles; let user draw belts from any edge cell.

**Resolution path:** hand-curate `port_overrides.json` for the top ~20 devices after MVP is validated.

### 10.2 物流桥 exact footprint and port geometry

**Status:** Likely 1×1 with two orthogonal through-ports (N↔S and E↔W), but not confirmed.

**Default:** 1×1, 4 ports (one each N/E/S/W), paired N↔S and E↔W as independent flows.

**Resolution path:** one in-game screenshot.

### 10.3 Pipe-layer components that block belts — exact list

**Status:** §4.5 lists the confirmed blockers (管道分流器, 管道汇流器, pipe supports, pipe junctions). There may be others (e.g. 洒水机, 给水器, 储液罐) that need the same classification.

**Default:** treat all non-straight-pipe fluid components as dual-layer occupants.

**Resolution path:** go through the 10 仓储存取, 合成制造, and 功能设备 categories on `end.wiki` and mark each as "straight-pipe-only" vs "dual-layer."

### 10.4 Same-layer pipe crossing rules

**Status:** Fluid flow is additive/particle-based, so mechanical intuition suggests pipes may not need an explicit crossing component (flows pass through each other "for free"). But this is speculative.

**Default:** symmetric with belts — pipes require a crossing component to share a cell. Conservative; may over-constrain designs.

**Resolution path:** attempt to place two crossing pipes in-game and observe behavior.

### 10.5 Plot dimensions per region

**Status:** No authoritative source. Community screenshots suggest 四号谷地 main base is ~30×30, 武陵 similar. Sub-bases are smaller.

**Default:** `regions.json` placeholder with `{ valley_4: 32x32, valley_4_sub_1: 16x16, wuling: 32x32, ... }`. Project owner overrides when measured.

**Resolution path:** in-game, count grid cells along each edge of each plot.

### 10.6 Core / sub-core / pole AoE radii

**Status:** Described qualitatively in official new-player guide ("固定作用范围") but not quantified.

**Default:** protocol core AoE = 12 cells radius, 供电桩 AoE = 8 cells radius. Placeholder.

**Resolution path:** place a pole, measure the visualized AoE circle in cells.

### 10.7 Wire length in grid cells

**Status:** 80 meters confirmed as the wire max. Unknown meter-to-cell conversion.

**Default:** 1 meter = 1 cell, i.e. 80-cell max wire segment.

**Resolution path:** in-game, pull a wire to its snap limit and count cells.

### 10.8 Tech tree structure

**Status:** Tutorial pages describe the tech tree qualitatively (4 main columns: 加工, 发电, 传送带, 物流). No machine-readable dump exists publicly.

**Default:** hand-transcribe a flat list of unlocks per tier into `tech_tree.json` based on the `end.wiki` tutorial page. ~30 nodes total, one-time effort of ~2 hours. TECH_001 DRC rule can be disabled until this is done.

**Resolution path:** transcribe from `https://end.wiki/zh-Hans/tutorials/factory/`.

### 10.9 Storage buffer semantics

**Status:** Machines have internal input/output buffers. Whether they hold "one full recipe's worth" or "item-by-item" is unclear from community writeups. Affects simulator accuracy at the 5% level, not correctness.

**Default:** assume each machine port has a 1-item (or 1-unit-fluid) buffer beyond the active recipe slot.

**Resolution path:** observe in-game by filling a belt and watching machine state transitions.

### 10.10 汇流器 throughput anomaly

**Status:** One community source ([Bilibili BV133ZsBNETz](https://www.bilibili.com/video/BV133ZsBNETz)) reports "管道汇流器 steals throughput" — possibly a bug or an undocumented feature.

**Default:** model 汇流器 as lossless flow merge.

**Resolution path:** watch the video or test in-game.

### 10.11 Third region (锦陇) data

**Status:** Mentioned in one community note; no systematic documentation.

**Default:** not included in v1 shipped regions. Add when owner has personal experience with it.

---

## 11. Blueprint code interop — permanently deferred

Reading/writing the in-game `EF01...` blueprint code is out of scope for all phases. Reasons reinforced by research:

- **Likely server-referenced, not self-contained.** Codes do not work across regional servers (Asian code does not import on NA). If the code were a self-contained encoded payload, it would be portable.
- **No community tool has decoded the format** despite the game having been live for months and two active third-party tool projects (MaaEnd, ok-end-field). Both use vision-based UI automation rather than attempting to decode.
- **ToS risk.** Hypergryph's Fair Play Declaration prohibits "modification of game data" and "bypassing game mechanics." Write-back is risky; read-only decoding is less so but still unvalidated.
- **Alternative exists.** Screenshot + vision extraction ("import from in-game photo") is a future possibility if user demand emerges, and it avoids the ToS boundary entirely since it treats game output as a visual image.

The tool's output is a human-executable build guide: screenshot + numbered build-order list + BOM. Users manually rebuild in-game.

---

## 12. Coding conventions

- TypeScript strict mode. No `any` without a `// TODO:` justification.
- Follow existing project ESLint config. Prettier on save.
- Functions in `core/` are pure where possible; side effects isolated in `ui/` and `workers/`.
- Domain types are immutable (`readonly` fields); state transitions return new objects.
- Test files colocated with source: `foo.ts` + `foo.test.ts`.
- Commit messages: conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `data:` for scraper output updates).
- Comments: Google-style JSDoc for exported functions. No inline comments restating the code. Comments explain *why*, not *what*.
- UI text is never hardcoded; all strings go through the i18n layer. If a translation is unavailable, mark the key as `[TODO-<locale>]` and fall back to zh-CN.
- No MVP over-engineering: do not build an abstraction until there are two concrete use cases.

---

## 13. Definition of done (per feature)

A feature is "done" when:

1. All acceptance criteria in §5 are met.
2. Unit tests exist and pass in CI.
3. At least one end-to-end test exercises the feature in combination with adjacent features.
4. The feature is wired into the UI behind a stable, documented entry point.
5. User-visible strings are localized (zh-Hans at minimum, en strongly preferred).
6. If the feature changes data schema, the schema file is updated and a migration is provided for existing projects.
7. A short paragraph in `docs/features/<feature>.md` describes what it does, how to use it, and known limitations.

---

## Changelog

### v2 (this document)

- **§2 Scope:** permanently deferred blueprint codec work; combat devices scope-reduced but data still scraped.
- **§4.1 Devices:** concrete field list matching `end.wiki` scraper output. `end.wiki` slugs are the canonical device IDs.
- **§4.3 Items:** added `kind ∈ {solid, fluid}` and rarity.
- **§4.4 Transport layers:** **major revision.** Two physically different models (FIFO belts vs particle-flow pipes) replacing the previous unified "link" concept. This propagates into §4.5, §5.1 F5, §5.2 F6, §5.2 F7, §7.
- **§4.5 Crossings:** concrete rules replacing the previous TODO placeholder. 物流桥 latency penalty modeled. Pipe junctions / splitters / supports / confluences marked as dual-layer occupants.
- **§4.6 Power:** added 80m wire limit and 息壤-tier variants.
- **§5.1 F5 DRC:** expanded rule list, including new `BELT_CROSS_DELAY_001`, `LAYER_CROSS_001`, `LAYER_CROSS_002`, `PIPE_001`, `PIPE_CROSS_001`.
- **§5.2 F6 Simulator:** rewritten around two-model architecture.
- **§5.2 F7 Router:** layer-aware.
- **§6.1 Tech stack:** scraper promoted to first-class build step; glpk.js pulls double duty as fluid LP solver.
- **§6.2 Data versioning:** scraper responsibilities enumerated.
- **§6.3 Crossing rules:** concrete rule table replacing TODO.
- **§8 Phased delivery:** Phase 3 (Simulation) extended by 1 week to accommodate fluid subsystem. Scraper added to Phase 0.
- **§9 Testing:** added scraper golden tests and fluid-simulator validation tests.
- **§10 Unresolved questions:** shortened from 8 to 11 items, each now concrete enough to be resolved with 1 screenshot or 1 measurement rather than open-ended research.
- **§11 Blueprint codec:** upgraded from "deferred" to "permanently deferred" with research-backed reasoning.