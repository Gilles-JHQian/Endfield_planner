# Endfield EDA — Requirements & Implementation Plan (v3)

A design automation tool for the integrated industry system in *Arknights: Endfield* (《明日方舟：终末地》), modeled loosely on electronic design automation (EDA) tools from IC design. The target user is an experienced player who wants to design, validate, and iterate on factory layouts **outside the game**, then reproduce them in-game, instead of demolishing and rebuilding live bases every time the game updates or requirements change.

This document is the single source of truth for scope, priorities, and technical decisions. Read it end-to-end before starting work.

**Document version:** v7 — Phase 4 testing-feedback round #2 (on top of v6). Owner P4 v6 testing surfaced 14 items addressed as one bundle. Highlights: per-layer device occupancy (solid bridges no longer block fluid pipes; the asymmetric LAYER_CROSS_002 rule is enforced at place-time, not just by DRC); multi-port-per-cell direction matching (mergers / splitters with 4 ports on the same cell now wire correctly — drafter picks the port whose face matches the user's actual approach / departure direction); deleteDevice no longer cascade-deletes attached belts (belts persist with their PortRefs; PORT DRC rules surface dangling refs as warnings); right-click cancels the device place tool (symmetric with the v6 belt-tool cancel); device placement cursor anchored to the device's CENTER; placement ghost shows I/O port direction triangles; place-on-belt allowed when the device's port cell matches the belt's traversal direction (illegal cases turn the ghost red); drag-to-move highlighted devices with left-mouse-drag; R key batch-rotates the highlight around the selection centroid (new `move_rotate_device` core edit lands position + rotation atomically); clipboard payload now includes belts whose endpoints are both in the selection (PortRefs remapped to selection-relative item indices); rolling clipboard history with last 10 slots surfaced via a new "clipboard" tab in the Library / Rail; library cards render the device's actual SVG footprint + port markers; flatter / wider I/O port triangles; device-editor list-aside scroll fix. Changelog at the end of this document.

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
- `io_ports`: list of `{side, offset, kind, direction_constraint}`. **A port belongs to a face, not a cell** (P4 v5 clarification). `side` ∈ {N,E,S,W} identifies the face on the device's unrotated frame; `offset` is the cell index along that face (0-indexed). The same cell can host multiple ports if they sit on different faces — corner cells of multi-cell devices in particular may carry up to two ports (one per exposed face). Only **external** faces (cells on the perimeter) may host ports. `kind` ∈ {solid, fluid, power}. `direction_constraint` ∈ {input, output, bidirectional, paired_opposite} — see §4.5.1 for `paired_opposite`. **Belts and pipes must enter/exit a device through a port and travel in the direction the port faces** — a belt leaving an east-facing output port moves east; one leaving and immediately turning north is illegal.
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
- Modeled as: `SolidLink { layer: 'solid', tier: number, path: Cell[], src_port, dst_port }`. The `src` / `dst` PortRef fields are the **canonical** "what is connected where" representation (P4 v6); `src/core/domain/topology.ts` derives the inverse port→link index for callers that need the reverse view (auto-router, sim, DRC PORT_002). The belt drafter populates both whenever the start/end cells sit on declared ports; force-commits at empty cells leave the relevant end unset.
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

Every grid `Cell` has two independent occupancy slots: `solid_occupant` and `fluid_occupant`. A device footprint cell sets both slots by default; the three SOLID bridges (`belt-merger` / `belt-splitter` / `belt-cross-bridge`) are the documented exception and set ONLY the solid slot (P4 v7) so fluid pipes can pass underneath. Per-layer occupancy is encoded in `src/core/drc/bridges.ts::layerOccupancyOf(device)` and consumed by `buildOccupancy` + the editor's place-time ghost — the asymmetric LAYER_CROSS_002 rule that was DRC-only in v4–v6 now lands at placement validation as well.

#### 4.5.1 Same-layer collision is illegal without a dedicated crossing component

Both layers use the same crossing framework. Each layer ships **three** infrastructure devices (added in P3, see §10.9):

| Solid (kind=solid)   | Fluid (kind=fluid)   | Footprint | Ports |
|---|---|---|---|
| `belt-merger` 物流汇流桥 | `pipe-merger` 流体汇流桥 | 1×1 | 3 inputs (N/E/S) + 1 output (W) |
| `belt-splitter` 物流分流桥 | `pipe-splitter` 流体分流桥 | 1×1 | 1 input (W) + 3 outputs (N/E/S) |
| `belt-cross-bridge` 物流交叉桥 | `pipe-cross-bridge` 流体交叉桥 | 1×1 | 4 ports, two `paired_opposite` axes (N↔S, E↔W) |

Common geometry: every bridge is **1×1**; ports occupy all four sides; rotation rotates the port-side mapping (so a single device id covers all 4 orientations). All three are in `category: 'logistics'`.

**Dynamic active port set:** mergers and splitters interpret an unconnected port as **blocked**. So a 3-input merger with only 2 inputs attached behaves as a 2-input merger; the in-game throughput allocation is "counter-clockwise round-robin over the connected ports". DRC does not enforce a minimum connected-port count.

**Cross-bridge port constraint (`paired_opposite`):**

- The user decides which side is the input for each of the two paths when placing the component.
- Once one side of a path is marked as input, the **opposite side of that path is automatically locked as output**. Inputs and outputs are always on opposing sides of the same axis.
- Example legal configurations: `N→S, W→E`; `S→N, E→W`; `N→S, E→W`.
- Example illegal configurations: `N→E` (cross-axis), `N→S, E→N` (second path not opposite-paired).

`paired_opposite` is encoded as the `direction_constraint` on each cross-bridge port; PORT_004 enforces it. Mergers/splitters do not use `paired_opposite` — their port directions are fixed by the device record.

**物流桥 latency penalty (solid only):** community testing shows that a line passing through ≥ 2 cross-bridges suffers ~1-cell delay per 4 items (~25% throughput loss). ≥ 3 cross-bridges saturate at the 2-bridge level — no additional penalty. The simulator must model this; DRC's BELT_CROSS_DELAY_001 warns when a critical path crosses > 1 cross-bridge. The fluid cross-bridge does not have a documented equivalent penalty (pending in-game verification).

#### 4.5.2 Cross-layer coexistence — asymmetric (P3 update)

- **Main runs:** a straight belt and a straight pipe can share a cell (belt on solid layer, pipe on fluid layer).
- **Exception A — pipe infrastructure on a belt:** illegal. All pipe-side bridges (merger / splitter / cross-bridge) and pipe supports occupy *both* layers and block belts. (LAYER_CROSS_001.)
- **Exception B — belt infrastructure on a pipe:** **legal** for the three solid bridges (`belt-merger`, `belt-splitter`, `belt-cross-bridge`) — they only operate on the solid layer and let fluid pipes pass underneath. The asymmetry mirrors the in-game physical layout: fluid runs on the upper layer and solid bridges sit physically below. (LAYER_CROSS_002 was symmetric in v3; v4 narrows it.)
- **Exception C — device cells:** no transport link may enter a non-bridge device footprint cell except at a declared port.

These rules are encoded declaratively in `data/versions/<version>/crossing_rules.json` plus a `SOLID_BRIDGE_IDS` constant in the DRC layer; the rule engine consults both. Schema shown in §6.3.

### 4.6 Power model

- **Protocol core** has **no AoE**. The core wirelessly powers **every 供电桩 placed inside the core's build plot**, with no distance constraint.
- **供电桩** (power pole / diffuser, `power-diffuser-1`): footprint 2×2, placed anywhere inside the core's build plot. Each pole has its own **square** AoE around it (not circular); a device is considered powered when **any cell of its footprint** falls inside the AoE — partial overlap is enough (P4 v5 clarification, was "every cell" in v4). **AoE = 12 cells per side, centered on the pole's footprint center.** 息壤供电桩 (`power-diffuser-2`, 武陵-tier) has the **same** 12-cell AoE — the variant differs only in tech tier / unlock, not in range.
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

- Pan, zoom, and scroll. Middle-mouse drag = pan.
- Place devices from a palette, with rotation (R key) and mirroring. **Cursor anchored to the device's CENTER (P4 v7)** — for an N×N device the cursor sits in the center cell; for even sizes the cursor lands in the bottom-right of the centered footprint. **Right-click in the place tool cancels** (P4 v7, symmetric with belt/pipe-tool right-click cancel).
- **Right-mouse-button drives a "highlight" selection (P4 v6 split):** right-click on a device or belt adds it to the highlight set (visual brackets / halo + keyboard targets); right-mouse drag adds every device or belt fully inside the rectangle. Right-click on an empty cell clears the highlight only. Right-click context menu is disabled inside the canvas.
- **Inspector pin is a separate concept (P4 v6).** The right-column Inspector panel shows the device that was last left-clicked in the `select` tool — right-click never changes it. This lets owners highlight things to delete / rotate without losing their inspect-pin context.
- **Highlighted-device drag-move (P4 v7):** left-mousedown on a cell that's part of the highlight set + drag past one cell → the entire highlight set moves by `delta`. Plain click without drag still pins the Inspector. Mousedown on a non-highlighted cell skips drag tracking entirely.
- **Batch rotate around centroid (P4 v7):** R key with ≥ 1 device highlighted in the select tool rotates all of them 90° CW around the SELECTION centroid (each device's footprint also rotates). New `move_rotate_device` core edit lands position + rotation atomically so a partial collision rolls back the whole batch.
- F delete, Ctrl+C / Ctrl+V copy/paste. **Clipboard now includes belts (P4 v7)** whose endpoints both reference selected devices — paste re-resolves PortRefs to the new instance ids. **Rolling clipboard history (last 10 slots, memory-only)** surfaced via a new "clipboard" pseudo-tab in the Rail / Library; clicking a slot promotes it + arms paste mode (next left-click pastes at cursor, right-click / Esc cancels).
- **Belts and pipes are selectable** as a unit: single right-click on any cell of an existing link adds the link to the highlight set; right-mouse drag adds every link whose path is fully inside the rectangle (P4 v6). Delete removes every highlighted link AND device in one history snapshot. **`deleteDevice` no longer cascades to attached links (P4 v7)** — belts persist with their PortRefs; PORT DRC rules surface dangling refs as warnings.
- Undo / redo with unlimited history within a session. Group operations share a single history snapshot.
- Draw a solid belt or fluid pipe path **as a multi-segment polyline**. First click sets the start; each subsequent click commits a waypoint and starts a new segment from there. Drafting commits when:
  - the cursor lands on another device's input port of the matching `kind` (sets `dst` PortRef);
  - the cursor lands on the start cell (closes a loop);
  - **the cursor lands on the same cell as the previous click — force-commits the path as drawn** (P4 v5; lets owners end a belt at an empty cell);
  - Esc cancels the entire draft;
  - Backspace pops the last waypoint.
- Toggle between "solid layer", "fluid layer", and "power" view modes. In each non-power mode the other transport layer's paths are rendered dimmed.
- Edit placed devices' recipe selection inline.

**Keyboard shortcuts:** V = select; B / E = belt; P / Q = pipe (B/P preserved for muscle memory; Q/E added in P3 for one-hand reach); R = rotate ghost or selection; M = move selection; F / Delete = delete selection; Esc = cancel; Backspace = pop waypoint while drawing.

**Live ghost preview (mandatory):** while the user is drawing a belt or pipe, or has a device selected from the palette, the tool renders a **real-time ghost** of the placement at the current mouse position. The ghost updates every mouse-move event, shows the candidate path/footprint, and color-codes validity (green = valid, red = DRC violation, yellow = valid but sub-optimal). Performance budget: ghost render must complete within one frame (~16ms) at the performance targets in §6.5.

**Device placement ghost (P4 v7):**
- The ghost cursor anchors to the device's CENTER (not top-left). For 1×1 devices this is unchanged; 2×2 cursor at (5, 5) → ghost spans (4, 4)-(5, 5); 3×3 cursor at (5, 5) → (4, 4)-(6, 6).
- The ghost renders the same I/O port direction triangles as a placed device (extracted from `DeviceLayer::PortMarkers` and tinted with the status color). Owners see port directions before clicking.
- The ghost honors per-layer occupancy: a solid bridge (`belt-merger` / `belt-splitter` / `belt-cross-bridge`) ghosted over an existing fluid pipe stays GREEN — the bridge only blocks the solid layer. Dropping a `pipe-cross-bridge` onto a belt stays RED (pipe bridges block both layers).
- **Place-on-belt (P4 v7):** the ghost may overlap existing belts on the matching layer ONLY if every belt cell inside the device's footprint is a port cell with matching traversal direction. Specifically: the belt cell must be an interior cell of the belt (both prev + next exist), the device must declare an INPUT port at that cell whose face equals `-arrival_direction`, AND an OUTPUT port whose face equals `exit_direction`. When legal, the place commit bundles `place_device` + N `split_link` actions inside one applyMany — each affected belt is split at the device's port cell, with the two halves wired to the device's input/output ports. When illegal (no matching ports, multi-cell overlap, endpoint coverage) the ghost goes RED and the click is rejected.

**Belt routing (P4 v6 — auto-bridge truncation):** the ghost path planner does NOT detour around existing same-layer links. Instead, when the planned segment would cross an existing belt:
- **Perpendicular crossing** + cell free of any other device → the cell is tagged "auto-bridge" and shown as legal green in the ghost. On commit, an atomic `applyMany` transaction:
  1. Pre-generates an `instance_id` for the new cross-bridge.
  2. Emits `place_device` for the bridge with the pinned id (rotation 0).
  3. Emits `split_link` for the existing same-layer link covering the cell — the existing link's path is split at the bridge cell into two halves; the bridge cell is dropped from both halves; each half's inner endpoint (`left.dst` / `right.src`) is wired to the bridge's port on the side the existing belt enters / exits.
  4. The NEW link being committed is also broken into segments at every bridge cell; each segment becomes its own `add_link` with `src` / `dst` pointing at the adjacent bridge's port (or the original endpoints at the outer ends).
- **Parallel / corner overlap, or cell already hosts a non-bridge device** → ghost goes red and the next click is rejected (no waypoint added). Owners must back out (Backspace / Esc) and re-route.

The planner still detours around placed device cells (excluding the path's own port-cell endpoints).

**Forward-vs-side preference:** when computing the live segment from the last waypoint to the cursor, the planner classifies the cursor's position relative to the previous segment's heading via the interior angle at the waypoint vertex:
- 135°–180° (cursor is roughly forward of the heading): extend straight in the same axis first, then turn perpendicular toward the cursor;
- 0°–135° (cursor is to the side or behind): turn perpendicular first, then align;
- exactly 0° (cursor sits directly on the previous segment's reverse axis = would U-turn back along the path): ghost goes red, no waypoint can be placed.

**First-segment quadrant routing (P4 v6):** for the very first segment (no previous heading and no port lock), the planner picks the L-bend's leading axis by comparing `|dx|` vs `|dy|` from the start cell to the cursor — larger axis goes first. This matches the diagonal-quadrant mental model owners are used to from later segments. When the start cell sits on an output port, the port's `face_direction` overrides this choice (port lock wins).

**Port-direction enforcement (P4 v6 — both ends):** the start cell rule from v5 still applies — when a belt/pipe leaves a device through a declared output port, the first cell of the path after the device must lie in the direction the port faces. NEW in v6: the same rule applies at the destination — a belt arriving at an input port must arrive via the side opposite to the port's face. A belt approaching an east-facing input port from the south fails ghost validation (red, can't place).

**Belt drafting state machine (P4 v6 — explicit READY/PLACING):**
- `READY`: belt/pipe tool is active but no waypoints have been placed yet. A small dot follows the cursor; if the cursor sits on an output port matching the layer, the dot enlarges and tints (amber for solid, teal for fluid) to signal "this would commit a port-anchored start".
- `PLACING`: at least one waypoint has been placed; the in-progress draft renders as a dashed colored polyline with chevron arrows.
- Transitions:
  - READY + click → PLACING with the click cell as the first waypoint.
  - PLACING + click → commit-or-extend (existing logic).
  - PLACING + Esc / Backspace-to-empty → READY.
  - PLACING + **right-click** → READY (P4 v6 — was no-op in v5, leaving owners with only Esc as the abort path).

**Belt/pipe rendering (P4 v6 — rounded corners):** committed links are drawn as a wide translucent body fill + two thin parallel edge lines + periodic V-shaped flow arrows. At every corner cell the renderer inserts pre-bend and post-bend chamfer points (offset `CORNER_INSET = 0.3 cell` along each axis) and uses `lineJoin=round` on every stroke — corners read as a smooth arc instead of a sharp 90° miter. Auto-bridge cells get a small ⊕ badge. Solid uses amber; fluid uses teal.

**Port visualization (P4 v6 — flatter triangles):** placed devices render small inward-pointing triangles on input port faces and outward-pointing triangles on output port faces, color-coded by `kind` (amber = solid, teal = fluid, yellow = power). Triangle dimensions: `LEN = 0.22 cell` (halved from v5's 0.4) and `WING = 0.18 cell` so the base is wider than the height. Bidirectional / paired_opposite ports render as a small `0.18 cell` square instead.

**Power-coverage visualization:** any `requires_power=true` device that isn't covered by some 供电桩 AoE (no footprint cell inside any AoE — see §4.6) displays a small red "unplugged" badge in its top-right corner. While ghosting a power pole, the candidate AoE square is shown as a dashed outline and any existing devices that would fall inside are highlighted with a white shadow. The "power" view mode dims devices+links and overlays every placed pole's AoE (供电桩 = solid amber, 中继器 = dashed teal).

Visuals: top-down orthographic, same grid resolution as the game. Distinct visual treatment for solid vs fluid links (color + style). Device sprites can be simple colored rectangles with icons in v1.

*Acceptance:* User can recreate a published community blueprint (e.g. a small 高谷电池 production line) by hand in under 5 minutes. Ghost preview remains smooth (no perceptible lag) during rapid mouse movement on the reference scene from §6.5. Multi-segment drafting closes correctly when the second click hits a downstream input port. Box-select + group operations land as a single undoable transaction.

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
- `BELT_CROSS_001` (error): two solid links occupy the same cell with directions that are **perpendicular** but no `belt-cross-bridge` is placed at that cell. (P3: scope narrowed; the parallel case is covered by BELT_PARALLEL_001.)
- `BELT_PARALLEL_001` (error, **new in P3**): two solid links share a cell and both directions through that cell are parallel (same axis). This case has no bridge that can resolve it.
- `BELT_CORNER_001` (error, **new in P3**): a cell where one solid link turns (the cell sits between two non-collinear segments) is also visited by a second solid link. Cross-bridges only support straight-through perpendicular crossings, so corner overlaps have no resolution.
- `BELT_TAP_001` (error, **new in P3**): a solid link's endpoint sits on a non-endpoint cell of another solid link, unless the cell coincides with a `belt-merger` / `belt-splitter` / `belt-cross-bridge` port. Mid-belt taps without these bridges are illegal.
- `BELT_CROSS_DELAY_001` (warning): critical path crosses > 1 `belt-cross-bridge` — expected throughput reduced by ~25% per community measurement.

**Fluid-layer transport**
- `PIPE_001` (error): fluid throughput exceeds pipe tier cap.
- `PIPE_CROSS_001` (error): two fluid links occupy the same cell with perpendicular directions but no `pipe-cross-bridge` is placed at that cell. (Parallel/corner/tap variants apply symmetrically; the implementation may share the belt-* rule code via a layer parameter — tracked in §10.10.)

**Cross-layer**
- `LAYER_CROSS_001` (error): pipe infrastructure (`pipe-merger` / `pipe-splitter` / `pipe-cross-bridge` / pipe supports) overlaps a solid belt.
- `LAYER_CROSS_002` (error, **asymmetric in P3**): belt infrastructure overlaps a fluid pipe — but `belt-merger` / `belt-splitter` / `belt-cross-bridge` are exempt because they only operate on the solid layer. Other future solid-side infrastructure (e.g. lifters, belt supports) still triggers this rule.
- `LAYER_CROSS_003` (error): transport link enters a device footprint cell other than at a declared port.

**Region / tech**
- `REGION_001` (error): device placed outside plot bounds.
- `TECH_001` (warning): device used but its tech prereq is not unlocked in the project's tech profile.

**Storage**
- `STORAGE_001` (info): sink storage full — no drain configured.
- `STORAGE_PORT_001` (error, **new in P4 — registered as data-gated dormant**): a storage I/O port (仓库存货 / 取货口) does not have at least one footprint cell adjacent to a storage-line segment or pole (`storage-line-base` / `storage-line-source-pole`). The storage port can't transfer items into the line network and effectively does nothing. Skipped until owner declares the storage-line / storage-port device ids in the bundle.
- `STORAGE_LINE_001` (error, **new in P4 — registered as data-gated dormant**): a storage-line base segment is not directly or transitively connected (via adjacency) to any storage-line source pole. An orphaned base segment carries nothing. Computed as connected-component analysis over storage-line cells with poles as roots; segments outside any pole's component flag. Skipped until owner declares the storage-line device ids.

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

- Load the current version's `devices.json` plus a sibling `devices.scraped.json` baseline (mechanical scraper output, no owner edits).
- Horizontal category-tab strip + search filter on the device list (P3).
- Grid-based visual editor for a single device: set footprint (W × H), click cells on the perimeter to define ports, set each port's `side`, `kind` (solid/fluid/power), and `direction_constraint`. **1×1 devices** use a special edge-button layout so all four sides are addressable (otherwise the single cell would only resolve to one side).
- Edit scalar fields: `power_draw`, `bandwidth`, `requires_power`, `has_fluid_interface`, `tech_prereq`, `category`, display names.
- Add/remove recipes on the device (select from the recipe catalog).
- Save back to `devices.json`. Schema-validate on save; reject invalid output. **Two save paths** (P3):
  1. **Dev-mode middleware** (preferred during `pnpm dev`): POST to `/api/dev/devices` registered by a Vite plugin → atomic write to disk → no browser dialog.
  2. **File System Access API** fallback (production builds, non-Chromium browsers): `showSaveFilePicker` with handle persistence; if denied, blob download.
- **Per-device "Reset to scraped baseline"** (P3): if the loaded device exists in `devices.scraped.json`, show a diff and let the owner restore the scraped values for selected fields, while preserving owner-only fields (`io_ports`, `power_aoe`, additional locale display names).

**Non-features (v1 scope):**

- No import from game assets.
- No image-based recognition of device sprites.
- No recipe editor — recipes are scraped, not hand-edited. Only the device↔recipe association is editable here.
- No history / undo beyond browser-native form behavior.
- No per-device export / per-device import as standalone artifacts (deferred to a later round; see §11). The whole `devices.json` is the unit of save.

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

### 10.9 Multi-mode devices (P3)

**Status:** Some game devices have two operating modes (e.g. one mode produces item A, the other produces item B with a different cycle / power profile). The scraper currently flattens these to a single device record and concatenates whichever mode's recipes the wiki happens to list under that page; there is no mode discriminator in the data model.

**Default workaround:** owner uses the device editor to **clone** the device into two records with distinct ids (e.g. `<base>-mode-a`, `<base>-mode-b`), each carrying its own subset of `recipes` / `power_draw` / `cycle_seconds`. The scraper's `loadCuratedDevices` preservation logic keeps the clones across re-scrapes.

**Resolution path:** the next round may add an explicit `mode_id` field on Device + a UI toggle on placed instances; for now the clone-by-id workaround keeps the data layer and DRC simple.

### 10.10 Scraper baseline + per-device restore (P3)

**Status:** Owners regularly hand-edit `devices.json` (port geometry, AoE, display names, etc.). When a hand-edit goes wrong, there is no canonical "as-scraped" version to roll back to.

**Default:** the scraper writes a sibling `data/versions/<v>/devices.scraped.json` containing the mechanical pre-merge output of its parse pass. This file is checked into git and updated on every `pnpm scrape`. The device editor (§5.4) reads it via a separate code path and offers per-device restore with field-level diff. Owner-only fields (`io_ports`, `power_aoe`) are preserved across restore.

**Open:** parallel scraped baselines for `recipes.json` / `items.json` are deferred — owners do not currently hand-edit those files.

### 10.11 Belt parallel/corner/tap rule symmetry on the fluid layer (P3)

**Status:** The three new P3 belt rules (BELT_PARALLEL_001, BELT_CORNER_001, BELT_TAP_001) describe topology constraints that hold equally for fluid pipes. The implementation may either ship dedicated `pipe-*` analogues now or share rule code via a `Layer` parameter. The `requires_data` predicate would still need both belt and pipe bridge ids to resolve.

**Default:** ship the belt versions in P3-B13 first; promote to layer-parameterized rules in a follow-up if pipe-side false negatives become noticeable in practice.

### 10.12 Storage system device ids (P4)

**Status:** STORAGE_PORT_001 / STORAGE_LINE_001 (§5.5) need to know which device ids represent storage I/O ports vs. storage-line base segments vs. storage-line source poles. The end.wiki scrape doesn't tag them as a coherent family, and the owner hasn't enumerated the relevant ids yet (likely 仓库, 储仓 family + 仓库存取线基段 + 仓库存取线源桩).

**Default:** the two rules ship as data-gated dormants. Their `requires_data` declares missing `storage_line_devices` and `storage_port_devices` prereqs and the lint panel surfaces them as skipped. Once owner adds a `storage_line_role` field to relevant devices in `data/versions/<v>/devices.json` (one of `'port' | 'base' | 'pole'`), the rules light up.

**Resolution path:** owner enumerates the relevant device ids via the device editor (§5.4) and tags each device's `storage_line_role`. A new schema property is added in the same commit that flips the rules from dormant to live.

### 10.13 Auto-bridge insertion rollback semantics (P4)

**Status:** When the belt drafter commits a path that crosses an existing same-layer link perpendicular without a cross-bridge there, the commit transaction inserts the missing cross-bridge device + the link. If the user undoes the commit, both should disappear in one Ctrl+Z.

**Default:** uses `ProjectStore.applyMany` so the bridge + link land as one history snapshot. Undo wipes both. If a future feature lets owners manually pre-place a bridge that the drafter then "uses", undo of the link should NOT remove the manually-placed bridge — the drafter's commit logic must distinguish "we inserted this bridge ourselves" from "we found it pre-placed".

**Resolution path:** track the inserted bridge instance ids inside the same `applyMany` transaction; record nothing if a pre-existing bridge was reused.

---

## 11. Blueprint code interop — permanently deferred

Reading/writing the in-game `EF01...` blueprint code is out of scope for all phases. Reasons reinforced by research:

- **Likely server-referenced, not self-contained.** Codes do not work across regional servers. If the code were a self-contained encoded payload, it would be portable.
- **No community tool has decoded the format** despite the game having been live for months and two active third-party tool projects (MaaEnd, ok-end-field). Both use vision-based UI automation rather than attempting to decode.
- **ToS risk.** Hypergryph's Fair Play Declaration prohibits "modification of game data" and "bypassing game mechanics."
- **Alternative exists.** Screenshot + vision extraction is a future possibility if user demand emerges, and it avoids the ToS boundary by treating game output as a visual image.

The tool's output is a human-executable build guide: screenshot + numbered build-order list + BOM.

### 11.x Device editor — community-facing extensions (deferred to post-P3)

The P3 device editor is owner-only, with `devices.json` as the single save unit. The next round, when the tool is opened up to community use, should add:

- **Per-device export** as a standalone `*.device.json` artifact owners can share without bundling the whole catalog.
- **Per-device import** with conflict resolution against the loaded `devices.json`.
- **Custom device creation UI** — a "New device" affordance distinct from "edit existing", with id-collision check and a from-scratch port editor.
- **Plugin marketplace / device-pack manifests** — structured metadata so a community-maintained pack can be loaded as an overlay on the scraped baseline. Keep `data/versions/<v>/devices.json` as the canonical "shipped with this build" snapshot; packs layer on top.

These do not affect P3 scope and are documented here so the data layer choices in P3 don't accidentally close the door on them.

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

### v7.5 — belt self-cross + chained splits + RMB tool-mode unification (this document)

- **Self-crossing belts now place an auto-bridge.** `planSegments` accumulates the new path's own per-cell orientations as it walks the waypoints; subsequent segments see prior segments as if they were existing same-layer links. A perpendicular self-crossing → `bridgesToAutoPlace` includes the cell, identically to crossing an existing belt. Parallel/corner self-overlap still rejects as before.
- **Multiple crossings of the same existing belt now commit cleanly.** v7 emitted one `split_link` action per crossing, all targeting the original link id. The first split removed the original; the second silently rolled back the whole batch (`not_found`). v7.5 groups bridge cells by existing-link, sorts by path index, and chains the splits — each non-final split pins its right-half id (new optional `right_id` on the action / `ids` on `splitLink`) so the next split in the chain targets the previous right half. `splitLink` itself was already idempotent on `ids`; only the action plumbing + the commit-side chaining was new.
- **Right-click in any tool mode (place/belt/pipe) returns to select.** v7 had right-click in non-drafting belt/pipe mode silently doing the right-click highlight; users found this confusing. v7.5 unifies: right-click (single OR drag) in any tool mode = exit to select. Box-select is only available in the select tool.

### v7.4 — move-mode polish + cross-layer auto-bridge guard

Three small follow-ups on top of v7.3:

- **Move-mode collision check now covers belts.** v7.3 only flagged ghost device cells against existing per-layer device occupants. v7.4 also flags: ghost devices landing on existing same-layer belts, ghost belt path cells overlapping existing same-layer belts, and ghost belt path cells entering existing same-layer device footprints. Owners can no longer accidentally move a device on top of a belt.
- **Pipe auto-bridge over a solid belt is now red at ghost time.** The pipe-cross-bridge has `layerOccupancyOf == 'both'`, so dropping one over an existing solid belt would block that belt (LAYER_CROSS_001). v7.3 deferred this to DRC; v7.4 catches it during routing — the planner now consults a `crossBridgeBlocksOtherLayer` + `otherLayerOccupants` set built once per route context. Solid auto-bridges over fluid pipes still pass (the asymmetric §4.5.2 rule).
- **X key alternates with M for move mode.** The game's default move keybinding is M (top-row right side); X is on the left near WASD and easier to reach. Both behave identically.

### v7.3 — move mode + clipboard belts

Replaces the v7 left-mouse drag-move + standalone batch-rotate with a
proper move-mode interaction, fixing the rotation-drift + illegal
overlap-on-drag bugs and naturally including attached belts.

- **Move mode (M key).** With ≥1 highlighted device in the select tool, M enters move mode:
  - Snapshot of selected devices + attached links is computed (links = `selectedLinkIds` ∪ links whose both endpoints reference a selected device).
  - Snapshot is REMOVED from the project so collision checks against the rest are clean.
  - Pivot = bbox center of snapshot devices, floored to integer cell — fixed for the duration of move mode (4 R-presses always return the layout to its original state).
  - Cursor-following ghost: each device's footprint cells are rotated `rotationSteps` × 90° CW around the pivot, then translated by `(cursor - pivot)`. New top-left = min of new footprint cells; new rotation = original + steps × 90°. Belt paths rotated cell-by-cell.
  - Real-time collision check: any ghost cell that lands out-of-plot OR on an existing per-layer device occupant is tinted red; commit is blocked while red.
  - **Left click** commits at cursor + rotation if the ghost is green.
  - **Right click / M / Esc** cancels (restores snapshot at original positions).
  - **R** rotates 90° CW around the pivot (only inside move mode; the standalone R batch-rotate is removed).
- **Clipboard with belts (broader rule).** Ctrl+C now includes any link in `selectedLinkIds` PLUS any link whose both endpoints reference a selected device. PortRefs to devices outside the selection are stored as `undefined` indices; paste creates the new link with that end dangling instead of dropping the link entirely.
- **Drag-move removed.** The v7 left-mousedown-on-highlighted-cell drag is removed. Move mode is the only way to move multiple devices, which means owners can no longer accidentally stack devices onto belts (M-mode's real-time collision check catches it). Single-device tweaks are now: select → M → click target.

### v7.1 — bridge follow-ups

Patch round on top of v7 closing three owner-reported bridge bugs:

- **`splitLink` keeps `at_cell` in both halves.** v7's drop-cell semantics produced visible 1-cell gaps on each side of every auto-placed cross-bridge. Each split half now ends or starts AT the bridge cell so the rendered belt visually meets the bridge. `splitPathAtBridges` (used by the auto-bridge truncation flow for the new belt being committed) follows the same convention.
- **`setLinkEndpoint` core edit + `set_link_endpoint` action.** Allows updating a link's `src` or `dst` PortRef without touching the path. Used by the place-on-belt flow when the new device sits at one of the existing belt's endpoints — no split is needed, just retarget the dangling end.
- **`planPlaceOnBeltSplits` rewrite.** Now handles all three coverage cases: belt START → emit `set_link_endpoint` on src targeting the device's matching OUTPUT port; belt END → set_link_endpoint on dst targeting the matching INPUT port; interior → split (with at_cell kept). Port matching also accepts `paired_opposite` and `bidirectional` constraints (previously only `input`/`output`), unblocking cross-bridge endpoint placements.
- **Device-interior grace area in `routeForBelt`.** When the belt's FROM or TO cell sits inside a device footprint, the same-layer overlap check is skipped at that cell. The device's port system is the connectivity authority; multiple belts can legitimately converge on a merger/splitter cell. (Fixes "second belt to merger fails" symptom.)
- **Inspector `PORTS` section shows per-port link connections** (debug aid). Each row: `[index] [side] [dir glyph] [kind] [connected link id or —]`. Driven by `buildPortConnectivity`.

### v7

Phase 4 testing-feedback round #2 on top of v6, 14-item bundle from owner P4 v6 testing:

- **§4.5 Layer occupancy lifted into core.** Solid bridges (belt-merger / belt-splitter / belt-cross-bridge) declare `layer_occupancy: 'solid'`; everything else stays `'both'`. `Occupancy` partitioned into `{ deviceSolid, deviceFluid }`; ghost & place collision checks consult only the layers the new device blocks. Solid bridge over fluid pipe → green ghost; pipe-cross-bridge over solid belt → red.
- **§5.1 F3 editor — multi-port-per-cell direction matching.** 1×1 mergers / splitters declare 4 ports on the same cell; the drafter previously took the first match. New optional `departure` arg on `findOutputPortAtCell` symmetric with v6's `arrival`. The drafter plans unconstrained when the start cell has ≥ 2 output ports and resolves the actual port from `planned.path`'s first step. Same on the input side via `findInputPortAtCell`.
- **§5.1 F3 editor — device placement UX.** Cursor anchors to the device CENTER; right-click cancels the place tool; the ghost now shows the same I/O direction triangles as a placed device.
- **§5.1 F3 editor — place-on-belt with split.** When the device's footprint overlaps existing same-layer belts, the placement is allowed only if every belt cell inside the footprint is a port cell with matching direction; legal placements bundle `place_device` + N `split_link` actions atomically. Illegal placements turn the ghost red.
- **§5.1 F3 editor — drag-move + batch rotate.** Left-mousedown on a highlighted device + drag → all highlighted devices move; plain click without drag still pins the Inspector. R key with ≥ 1 highlighted device rotates the whole set 90° CW around the SELECTION centroid via the new `move_rotate_device` core edit.
- **§5.1 F3 editor — clipboard with belts.** ClipboardPayload gains a `links` field with selection-relative paths and PortRef indices remapped to item-array positions; `buildPayload` filters to links whose BOTH endpoints reference selected devices. Ctrl+V re-resolves PortRefs to fresh paste-time instance ids inside one applyMany.
- **Library / Rail — clipboard pseudo-tab.** Rail gains a 📋 tab; Library renders a slot list of the rolling 10-entry history (memory-only). Clicking a slot promotes it to the top and arms paste mode; the next left-click pastes at cursor. Right-click / Esc cancels.
- **Library cards render real device geometry.** New `DeviceThumb` SVG component shows footprint + I/O port triangles instead of the v6 first-letter glyph.
- **§5.1 F5 (deleteDevice) — no more cascading.** Removed the link-filter from `deleteDevice`. Belts persist with their PortRefs; PORT DRC rules surface dangling refs as warnings. Side-effect: the v6 mixed F-delete bug (rolled back when delete_device removed a belt that delete_link then couldn't find) is fixed.
- **Visual polish.** I/O port triangles flatter (LEN 0.22 → 0.18 cell, WING 0.18 → 0.26 cell). Device-editor list `<aside>` gains `flex h-full min-h-0 overflow-hidden` so the inner `flex-1 scroll-y` actually has a bounded height to scroll inside.

### v6

Phase 4 testing-feedback round on top of v5, eight-issue bundle from owner P4 v5 testing:

- **§5.1 F3 editor — selection model split:** right-click is now a pure "highlight" that drives the visual brackets and the F/R/Ctrl-C/V keyboard shortcuts; it no longer changes the Inspector pin. The Inspector pin is reserved for left-click in the `select` tool. Empty-cell right-click clears the highlight only. Belts and pipes are now also box-selectable — right-mouse-drag adds every link whose path is fully inside the rectangle. F/Delete deletes the highlighted devices AND links in one transaction.
- **§5.1 F3 editor — port-direction enforcement at both ends:** v5 only validated the source port; v6 also validates the destination — a belt arriving from a wrong side fails the ghost.
- **§5.1 F3 editor — first-segment quadrant routing:** v5 defaulted to horizontal-first when there was no prior heading; v6 picks the larger axis (|dx| vs |dy|) so the bend follows the cursor's diagonal quadrant.
- **§5.1 F3 editor — explicit READY/PLACING state machine:** READY shows a small cursor-following dot (enlarged on output ports); PLACING accepts right-click as cancel back to READY.
- **§5.1 F3 editor — auto-bridge truncation:** v5 placed the bridge but didn't split either belt; v6 splits both at the crossing cell and wires them to the bridge's ports via a new `split_link` core edit. Bundled in one applyMany so undo wipes everything.
- **§4.6 Power AoE:** the ghost preview's "covered devices" highlight now uses `cells.some` (matches the helper that's already correct); v5 left it as `cells.every`, which was the last consumer still on the v4 strict predicate.
- **§5.1 F3 editor — visual polish:** belt corners now use chamfer-inset points + `lineJoin=round` for soft arcs instead of sharp miters. Port direction triangles flattened (LEN 0.4 → 0.22 cell).
- **Domain model:** new `src/core/domain/topology.ts` with `buildPortConnectivity` (port→link reverse index) and `linkItem` (resolves the carried item via source device's recipe outputs). Belts now populate `Link.src` AND `Link.dst` PortRefs whenever the start/end cells sit on declared ports. The `place_device` action gains an optional `instance_id` so the auto-bridge flow can forward-reference bridge ids inside the same applyMany batch.

### v5

Phase 4 belt-routing + selection rewrite, driven by owner P3 testing feedback:

- **§4.1 Port model:** clarified that ports belong to *faces*, not whole cells. The same cell can host up to two ports if it sits at a corner (one per exposed face). Belts must enter/exit a device through a port AND travel in the direction the port faces — leaving an east-facing output port immediately northward is illegal.
- **§4.6 Power AoE:** coverage relaxed from "every footprint cell inside the AoE" to "any footprint cell inside the AoE". Devices straddling an AoE edge now count as powered.
- **§5.1 F3 editor — belt routing rewrite:** the ghost no longer detours around existing belts. Perpendicular crossings auto-place a `belt-cross-bridge` (or `pipe-cross-bridge`) on commit; parallel/corner overlap or a non-bridge device in the path goes red and rejects the next click. The live segment uses an interior-angle classification (forward / perpendicular / reverse) at the last waypoint to decide whether to continue along the heading or turn first. Clicking the same cell twice now force-commits the path. Port-direction is enforced during ghost validation.
- **§5.1 F3 editor — right-mouse-button selection:** right-click = single-select device or belt; right-mouse drag = box-select rectangle. The legacy X tool is removed. Belts and pipes are selectable as a unit (single-click selects the whole link) and deletable with Delete/F.
- **§5.1 F3 editor — belt rendering:** moves to per-cell rounded-corner segments + flow chevrons + auto-bridge badges, mirroring the visualization style of `enkad.enka.network`.
- **§5.1 F5 DRC:** added STORAGE_PORT_001 and STORAGE_LINE_001 as data-gated dormants (require owner-tagged storage device ids).
- **§10.12 / §10.13 Unresolved:** documented storage device-id enumeration gap and auto-bridge insertion rollback semantics.

### v4

Phase 3 polish round, driven by owner testing feedback on the P2 editor MVP:

- **§4.5.1 Logistics bridges:** formalized the **6-device family** (`belt-merger` / `belt-splitter` / `belt-cross-bridge` plus pipe analogues). All 1×1 with all four sides addressable as ports; rotation rotates the port-side mapping. Mergers/splitters treat unconnected ports as blocked (dynamic active-port count).
- **§4.5.2 Cross-layer asymmetry:** LAYER_CROSS_002 narrowed — solid bridges (`belt-merger` / `belt-splitter` / `belt-cross-bridge`) are now allowed to sit over fluid pipes. The reverse (fluid bridges over solid belts) remains forbidden via LAYER_CROSS_001.
- **§5.1 F3 editor UX:** multi-segment belt/pipe drafting (each click adds a waypoint, drafting ends only on input-port hit / start-cell close / Esc); Q/E shortcuts as aliases for B/P; box-select tool (X) with M/R/F/Ctrl+C/Ctrl+V group operations; ghost auto-routes around device cells via BFS; belts/pipes render with parallel edges + flow-direction arrows; power-coverage badge on uncovered devices; ghost AoE preview on power poles; POWER view-mode overlay.
- **§5.1 F5 DRC:** added BELT_PARALLEL_001 / BELT_CORNER_001 / BELT_TAP_001. BELT_CROSS_001 narrowed to perpendicular-only. POWER_002 demand restricted to AoE-covered devices.
- **§5.4 Device editor:** category tabs + scroll fix; dev-mode save via Vite middleware (no dialog); per-device "Reset to scraped baseline" with diff preview.
- **§10 Unresolved questions:** added 10.9 (multi-mode devices, clone workaround), 10.10 (scraped baseline + per-device restore), 10.11 (pipe-side parallel/corner/tap rule symmetry — deferred).
- **§11 Future work:** explicit list of community-facing device-editor extensions deferred from P3.

### v3

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