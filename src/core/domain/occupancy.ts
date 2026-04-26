/** Cell occupancy queries for the editor.
 *
 *  REQUIREMENT.md §4.5: "Every grid Cell has two independent occupancy slots:
 *  solid_occupant and fluid_occupant. A device footprint cell sets BOTH slots
 *  (devices occupy both layers at their location unless specifically marked
 *  otherwise)."
 *
 *  Practical consequence the editor cares about: a belt path cannot pass
 *  through a device's footprint cell, and neither can a pipe path —
 *  regardless of which layer is being drawn. Belt and pipe MAY share a cell
 *  with each other on different layers (per §4.5.2), but never with a
 *  device's body.
 */
import { footprintCells } from './geometry.ts';
import type { Cell, Layer, Project } from './types.ts';
import type { Device } from '@core/data-loader/types.ts';

export type DeviceLookup = (device_id: string) => Device | undefined;

interface OccupancyMap {
  solid: Set<string>;
  fluid: Set<string>;
  /** Cells covered by a device footprint — blocked on BOTH layers. */
  device: Set<string>;
}

const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;

/** Build a single occupancy map of the project's current state. Cheap to
 *  rebuild on every edit (O(devices × footprint) + O(links × path length)). */
export function buildOccupancy(project: Project, lookup: DeviceLookup): OccupancyMap {
  const occ: OccupancyMap = { solid: new Set(), fluid: new Set(), device: new Set() };

  for (const placed of project.devices) {
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    for (const c of footprintCells(dev, placed)) occ.device.add(cellKey(c));
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
 *  - blocked by a device on either layer (devices occupy both slots)
 *  - blocked by an existing same-layer link (DRC will flag a same-cell collision)
 *
 *  Cross-layer same-cell coexistence (belt + pipe) IS allowed here; the strict
 *  check that pipe INFRASTRUCTURE (splitters/bridges/supports) blocks belts on
 *  the other layer is DRC's job (LAYER_CROSS_001/002), not basic occupancy.
 */
export function cellBlockedFor(
  cell: Cell,
  layer: Layer,
  occupancy: OccupancyMap,
): 'device' | 'same_layer' | null {
  const k = cellKey(cell);
  if (occupancy.device.has(k)) return 'device';
  if (layer === 'solid' && occupancy.solid.has(k)) return 'same_layer';
  if (layer === 'fluid' && occupancy.fluid.has(k)) return 'same_layer';
  return null;
}
