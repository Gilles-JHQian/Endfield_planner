/** Cell occupancy queries for the editor.
 *
 *  REQUIREMENT.md §4.5: "Every grid Cell has two independent occupancy slots:
 *  solid_occupant and fluid_occupant." Most devices set BOTH slots; the three
 *  solid bridges (`belt-merger` / `belt-splitter` / `belt-cross-bridge`) set
 *  only the solid slot so fluid pipes can pass underneath (P4 v7).
 *
 *  Practical consequence the editor cares about: a belt path cannot pass
 *  through a cell where a device blocks the solid layer, and likewise for
 *  pipes on the fluid layer. A solid belt MAY share a cell with a solid
 *  bridge above an existing fluid pipe (the bridge sits on solid only).
 */
import { footprintCells } from './geometry.ts';
import { layerOccupancyOf } from '@core/drc/bridges.ts';
import type { Cell, Layer, Project } from './types.ts';
import type { Device } from '@core/data-loader/types.ts';

export type DeviceLookup = (device_id: string) => Device | undefined;

export interface OccupancyMap {
  /** Same-layer link cells (existing belts). */
  solid: Set<string>;
  /** Same-layer link cells (existing pipes). */
  fluid: Set<string>;
  /** Cells covered by a device whose footprint blocks the SOLID layer. */
  deviceSolid: Set<string>;
  /** Cells covered by a device whose footprint blocks the FLUID layer. */
  deviceFluid: Set<string>;
}

const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;

/** Build a single occupancy map of the project's current state. Cheap to
 *  rebuild on every edit (O(devices × footprint) + O(links × path length)).
 *  P4 v7: device footprints are partitioned per-layer via `layerOccupancyOf`
 *  so the asymmetric belt-bridge / fluid-pipe rule lands in ghost validation
 *  instead of only after-the-fact in DRC. */
export function buildOccupancy(project: Project, lookup: DeviceLookup): OccupancyMap {
  const occ: OccupancyMap = {
    solid: new Set(),
    fluid: new Set(),
    deviceSolid: new Set(),
    deviceFluid: new Set(),
  };

  for (const placed of project.devices) {
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    const layers = layerOccupancyOf(dev);
    for (const c of footprintCells(dev, placed)) {
      const k = cellKey(c);
      if (layers === 'solid' || layers === 'both') occ.deviceSolid.add(k);
      if (layers === 'fluid' || layers === 'both') occ.deviceFluid.add(k);
    }
  }
  for (const link of project.solid_links) {
    for (const c of link.path) occ.solid.add(cellKey(c));
  }
  for (const link of project.fluid_links) {
    for (const c of link.path) occ.fluid.add(cellKey(c));
  }
  return occ;
}

/** Is `cell` legal as an interior point of a fresh `layer` link path?
 *  Returns the reason it isn't (or null if it's free).
 *  - blocked by a device on the SAME layer (per-layer occupancy, P4 v7)
 *  - blocked by an existing same-layer link (DRC will flag a same-cell collision)
 *
 *  Cross-layer same-cell coexistence (belt + pipe) is allowed when neither
 *  side has a device blocker on this layer; the LAYER_CROSS DRC rules
 *  remain the authority on infrastructure-vs-link asymmetry. */
export function cellBlockedFor(
  cell: Cell,
  layer: Layer,
  occupancy: OccupancyMap,
): 'device' | 'same_layer' | null {
  const k = cellKey(cell);
  if (layer === 'solid') {
    if (occupancy.deviceSolid.has(k)) return 'device';
    if (occupancy.solid.has(k)) return 'same_layer';
  } else {
    if (occupancy.deviceFluid.has(k)) return 'device';
    if (occupancy.fluid.has(k)) return 'same_layer';
  }
  return null;
}

/** Direct query for "does any device block this cell on this layer?". Used by
 *  the device place-time ghost to decide whether a candidate footprint cell
 *  collides with another device's per-layer occupancy. */
export function cellBlockedByDevice(cell: Cell, layer: Layer, occupancy: OccupancyMap): boolean {
  const k = cellKey(cell);
  return layer === 'solid' ? occupancy.deviceSolid.has(k) : occupancy.deviceFluid.has(k);
}
