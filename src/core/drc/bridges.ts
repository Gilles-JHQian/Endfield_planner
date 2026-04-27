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

/** Per-device layer occupancy (P4 v7). REQUIREMENT.md §4.5 says devices
 *  default to occupying both layers — that stays the universal default.
 *  The three SOLID bridges (`belt-merger` / `belt-splitter` /
 *  `belt-cross-bridge`) are the documented exception: they sit only on
 *  the solid layer so fluid pipes can pass underneath (the asymmetric
 *  LAYER_CROSS_002 rule from v4 already enshrined this; v7 carries it
 *  through to placement-time ghost validation).
 *
 *  Used by `buildOccupancy` to populate the per-layer device sets and by
 *  the editor's ghost preview at placement time. */
export type LayerOccupancy = 'solid' | 'fluid' | 'both';

export function layerOccupancyOf(device: { id: string }): LayerOccupancy {
  if (SOLID_BRIDGE_IDS.has(device.id)) return 'solid';
  return 'both';
}
