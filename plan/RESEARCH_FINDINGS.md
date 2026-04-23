# Research findings — Endfield EDA open questions

This document addresses the open questions in §10 of `REQUIREMENTS.md` using publicly available community resources (game wikis, Gamersky/Gamekee/TapTap guides, Bilibili analysis videos, third-party tool repos). Every claim below is cited; uncited claims are explicit inferences marked as such. Confidence levels: **Confirmed** (multiple independent sources agree), **Likely** (one credible source, not contradicted), **Speculative** (inference, needs in-game verification).

---

## Summary of what changed vs. §10

| § | Original question | Status | Action |
|---|---|---|---|
| 10.1 | Cross-layer crossing rules | **Substantially answered** | Model belts and pipes as independent layers that coexist by default; the "crossing component" for same-layer belts exists (物流桥); fluid layer uses particle physics, not FIFO. |
| 10.2 | Belt tier throughputs | **Confirmed** | 30/min base belt; 60/min upgraded; fluid pipe baseline ≈ 120/min (2 units/sec). |
| 10.3 | Fluid pipe rules | **Confirmed with surprise** | Pipes carry **non-colliding particles with additive velocities** — not a FIFO queue. Must simulate differently from belts. |
| 10.4 | Storage / backpressure | **Partially answered** | Belt backpressure propagates; machines idle when output buffers fill; 物流桥 introduces latency. |
| 10.5 | Crossing component capacity | **Partially answered** | 物流桥 adds ~1 cell delay per 4 items after 2 bridges; flat cap beyond 2. |
| 10.6 | Recipe cycle times | **Resolved** | `end.wiki` has all 74 recipes with authoritative cycle-time data. Scraper the solution. |
| 10.7 | Tech tree data | **Resolved** | `end.wiki` has 69 devices with tech prereqs in structured form. |
| 10.8 | Localization | Product decision | Unchanged — no research needed. |

**Also resolved beyond §10:** the blueprint codec question. See §F below.

---

## A. Data sources worth using

### A.1 `end.wiki` — primary structured data source

`https://end.wiki/zh-Hans/factory/buildings/` lists all 69 devices, grouped by category (资源开采 6, 仓储存取 10, 基础生产 7, 合成制造 9, 电力供应 5, 功能设备 6, 战斗辅助 16, 种植调配 10). Each device has a stable URL slug (e.g. `miner-1`, `furnance-1`, `udpipe-loader-1`) and a structured page with the fields the EDA tool needs:

Example from `furnance-1` (精炼炉):

- 建筑类型: 基础生产
- 需要电力: 是
- 电力消耗: 5
- 带宽: 2
- 流体接口: 否
- 可拆除: 是
- 占地面积: 3×3×4
- 配方列表 (26 recipes, each with inputs / outputs / cycle time in seconds)

Companion page `https://end.wiki/zh-Hans/factory/recipes/` lists all 74 recipes independently. Site is multilingual (en / zh-Hans / zh-Hant / ja / ko / es / de / fr / ... 14 languages total), so i18n labels come "for free."

**Action for coder agent:** write a one-time scraper that dumps every building page and every recipe page into `data/versions/<version>/*.json` matching our schema. Re-run on each game patch. Cache HTML for reproducibility.

**Caveats:**

- The site is SPA-ish but individual pages render server-side enough to be scrape-friendly (confirmed by successful fetch of `furnance-1` returning full data).
- The `占地面积` field uses the format `W×H×D` (e.g. `3×3×4`). The third number is likely the visual model height/volume indicator — for our grid-based tool only the first two (W×H) matter. Confirm with a second device before committing.
- IO ports (where on the device perimeter each input/output sits, and which direction it faces) are **not** explicitly in text on `end.wiki`; they're in the device's icon/render. For the first cut, treat devices as axis-aligned rectangles and let the user place belts from any edge cell. Later, hand-curate port positions for the most common devices.

### A.2 Other tools in the ecosystem (for reference only)

- **终末地量化计算器** (`factory.ef.yituliu.cn/aef`) — an existing community throughput calculator. Covers the solver space. Good positioning signal: this solves a real need, and our tool would differentiate via the layout editor rather than the solver. Site is SPA, requires JS; no public API. Worth playing with before implementing F2.
- **终末地基质规划器** (`end.canmoe.com`, [github.com/cmyyx/endfield-essence-planner](https://github.com/cmyyx/endfield-essence-planner)) — basin-farming planner, orthogonal to factory design.
- **MaaEnd** ([github.com/MaaEnd/MaaEnd](https://github.com/MaaEnd/MaaEnd)) — AGPL-3.0 game automation tool using vision (MaaFramework) to drive the UI. Claims a "blueprint porter" that parses blueprint share codes from mixed text and batch-imports them. **Critically, it does not decode the blueprint code format itself; it uses visual UI automation.** This is strong evidence that the blueprint code format has not been publicly reverse-engineered.
- **ok-end-field** ([github.com/ok-oldking/ok-end-field](https://github.com/ok-oldking/ok-end-field)) — same category as MaaEnd, also UI-automation. Its README prominently cites Hypergryph's "Fair Play Declaration" warning against third-party tools. Useful for understanding the ToS boundary (see §F).

---

## B. Transport layer mechanics

### B.1 Two transport layers confirmed

The game has two physical transport systems:

- **Solid (belts, 传送带):** discrete items on a 1D FIFO-like path. Base tier = 30 items/min; upgrade tier in 四号谷地 and beyond = 60 items/min. "基础出货口出货量均为每两秒钟出一次货，即 30/分钟" ([Gamersky `产线出货速度解析`](https://www.gamersky.com/handbook/202601/2081425.shtml)).
- **Fluid (pipes, 管道 / 暗管):** continuous particle flow. In 武陵, pipe baseline flow rate is 2 units/sec = 120 units/min. "武陵的水管流速为2" ([17173 `水管铺设心得`](https://news.17173.com/content/02092026/115808117.shtml)).

### B.2 Layers are independent and do not mutually block

The `end.wiki` building classification explicitly distinguishes 流体接口 (fluid interface) as a separate device property. Pipes are placed on the fluid layer; belts on the solid layer. Community guides confirm pipes route freely above or alongside belts ("水管比起传送带要好不少，主要是速度是传送带的八倍"; "水管虽然跟传送带不在一个平面上，但是支架和各种分流不能跟传送带重叠，**管道本身也不能跟机器重叠**" — [Gamersky `工业开荒规划`](https://www.gamersky.com/handbook/202601/2080424.shtml)).

**Two important footnotes from this source:**

1. Pipe supports / junctions / splitters **cannot overlap belts**, even though the main pipe run can.
2. Pipes cannot overlap devices.

So the rule is: straight pipe segments are free to overlap with straight belt segments (layer-cross OK), but **pipe junctions / splitters / supports / vertical access points** occupy the solid layer as well and block belts.

### B.3 Same-layer crossing: the 物流桥 (logistics bridge)

Two belts cannot share a cell. 物流桥 is the dedicated component that lets one belt jump over another belt:

- Category: 物流 (logistics), unlocked in mid-tier tech.
- Function: routes one belt under / over another without mixing the two flows. Community tutorials consistently describe it as the solution to "两条输送线打架" (two conveyor lines fighting). See [Gamersky `仓库存取线综合` guide](https://www.gamersky.com/handbook/202601/2080481.shtml): "源矿和紫晶矿两条输送线容易打架，而且还没有物流桥，为了避免只能采用绕行的方法" (no bridge available → had to detour).
- **Latency cost:** "一条产线如果经过了两个物流桥就会约每四个产物造成一格延迟，但经过更多的物流桥疑似不会产生更多延迟了" ([Gamersky `工业开荒规划`](https://www.gamersky.com/handbook/202601/2080424.shtml)). I.e. N ≤ 1 bridge: no measurable delay; N ≥ 2 bridges: ~25% throughput degradation (1 slot/4 items of delay); N ≥ 3: saturates at the 2-bridge level. This is a real simulator concern — affects whether a nominal 6/min line actually delivers 6/min.

The 物流桥 implicit footprint is 1×1 (standard for a logistics connector), but this needs in-game verification — none of the guides stated it outright.

### B.4 The fluid layer has surprising physics

This is the most important single finding. Fluid in pipes is **not FIFO**. It is modeled as:

- Non-colliding particles. "终末地中的水流是无碰撞体积的粒子，因此速度可以简单地加和" ([17173 `水管铺设心得`](https://news.17173.com/content/02092026/115808117.shtml)).
- Per-pipe saturation cap at the tier's max rate (武陵 pipes cap at 2 units/sec).
- Merging / splitting flows **sums or divides velocities** rather than queuing.
- Reflux loops ("回流节点") can raise pressure up to the cap.
- "Trailing" artifacts exist: on entry into 暗管 from an empty state, a 2-unit inflow may only transport 1 unit initially, causing flow separation ([Bilibili BV1p9QCBoEvM `暗管用法`](https://www.bilibili.com/video/BV1p9QCBoEvM/)).

**Implication for the simulator (F6):** belts and pipes need **different** simulation models. Belts → tick-based FIFO queue per segment. Pipes → continuous-flow network with per-edge capacity constraints, solved as a max-flow or LP per sim-tick. Trying to unify these into one model will produce wrong results on either layer.

### B.5 Splitter mechanics (分流器)

- 1 input → up to 3 outputs.
- **Does not speed up flow.** Splits the single input's rate across outputs. Quote: "分流器会将一条传送带的产物分流至上限三条传送带，但注意的是物品通过不会加快，而是一条传送带的流动速度" ([Gamekee 分流器](https://www.gamekee.com/zmd/690588.html) — indexed excerpt).
- The pipe version (管道分流器) follows the particle-additive model, which enables community tricks like the "1/e splitter" (Bilibili BV1ScF7z1Eh5) and "irrational-ratio splitter."
- 汇流器 (confluence / merger) is the dual. At least one Bilibili source reports a **"管道汇流器 steals throughput"** bug / mechanic ([BV133ZsBNETz](https://www.bilibili.com/video/BV133ZsBNETz/)) — worth noting as a potential DRC warning once confirmed.

### B.6 Power distribution

All already in REQUIREMENTS.md §4.6, but now with specifics:

- Electric wire max length: **80 meters** per segment ([Gamekee 基础教程](https://www.gamekee.com/zmd/691227.html)). Beyond that, 中继器 (repeater) is required.
- 供电桩 (power pole / diffuser) has its own AoE around it; devices must be in a pole's AoE.
- Poles themselves must be in the core's AoE (or connected via repeaters/pole chains).
- 中继器 acts as a wire-length extender, not a power supplier.
- 息壤中继器 and 息壤供电桩 are the 武陵-tier upgrades.

---

## C. Offline simulation caveat

A known bug: "下线之后传送带的速度会下降，约为在线期间的 0.99 几倍" ([Bilibili BV133ZsBNETz]). Offline throughput ≠ online throughput. This is not the simulator's problem to reproduce — but the tool should document this so users don't think the simulator is wrong when they compare with overnight offline yield.

---

## D. Region differences

Two main regions as of the researched patches (through 1.2):

- **四号谷地 (Valley No. 4):** starter region. Belts at 30→60/min. No pipes in early tech. Recipes focus on 源石 / 蓝铁 / 紫晶 / 钢 production. Plot sizes and sub-bases per community screenshots are ~30×28 cells for a full 高谷电池 production line.
- **武陵 (Wuling):** second region, unlocked via main story. Introduces 管道 (pipes) at 120/min, 反应池 (reactor pool), 天有洪炉 (Tianyou Furnace), 息壤 (xirang) material class, 灌装机, 提纯机, plants 锦草 / 芽针 / 锦草 / etc. Pipe-heavy recipes are the defining mechanic here.
- **锦陇:** mentioned in community notes as a third region (["锦陇地区的据点主要是做药品"](https://www.gamersky.com/handbook/202601/2080424.shtml)). Less documented publicly as of research date. Should be placeholder in the data layer for now.

Region-specific: **blueprints do not transfer across servers** (Asian server's `EF01...` codes don't import on NA, per [网易云游戏 article](https://cg.163.com/static/content/69783599f1096b85d17be26f)).

---

## E. Device catalog — authoritative list as of research

Pulled from `end.wiki/factory/buildings/`:

### 资源开采 (6)
miner-1 便携源石矿机 · miner-2 电驱矿机 · miner-3 二型电驱矿机 · miner-4 水驱矿机 · pump-1 水泵 · pump-2 二型耐酸水泵

### 仓储存取 (10)
udpipe-unloader-1 暗管出口 · udpipe-loader-1 暗管入口 · udpipe-unloader-2 多口暗管出口 · udpipe-loader-2 多口暗管入口 · loader-1 仓库存货口 · unloader-1 仓库取货口 · log-hongs-bus 仓库存取线基段 · log-hongs-bus-source 仓库存取线源桩 · liquid-storager-1 储液罐 · storager-1 协议储存箱

### 基础生产 (7)
seedcollector-1 采种机 · liquid-cleaner-1 废水处理机 · grinder-1 粉碎机 · furnance-1 精炼炉 · component-mc-1 配件机 · shaper-1 塑形机 · planter-1 种植机

### 合成制造 (9)
dismantler-1 拆解机 · mix-pool-1 反应池 · mix-pool-2 扩容反应池 · tools-assebling-mc-1 封装机 · filling-powder-mc-1 灌装机 · liquid-purifier-1 提纯机 · xiranite-oven-1 天有洪炉 · thickener-1 研磨机 · winder-1 装备原件机

### 电力供应 (5)
power-diffuser-1 供电桩 · power-diffuser-2 息壤供电桩 · power-pole-2 中继器 · power-pole-3 息壤中继器 · power-station-1 热能池

### 功能设备 (6)
carrier-1 便捷存取站 · dumper-1 给水器 · travel-pole-1 滑索架 · travel-pole-2 长距滑索架 · marker-1 留言信标 · squirter-1 洒水机

### 战斗辅助 (16)
Out of scope for the EDA tool per REQUIREMENTS.md §2. Data should still be scraped (one-time cost is trivial and future-proofs against scope expansion) but hidden behind a feature flag in the UI palette.

### 种植调配 (10)
soil-moss-1/2/3 荞花/柑实/砂叶 · soil-grass-1/2 锦草/芽针 · soil-sp-1/2/3/4 灰芦麦/苦叶椒/琼叶参/金石稻 · soil-bbflower-1 酮化灌木

---

## F. Blueprint code (`EF01...`) — status update

Initial §11 in REQUIREMENTS marked this as deferred. Research confirms that decision and adds specifics:

### F.1 Format observations (from share codes in community guides)

- **Prefix:** codes use `EF01` uppercase prefix in release version; test versions used `cbt3ef` lowercase prefix.
- **Alphabet:** mixed case Latin + digits, with documented OCR-hostile pairs ("注意 `o`/`0` 和 `l`/`i` 的区分" — [网易云游戏 blueprint guide](https://cg.163.com/static/content/69783599f1096b85d17be26f)). This is consistent with a base32/base58 or custom-alphabet encoding.
- **Length:** ~18–22 characters for small module blueprints; longer blueprints are unclear — likely chunked or referenced server-side.
- **Cross-server invalidity:** codes generated on one regional server cannot be imported on another. This strongly implies **server-side state** (the code is an opaque ID that indexes into a server-stored blueprint blob, not a self-contained encoded payload).

### F.2 Community tooling status

Neither MaaEnd nor ok-end-field decodes the blueprint code format. Both use vision-based UI automation. This, combined with the cross-server invalidity signal above, strongly suggests the code is **not client-decodable** — at minimum it requires a server round-trip.

### F.3 ToS stance

Hypergryph's [Fair Play Declaration](https://github.com/ok-oldking/ok-end-field#readme), cited in both third-party tools' READMEs, prohibits "third-party tools that damage the game experience" including "auto-play, skill acceleration, invincibility, teleportation, **modification of game data or files**." A pure offline design tool that **never communicates with game servers** and **does not modify save files** is unlikely to fall under this — but attempting to decode/encode blueprint codes for write-back might. The conservative stance in REQUIREMENTS.md §11 stands: **do not implement blueprint codec in any phase**. Output only human-executable build guides.

### F.4 Alternative: visual blueprint extraction

If users want "import existing in-game design," the realistic path is the same one MaaEnd uses — screenshot + vision model extracts device positions and connections. Out of scope for this project's MVP; could be a future plugin.

---

## G. Things still unknown (good-enough-to-start list)

Remaining unknowns that the coder agent should implement TODO hooks for, but should **not block on**:

1. **Exact 物流桥 footprint and port geometry.** Assumed 1×1 with two orthogonal through-ports. Verify in-game with a single screenshot.
2. **Exact pipe-junction / splitter cell footprints that block belts.** Assumed splitters and junctions occupy the solid layer cell they sit on; straight pipe segments do not. Verify.
3. **Plot dimensions per region.** Community screenshots suggest 四号谷地 main base is ~30×30 cells. No authoritative source gives exact bounds. Expose as a config file (`data/versions/<version>/regions.json`) with placeholder values and a note that they must be measured in-game.
4. **Core / sub-core AoE radii.** Mentioned as "固定作用范围" in official new-player guide but no number given. Config placeholder, measure in-game.
5. **Power-pole AoE radius.** Same as above.
6. **Wire max length 80m** is confirmed, but the conversion from meters to grid cells depends on world scale. Assume 1 cell = 1m as a starting point (matches the visual scale in screenshots).
7. **Tech tree structure and prerequisites.** `end.wiki` tutorial pages describe it prose-style; a clean machine-readable version does not appear to exist. Either transcribe manually (small one-time effort given ~30 nodes) or defer tech-gating DRC until the data is collected.

---

## H. Updated recommendation for REQUIREMENTS.md

Propose these edits:

- **§4.4 Transport links** — Amend to note that fluid layer is particle-continuous, not FIFO; update `Link` type to support both models via a tagged union.
- **§4.5 Crossings** — Major revision. Drop the "cell has two slots" abstraction in favor of three cases: (a) same-layer collision (illegal without crossing component), (b) cross-layer between main-run belt/pipe (legal), (c) cross-layer where the fluid side is a junction/splitter (illegal). Update `CROSS_001` / `CROSS_002` rules accordingly.
- **§6.3 Crossing rule table** — Can now be filled with the specific rules above, not left as TODO. Add `BELT_CROSS_DELAY_001` as a new performance-warning rule ("line crosses more than 1 logistics bridge → expected throughput reduced ~25%").
- **§6.1 Tech stack** — Add: "Data is scraped from end.wiki, not hand-written. `scripts/scrape-endwiki.ts` is a first-class build step."
- **§10 Open questions** — Replace with the much shorter list in §G above.
- **New §F (Simulation strategy)** — Call out the two-model approach explicitly: belts are FIFO queues, pipes are flow networks. Don't unify.