/** Logistics bridge device identifiers used across DRC rules.
 *
 *  These IDs are hand-authored devices defined in
 *  data/versions/<v>/devices.json (added in P3-B13). They participate in
 *  the rule layer in three places:
 *
 *  - SOLID_BRIDGE_IDS / FLUID_BRIDGE_IDS — full set of solid / fluid bridge
 *    devices on each layer. BELT_TAP_001 / PIPE_TAP_001 (when added) treat
 *    a tap landing on any bridge port cell as legal.
 *  - SOLID_CROSS_BRIDGE_ID / FLUID_CROSS_BRIDGE_ID — only the cross-bridge
 *    permits same-layer perpendicular crossings (BELT_CROSS_001).
 *  - LAYER_CROSS_002 exempts SOLID_BRIDGE_IDS from the "solid logistics
 *    over fluid pipe" prohibition (P3 asymmetric narrowing).
 *
 *  Centralizing the lists here keeps the per-rule files free of catalog
 *  knowledge and makes adding future bridge variants a single-file change.
 */

export const SOLID_BRIDGE_IDS: ReadonlySet<string> = new Set([
  'belt-merger',
  'belt-splitter',
  'belt-cross-bridge',
]);

export const FLUID_BRIDGE_IDS: ReadonlySet<string> = new Set([
  'pipe-merger',
  'pipe-splitter',
  'pipe-cross-bridge',
]);

export const SOLID_CROSS_BRIDGE_ID = 'belt-cross-bridge';
export const FLUID_CROSS_BRIDGE_ID = 'pipe-cross-bridge';
