/** Internal helpers shared by the edit functions in src/core/edits/.
 *  Cell-occupancy and collision predicates over a Project's footprints.
 *  DeviceLookup type lives in @core/domain/occupancy as the canonical home
 *  (it's needed by both the edits layer and the upcoming DRC engine).
 */
import { footprintCells } from '@core/domain/geometry.ts';
import { layerOccupancyOf } from '@core/drc/bridges.ts';
import type { Cell, PlacedDevice, Project } from '@core/domain/types.ts';
import type { DeviceLookup } from '@core/domain/occupancy.ts';
import type { Device } from '@core/data-loader/types.ts';

export type { DeviceLookup };

function key(c: Cell): string {
  return `${c.x.toString()},${c.y.toString()}`;
}

export interface OccupiedCellSets {
  /** Cells occupied by an existing device that blocks the SOLID layer. */
  readonly solid: Set<string>;
  /** Cells occupied by an existing device that blocks the FLUID layer. */
  readonly fluid: Set<string>;
}

/** Build per-layer Set<string> of every footprint-occupied cell. P4 v7:
 *  partitioned by `layerOccupancyOf(device)` so the editor's place-time
 *  collision check matches the asymmetric bridge / pipe rule (solid bridges
 *  only contribute to `solid`; fluid bridges + everything else contribute
 *  to both). The optional `excludeInstanceId` lets callers skip a specific
 *  device — useful for moveDevice/rotateDevice where the device's own
 *  current cells are legal targets. */
export function occupiedCellSet(
  project: Project,
  lookup: DeviceLookup,
  excludeInstanceId?: string,
): OccupiedCellSets {
  const out: OccupiedCellSets = { solid: new Set(), fluid: new Set() };
  for (const placed of project.devices) {
    if (excludeInstanceId && placed.instance_id === excludeInstanceId) continue;
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    const layers = layerOccupancyOf(dev);
    for (const c of footprintCells(dev, placed)) {
      const k = key(c);
      if (layers === 'solid' || layers === 'both') out.solid.add(k);
      if (layers === 'fluid' || layers === 'both') out.fluid.add(k);
    }
  }
  return out;
}

/** Returns the first cell of `placed` that collides with the existing
 *  per-layer occupancy on a layer the new device also blocks. P4 v7. */
export function findCollision(
  device: Device,
  placed: Pick<PlacedDevice, 'position' | 'rotation'>,
  occupied: OccupiedCellSets,
): Cell | null {
  const layers = layerOccupancyOf(device);
  const checkSolid = layers === 'solid' || layers === 'both';
  const checkFluid = layers === 'fluid' || layers === 'both';
  for (const c of footprintCells(device, placed)) {
    const k = key(c);
    if (checkSolid && occupied.solid.has(k)) return c;
    if (checkFluid && occupied.fluid.has(k)) return c;
  }
  return null;
}

/** Find a placed device by instance id. */
export function findDevice(project: Project, instance_id: string): PlacedDevice | undefined {
  return project.devices.find((d) => d.instance_id === instance_id);
}
