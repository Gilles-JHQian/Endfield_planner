# Endfield EDA — Requirements & Implementation Plan (v3)

A design automation tool for the integrated industry system in *Arknights: Endfield* (《明日方舟：终末地》), modeled loosely on electronic design automation (EDA) tools from IC design. The target user is an experienced player who wants to design, validate, and iterate on factory layouts **outside the game**, then reproduce them in-game, instead of demolishing and rebuilding live bases every time the game updates or requirements change.

This document is the single source of truth for scope, priorities, and technical decisions. Read it end-to-end before starting work.

**Document version:** v3 — incorporates owner clarifications on plot sizing, 物流桥 semantics, pipe crossing rules, power model, and the addition of an auxiliary device editor tool. See `RESEARCH_FINDINGS.md` for community-sourced domain research. Changelog at the end of this document.

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
- **Auxiliary device editor tool** for maintaining the device library when the game ships new versions (see §5.4).

### Explicitly out of scope

- **Reading or writing the in-game blueprint code (`EF01...`).** Research strongly suggests the code is a server-side reference rather than self-contained encoded data — no community tool has decoded it despite months of community activity; both major third-party tools (MaaEnd, ok-end-field) use vision-based UI automation instead. Cross-server invalidity corroborates this. Additionally, Hypergryph's Fair Play Declaration creates ToS risk for write-back. **Permanently deferred; no phase will implement this.** The tool's output is a human-executable build guide. See §11 for details.
- **Save-file parsing from the installed game client.** Same reasoning.
- **Multiplayer / collaborative editing.** Single-user local tool only.
- **Mobile-first UI.** Design for desktop browsers. Mobile viewing is nice-to-have; mobile editing is not.
- **Combat buildings / defense turrets / ziplines.** Data for these devices is scraped (essentially free) but hidden behind a feature flag in the UI palette. Not supported by the solver, DRC, or simulator.
- **Electric wire 80m segment limit modeling.** Inside the integrated-industry ("AIC") build plots, wires auto-connect — the 80m limit only applies to outdoor infrastructure and does not affect base design. Not modeled in DRC.

---

## 3. Target user and usage workflow

The primary user is a player who:

- Already understands the integrated industry system.
- Wants to prototype multiple layout variants before demolishing in-game.
- Is willing to manually rebuild from a reference image + build-order list.

Intended workflow:

1. Open the tool in a browser.
2. Pick a region (四号谷地 / 武陵 / future regions), which sets the **starting** plot dimensions, available machines, and tech tier. The user may resize the plot freely at any time.
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
- `io_ports`: list of `{side, offset, kind, direction_constraint}`. `side` ∈ {N,E,S,W} relative to the device's current rotation. `offset` is the cell index along that side (0-indexed). `kind` ∈ {solid, fluid, power}. `direction_constraint` ∈ {input, output, bidirectional, paired_opposite} — see §4.5.1 for `paired_opposite`, used by 物流桥. A port occupies exactly one cell on the device's perimeter.
- `bandwidth`: integer from `end.wiki` field `带宽`. Caps items/tick per port.
- `power_draw`: from `end.wiki` field `电力消耗` (integer).
- `requires_power`: from `end.wiki` field `需要电力` (boolean).
- `has_fluid_interface`: from `end.wiki` field `流体接口` (boolean).
- `tech_prereq`: tech-tree node(s) required to unlock.
- `recipes`: list of recipe IDs this device can execute.
- `category`: from `end.wiki` field `建筑类型`, one of: `miner`, `storage`, `basic_production`, `synthesis`, `power`, `utility`, `combat`, `planting`, `logistics`.

Port positions are **not explicitly in text** on `end.wiki` — they appear only in device render sprites. For the first cut, the scraper produces devices with **no port data**, and the user manually fills in port positions via the auxiliary device editor (§5.4). DRC treats port-less devices as "any edge cell may be a port" (permissive) until ports are defined.

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

#### Pipe infrastructure components occupy the solid layer

Straight pipe segments coexist freely with straight belt segments in the same cell. **But:** pipe splitters (管道分流器), pipe confluences (管道汇流器), pipe bridges (管道版物流桥), and pipe supports also occupy the solid layer and block belts there. This asymmetry is captured in the crossing rules below.

### 4.5 Crossings and layer rules

Every grid `Cell` has two independent occupancy slots: `solid_occupant` and `fluid_occupant`. A device footprint cell sets both slots (devices occupy both layers at their location unless specifically marked otherwise).

#### 4.5.1 Same-layer collision is illegal without a dedicated crossing component

Both layers use the same crossing framework with parallel components:

- **Solid:** 物流桥 (logistics bridge, `logistics-bridge-1`).
- **Fluid:** pipe bridge (`pipe-bridge-1`).

The crossing component is a 1×1 cell with two independent orthogonal through-paths: one N↔S and one E↔W. The two paths do not mix.

**Port direction is a user decision, but constrained:**

- The user decides which side is the input for each of the two paths when placing the component.
- Once one side of a path is marked as input, the **opposite side of that path is automatically locked as output**. Inputs and outputs are always on opposing sides of the same axis.
- Example legal configurations: `N→S, W→E`; `S→N, E→W`; `N→S, E→W`.
- Example illegal configurations: `N→E` (cross-axis), `N→S, E→N` (second path not opposite-paired).

This constraint is encoded as the `paired_opposite` port direction constraint in the device definition: the bridge has 4 ports (one per side), grouped into two pairs (N/S and E/W). Within each pair, exactly one is input and one is output, and the user's choice of input side determines both.

**物流桥 latency penalty (solid only):** community testing shows that a line passing through ≥ 2 bridges suffers ~1-cell delay per 4 items (~25% throughput loss). ≥ 3 bridges saturate at the 2-bridge level — no additional penalty. The simulator must model this; the DRC should warn when a critical path crosses > 1 bridge. The fluid bridge does not have a documented equivalent penalty (pending in-game verification).

#### 4.5.2 Cross-layer coexistence is generally legal, with exceptions

- **Main runs:** a straight belt and a straight pipe can share a cell (belt on solid layer, pipe on fluid layer).
- **Exception A — pipe infrastructure on a belt:** illegal. All pipe splitters, confluences, bridges, and supports occupy the solid layer and block belts.
- **Exception B — belt infrastructure on a pipe:** belt splitters, confluences, and 物流桥 similarly **occupy both layers at the infrastructure cell**. A 物流桥 cannot sit on a pipe; a belt splitter cannot sit on a pipe.
- **Exception C — device cells:** no transport link may enter a device footprint cell except at a declared port.

These rules are encoded declaratively in `data/versions/<version>/crossing_rules.json`; the DRC engine is a rule interpreter. Schema shown in §6.3.

### 4.6 Power model

- **Protocol core** has **no AoE**. The core wirelessly powers **every 供电桩 placed inside the core's build plot**, with no distance constraint.
- **供电桩** (power pole / diffuser, `power-diffuser-1`): footprint 2×2, placed anywhere inside the core's build plot. Each pole has its own **square** AoE around it (not circular); devices whose footprint overlaps the AoE are powered. **AoE = 12 cells per side, centered on the pole's footprint center.** 息壤供电桩 (`power-diffuser-2`, 武陵-tier) has the **same** 12-cell AoE — the variant differs only in tech tier / unlock, not in range.
- **中继器** (repeater, `power-pole-2`): footprint 3×3. Extends pole-to-pole connectivity inside a **7-cell-per-side** square centered on the repeater. **Does not supply power to devices itself** — DRC's POWER_001 only checks 供电桩 AoE coverage. Repeaters chain poles together when a single pole's AoE doesn't reach the next. 息壤中继器 (`power-pole-3`, 武陵-tier) has the same 7-cell range.
- **热能池** (thermal battery, `power-station-1`): power source. Capacity per battery is data-driven (see §10.4 / `device.power_supply` field; first-pass value imported from JamboChen/endfield-calc per `plan/DRC_REPORT.md`).
- Every device with `requires_power = true` consumes its `power_draw` while running; power budget is a hard constraint.
- AoE / repeater range / battery capacity are all per-device data fields (`power_aoe`, `power_supply`); see §10.4 and the JSON schema in `data/schema/devices.schema.json`.

DRC must flag: devices outside any 供电桩's AoE square (POWER_001); total power draw exceeding total 热能池 supply (POWER_002).

### 4.7 Region / plot

- `region_id` (`valley_4`, `wuling`, `jinlong`).
- `plot_default_size`: `{ width: number, height: number }` — the default starting size when the user creates a new project in this region. This is a starting value, not a constraint.
- **The user can resize the plot freely in the GUI** to any width × height. The plot is a bounded rectangle of legal build cells; resizing is a core feature (§5.1 F4.1).
- `core_position`: fixed at a region-specified location within the default plot. When the user resizes, the core position should remain consistent with the origin (top-left stays at 0,0); the user can move the core manually if needed.
- `sub_core_positions`: list of secondary cores (no power supply, but storage/logistics).
- `available_tech_tiers`: which tiers are unlocked in this region.
- `mining_nodes`: fixed resource spawn points on the plot or just outside.
- **Blueprints do not transfer across game servers** (Asian vs NA); this is noted for user documentation but has no code-level impact.

**Region defaults:**

- 四号谷地 main base: placeholder (owner will measure in-game and update).
- 武陵 main base: placeholder.
- Sub-bases (all regions): **50×50**.

---

## 5. Feature breakdown

Features are split into **basic** (must-have, P0) and **advanced** (P1/P2). Each feature has acceptance criteria. Build in the order listed; each tier should be shippable on its own.

### 5.1 Basic features (P0)

#### F1. Device & recipe data layer

Load device, recipe, item definitions from versioned JSON files sourced from `end.wiki` via a one-time scraper (see §6.2), augmented with hand-curated port data from the auxiliary device editor (§5.4).

*Acceptance:* A new device can be added by (a) editing JSON directly or (b) using the auxiliary device editor tool, with no main-tool code changes. Loading a project created under v1.1 into the v1.2 schema reports which devices/recipes are missing or changed. A single `pnpm scrape:endwiki --version 1.2` command regenerates all scraped data from scratch.

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

**Live ghost preview (mandatory):** while the user is drawing a belt or pipe, or has a device selected from the palette, the tool renders a **real-time ghost** of the placement at the current mouse position. The ghost updates every mouse-move event, shows the candidate path/footprint, and color-codes validity (green = valid, red = DRC violation, yellow = valid but sub-optimal). This mirrors the in-game placement UX and is essential for the tool to feel responsive rather than clunky. Performance budget: ghost render must complete within one frame (~16ms) at the performance targets in §6.5.

Visuals: top-down orthographic, same grid resolution as the game. Distinct visual treatment for solid vs fluid links (color + style). Device sprites can be simple colored rectangles with icons in v1.

*Acceptance:* User can recreate a published community blueprint (e.g. a small 高谷电池 production line) by hand in under 5 minutes. Ghost preview remains smooth (no perceptible lag) during rapid mouse movement on the reference scene from §6.5.

#### F4. Manual layout with snap / align

- Cells snap to the grid.
- Devices refuse to place if their footprint collides with another device or falls outside the plot mask.
- Belts/pipes refuse to route through cells where the target layer is already occupied by an incompatible element.
- Visual indicators for port connectivity (green = connected, red = floating, yellow = connected but wrong material/layer).

##### F4.1 Plot sizing

The plot is a rectangle whose dimensions the user controls in the GUI. Two interaction patterns:

1. **Create:** new project from region template starts at `region.plot_default_size`. Sub-bases default to 50×50.
2. **Resize:** drag handles on plot boundary, or numeric width/height input in a sidebar. Fully free (arbitrary integer width × height, e.g. 45×73). Shrinking the plot below existing device positions is blocked (or prompts the user to delete conflicting devices first).

The plot rectangle is the only build area — cells outside it cannot hold devices, belts, or pipes.

*Acceptance:* Invalid placements are rejected at placement time (not silently saved and flagged later). Plot resize works to arbitrary integer dimensions and correctly enforces containment.

#### F5. Design rule checker (DRC)

Runs continuously in the background; results shown as a lint panel with clickable entries that pan the viewport to the offending cell. Rules include:

**Power**
- `POWER_001` (error): device outside any 供电桩 square.
- `POWER_002` (error): total power draw exceeds supply.

**Ports & connections**
- `PORT_001` (error): device port is required-input but not connected.
- `PORT_002` (error): two outputs connected together without a valid merger.
- `PORT_003` (error): fluid port connected to solid belt or vice versa.
- `PORT_004` (error): 物流桥 / pipe bridge port configuration violates `paired_opposite` constraint (two inputs on the same axis, cross-axis connection, etc.).

**Solid-layer transport**
- `BELT_001` (error): belt throughput exceeds tier limit.
- `BELT_CROSS_001` (error): two solid links occupy the same cell without a 物流桥 component.
- `BELT_CROSS_DELAY_001` (warning): critical path crosses > 1 物流桥 — expected throughput reduced by ~25% per community measurement.

**Fluid-layer transport**
- `PIPE_001` (error): fluid throughput exceeds pipe tier cap.
- `PIPE_CROSS_001` (error): two fluid links occupy the same cell without a pipe bridge component.

**Cross-layer**
- `LAYER_CROSS_001` (error): pipe infrastructure (splitter / confluence / bridge / support) overlaps a belt.
- `LAYER_CROSS_002` (error): belt infrastructure (splitter / confluence / 物流桥) overlaps a pipe.
- `LAYER_CROSS_003` (error): transport link enters a device footprint cell other than at a declared port.

**Region / tech**
- `REGION_001` (error): device placed outside plot bounds.
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

- **Solid subsystem:** tick-based discrete simulation. Belts are FIFO queues; items advance one cell per `belt_tick_interval` / `tier`. Splitters distribute rate. Machines are state machines: `idle → consuming → producing → idle`. 物流桥 latency is applied as described in §4.5.1.
- **Fluid subsystem:** flow-network simulation. Each sim-step solves a max-flow / LP over the current pipe topology with per-edge capacity = tier rate and per-node demand = machine consumption rate. Reflux topology is handled naturally by the flow graph.

Machine boundaries marshal between the two subsystems. A machine with fluid inputs and solid outputs (e.g. 精炼炉 consuming 清水 and producing 赤铜块) sees its fluid inputs as a rate and its solid outputs as discrete items; the simulator reconciles at the machine's cycle boundary.

*Acceptance:* Simulator output matches the solver's theoretical max within ~5% for a well-designed layout; matches the actual bottleneck identified by hand for a deliberately under-provisioned layout. Fluid throughput matches community reports for at least one pipe-heavy reference design (e.g. a 武陵 电池 line).

#### F7. Auto-router

Given two ports and the current occupied-cell state, compute a legal belt/pipe path. Algorithm: cost-weighted A* on the grid, where:

- Empty cells have low cost.
- Cells occupied on the *other* layer have medium cost if the layer-cross rule permits (to discourage but not forbid), high cost otherwise.
- Placing a 物流桥 has a configurable cost (default moderate — prefer detour when short, prefer crossing when detour is long). Cost increases sharply for the 2nd bridge on the same logical path due to `BELT_CROSS_DELAY_001`.
- Pipe bridges have an analogous but lower default cost (no known latency penalty).
- Turns add small cost (prefer straight).
- Routing through occupied solid cells is forbidden unless a matching-layer bridge is inserted.

Support multi-net simultaneous routing (route N pairs together minimizing total cost + crossings), initially via sequential A* with rip-up-and-reroute when conflicts arise.

The router must be layer-aware: a fluid-port-to-fluid-port net routes on the fluid layer and only sees fluid-layer occupants; a solid net routes on the solid layer. Cross-layer obstacles (pipe splitters on the solid layer) are accounted for at cell-cost evaluation time.

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

### 5.4 Auxiliary tool — Device Editor (MVP private use)

A separate single-page tool, bundled in the same repo but served from a distinct route (e.g. `/device-editor`). Purpose: maintain the device library when game patches add or change devices.

**Audience:** owner only in v1. Not polished for community use; no onboarding flow needed. May open up in the future.

**Features:**

- Load the current version's `devices.json`.
- Grid-based visual editor for a single device: set footprint (W × H), click cells on the perimeter to define ports, set each port's `side`, `kind` (solid/fluid/power), and `direction_constraint`.
- Edit scalar fields: `power_draw`, `bandwidth`, `requires_power`, `has_fluid_interface`, `tech_prereq`, `category`, display names.
- Add/remove recipes on the device (select from the recipe catalog).
- Save back to `devices.json`. Schema-validate on save; reject invalid output.

**Non-features (v1 scope):**

- No import from game assets.
- No image-based recognition of device sprites.
- No recipe editor — recipes are scraped, not hand-edited. Only the device↔recipe association is editable here.
- No history / undo beyond browser-native form behavior.

**Implementation notes:**

- Reuse the main editor's Konva canvas component for the single-device grid view.
- Port definition is the same `io_ports` structure as the main tool; this tool is the primary way to populate it.
- File save uses the File System Access API (prompts for a folder) or download-as-file fallback.

*Acceptance:* Owner can add one new device (footprint, ports, recipes, scalars) end-to-end in under 5 minutes without editing JSON by hand. The resulting JSON passes schema validation and loads correctly in the main tool.

---

## 6. Key design decisions

### 6.1 Tech stack

- **Frontend:** TypeScript + React + **Konva.js** for the canvas (built-in hit detection, transformers, layers; good fit for the ghost-preview requirement). Tailwind for the non-canvas UI chrome.
- **Solver:** **glpk.js** (WASM GLPK) for the LP; the problem is small (< 100 variables) so a hand-rolled fractional solver is also acceptable. Do not introduce Python unless the solver grows beyond LP.
- **Belt simulation:** pure TypeScript, worker thread. Tick-based.
- **Fluid simulation:** pure TypeScript, worker thread. Uses glpk.js for the per-tick LP solve (reuses the solver dep).
- **Auto-router & placement:** pure TypeScript, worker thread.
- **Persistence:** LocalStorage for project list, IndexedDB for project blobs. Export/import as JSON files.
- **Distribution:** static site, deployable to GitHub Pages / Cloudflare Pages. No backend in v1.
- **Data pipeline:** `scripts/scrape-endwiki.ts` is a first-class build step. Runs on demand, commits generated JSON into `data/versions/<version>/`. Scraper caches raw HTML under `scripts/.cache/` so reruns don't re-hit `end.wiki`.

### 6.2 Data versioning

All device/recipe/item data lives in `data/versions/<version>/*.json`, generated by scraping `end.wiki` and augmented with hand-curated port data from the device editor. The project file records which version it was created under. The app bundles multiple versions and lets the user pick.

Schema for each JSON file is documented via JSON Schema in `data/schema/`. Every PR to the data directory is validated in CI against the schema.

**Scraper responsibilities:**

- Fetch the building index (`/zh-Hans/factory/buildings/`), extract all device slugs.
- Fetch each device page, extract: 建筑类型, 需要电力, 电力消耗, 带宽, 流体接口, 可拆除, 占地面积 (split `W×H×D` into fields), recipe table.
- Fetch the recipe index (`/zh-Hans/factory/recipes/`), extract all recipe slugs.
- Fetch each recipe page for canonical cycle times and input/output ratios.
- Cross-reference device→recipe and recipe→device.
- Fetch localized display names from the other language versions of each page (English, Japanese at minimum; more as bandwidth permits).
- Validate output against JSON Schema.
- **Preserve hand-curated port data** when re-scraping: if a device already has `io_ports` defined, the scraper must merge rather than overwrite.

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
      }
    },
    "fluid": {
      "allowed_without_component": false,
      "crossing_component_id": "pipe-bridge-1",
      "latency_penalty": null
    }
  },
  "bridge_port_constraint": "paired_opposite",
  "cross_layer_crossing": {
    "default": "allowed",
    "exceptions": [
      {
        "when": { "solid_occupant_category": "logistics_infrastructure" },
        "result": "forbidden",
        "reason_en": "Belt infrastructure (splitter / confluence / bridge) occupies both layers.",
        "reason_zh_hans": "传送带基础设施（分流器/汇流器/物流桥）占据双层。"
      },
      {
        "when": { "fluid_occupant_category": "pipe_infrastructure" },
        "result": "forbidden",
        "reason_en": "Pipe infrastructure (splitter / confluence / bridge / support) occupies both layers.",
        "reason_zh_hans": "管道基础设施（分流器/汇流器/管道桥/支架）占据双层。"
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

Reference scene: 100×100 grid, 200 devices, 500 belt/pipe segments combined.

- Editor stays at 60 fps when panning on the reference scene.
- **Ghost preview render** (during drag / drawing): within 16 ms per frame on the reference scene. This is a hard target — the ghost is the main user-facing feedback loop.
- DRC incremental update completes within 50 ms for a single edit.
- Full simulation of 10 minutes of sim-time completes within 2 seconds.
- Auto-router completes in under 1 second per net.
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
    editor/                     # Main canvas (Konva), palette, inspector, layer toggle, ghost preview
    device-editor/              # Auxiliary tool (§5.4)
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
- **Scraper for `end.wiki` implemented end-to-end**, producing populated `data/versions/1.2/` with all 69 devices (port data empty) + 74 recipes.
- Data schema validated in CI.
- CI runs lint + tests + schema validation on PR.

### Phase 1 — Solver MVP (weeks 2–3)

- F1 (data layer), F2 (solver).
- UI: a single-page form. Pick region, pick target output, enter rate, see solver result as a tree + BOM.
- Deliverable: standalone solver page. Useful on its own even without the editor.

### Phase 2 — Editor MVP (weeks 4–8)

- F3 (canvas with layer toggle and ghost preview), F4 (manual layout, plot resizing), F5 (DRC).
- **F-Device-Editor (§5.4)** built alongside to populate port data for the core ~20 devices.
- Integration with F2: user can drag solver-recommended machines from the solver panel onto the canvas.
- Both belt and pipe placement supported manually from day one.
- Deliverable: full manual design flow. Users can hand-design layouts and export a build checklist.

Note: one week longer than v2 estimate (4→5 weeks) to accommodate the device editor, the ghost-preview work, and port-data entry for the common devices.

### Phase 3 — Simulation (weeks 9–11)

- F6 (two-model simulator).
- Belt subsystem first (1 week), fluid subsystem second (1 week), coordinator third (1 week).
- Deliverable: user can press "Simulate" on any layout and see throughput / bottleneck analysis.

### Phase 4 — Routing and placement (weeks 12–15)

- F7 (layer-aware auto-router), F8 (placement optimizer with bridge-count penalty).
- Deliverable: user selects a set of machines, draws a bounding box, clicks "Place and route." Gets a DRC-clean layout back.

### Phase 5 — End-to-end generation (weeks 16–17)

- F9 (full pipeline).
- Deliverable: one-button "design me a factory for 6/min 高谷电池."

### Phase 6 — Polish (weeks 18+)

- F10, F11, F12 as time allows.
- Documentation site, video walkthrough, community onboarding.

---

## 9. Testing strategy

- **Unit tests** for every `core/` module. Aim for >85% line coverage on `core/`.
- **Golden tests** for the solver: for ~20 reference target recipes (sourced from community 毕业蓝图 posts), expected machine counts are stored as fixtures and checked on every commit.
- **Scraper golden tests:** a snapshot of scraped data is committed; scraper runs in CI against cached HTML and must produce byte-identical JSON.
- **Integration tests** that load a fixture layout, run DRC and sim, and assert on the results.
- **Fluid simulator validation:** at least 3 reference fluid layouts (from community 武陵 blueprints) with published throughput numbers, asserted to within 10%.
- **Visual regression tests** for the canvas via Playwright, using fixed seeds for anything random. Includes a specific test for ghost-preview responsiveness.
- **Manual QA checklist** per release, covering at least one full hand-designed layout per supported region.

---

## 10. Unresolved questions

Items the coder agent should **implement TODO hooks for, but not block on**. Each will be resolved by the project owner taking one or more screenshots / measurements in-game; until then the listed default applies.

### 10.1 Device port positions

**Status:** Unresolved for all 69 devices. `end.wiki` does not publish port positions as data.

**Default:** scraper produces devices with empty `io_ports`. Until populated, DRC treats any edge cell as a potential port.

**Resolution path:** owner uses the auxiliary device editor (§5.4) to define ports for the top ~20 devices during Phase 2. The long tail (combat devices, rare machines) can be deferred indefinitely.

### 10.2 Pipe-layer components that block belts — complete classification

**Status:** §4.5 lists confirmed blockers (管道分流器, 管道汇流器, pipe bridge, pipe supports). Some functional devices in the 储存 / 合成 / 功能 categories may or may not also block.

**Default:** all devices with `has_fluid_interface = true` block belts on their footprint (conservative). Straight pipe segments (not infrastructure) do not.

**Resolution path:** as port data is filled in via §5.4, owner marks each device's layer occupancy per cell.

### 10.3 Plot default sizes per region (main bases)

**Status:** sub-bases default to 50×50 (confirmed by owner). Main-base defaults unknown.

**Default:** main bases placeholder at 80×80 pending measurement. User can resize freely in GUI, so this only affects the starting view.

**Resolution path:** owner measures in-game and updates `regions.json`.

### 10.4 Power pole / repeater AoE — RESOLVED 2026-04

**Status:** Resolved by owner in-game measurement.

**Values (canonical, encoded in `data/versions/<v>/devices.json` via the `power_aoe` field):**

- 供电桩 `power-diffuser-1`: footprint 2×2, AoE = **12 cells per side** centered on the device.
- 息壤供电桩 `power-diffuser-2`: footprint 2×2, AoE = **12 cells per side** (same as base, despite the 武陵-tier label — the variant differs only in unlock requirement).
- 中继器 `power-pole-2`: footprint 3×3, pole-to-pole connectivity range = **7 cells per side** centered on the repeater. Does NOT supply power to devices.
- 息壤中继器 `power-pole-3`: footprint 3×3, range = **7 cells per side** (same as base).

**Schema:** `device.power_aoe = { kind: "square_centered", edge: number, purpose: "device_supply" | "pole_link" }`. `device_supply` poles are what POWER_001 checks; `pole_link` repeaters are connectivity-only.

**热能池 power_supply value** is still a separate gap — pursued via `scripts/import-endfield-calc.ts` (see `plan/DRC_REPORT.md` §3) before falling back to manual measurement.

### 10.5 Tech tree structure

**Status:** Tutorial pages describe the tech tree qualitatively (4 main columns: 加工, 发电, 传送带, 物流). No machine-readable dump exists publicly.

**Default:** hand-transcribe ~30 nodes into `tech_tree.json` based on the `end.wiki` tutorial page. One-time effort of ~2 hours. `TECH_001` DRC rule disabled until this is done.

**Resolution path:** transcribe from `https://end.wiki/zh-Hans/tutorials/factory/`.

### 10.6 Storage buffer semantics

**Status:** Machines have internal input/output buffers. Whether they hold "one full recipe's worth" or "item-by-item" affects simulator accuracy at the ~5% level, not correctness.

**Default:** assume each machine port has a 1-item (or 1-unit-fluid) buffer beyond the active recipe slot.

**Resolution path:** observe in-game by filling a belt and watching machine state transitions. Low priority.

### 10.7 汇流器 throughput anomaly

**Status:** One community source reports "管道汇流器 steals throughput" — possibly a bug or undocumented feature.

**Default:** model 汇流器 as lossless flow merge.

**Resolution path:** watch the referenced Bilibili video, or test in-game.

### 10.8 Third region (锦陇) data

**Status:** Mentioned in one community note; no systematic documentation.

**Default:** not included in v1 shipped regions. Add when owner has personal experience with it.

---

## 11. Blueprint code interop — permanently deferred

Reading/writing the in-game `EF01...` blueprint code is out of scope for all phases. Reasons reinforced by research:

- **Likely server-referenced, not self-contained.** Codes do not work across regional servers. If the code were a self-contained encoded payload, it would be portable.
- **No community tool has decoded the format** despite the game having been live for months and two active third-party tool projects (MaaEnd, ok-end-field). Both use vision-based UI automation rather than attempting to decode.
- **ToS risk.** Hypergryph's Fair Play Declaration prohibits "modification of game data" and "bypassing game mechanics."
- **Alternative exists.** Screenshot + vision extraction is a future possibility if user demand emerges, and it avoids the ToS boundary by treating game output as a visual image.

The tool's output is a human-executable build guide: screenshot + numbered build-order list + BOM.

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

### v3 (this document)

Owner clarifications incorporated:

- **§2 Scope:** 80m wire limit removed from the model (auto-connected inside AIC plots).
- **§4.5.1 Crossing components:** 物流桥 port constraint formalized as `paired_opposite` (input side locks opposite side as output; cross-axis configurations illegal). Pipe bridge added as a peer component with symmetric semantics. New `PORT_004` DRC rule.
- **§4.5.2 Cross-layer:** symmetry clarified — belt infrastructure also occupies both layers. New `LAYER_CROSS_002` DRC rule (was implicit).
- **§4.6 Power:** protocol core has no AoE (wireless supply to all poles in the plot). 供电桩 AoE is a **square**, not a circle. Dropped `POWER_002` (pole-outside-core AoE) since it no longer applies.
- **§4.7 Region / plot:** sub-base default = 50×50 confirmed. User can resize freely in GUI (arbitrary W × H). `plot_default_size` is a starting value, not a constraint.
- **§5.1 F3:** added live ghost preview as a mandatory feature with a 16ms performance target.
- **§5.1 F4.1:** new subsection on interactive plot resizing.
- **§5.4 Device Editor:** new auxiliary tool, MVP private use, built alongside Phase 2. Populates port data without code changes.
- **§8 Phased delivery:** Phase 2 extended from 4 to 5 weeks to absorb device editor + ghost preview work.
- **§10 Unresolved questions:** reduced from 11 to 8. Resolved: plot sizes (owner answered sub-base, main-base still placeholder), wire length (not applicable), port positions (now has a clear resolution path via §5.4), same-layer pipe rule (owner confirmed symmetric with belts).

### v2

- Two-model transport architecture (belts FIFO, pipes flow-network).
- `end.wiki` scraper as first-class build step.
- 物流桥 latency penalty modeled.
- Blueprint codec permanently deferred with research-backed reasoning.

### v1

- Initial draft.