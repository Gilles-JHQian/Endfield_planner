/** Internal helpers shared by the edit functions in src/core/edits/.
 *  - DeviceLookup: indirection so edit functions can resolve catalog devices
 *    by id without taking the entire DataBundle as an argument.
 *  - Cell-occupancy and collision predicates over a Project's footprints.
 */
import { footprintCells } from '@core/domain/geometry.ts';
import type { Cell, PlacedDevice, Project } from '@core/domain/types.ts';
import type { Device } from '@core/data-loader/types.ts';

export type DeviceLookup = (device_id: string) => Device | undefined;

function key(c: Cell): string {
  return `${c.x.toString()},${c.y.toString()}`;
}

/** Build a Set<string> of every footprint-occupied cell in the project. The
 *  optional `excludeInstanceId` lets callers skip a specific device — useful
 *  for moveDevice/rotateDevice where the device's own current cells are
 *  legal targets. */
export function occupiedCellSet(
  project: Project,
  lookup: DeviceLookup,
  excludeInstanceId?: string,
): Set<string> {
  const set = new Set<string>();
  for (const placed of project.devices) {
    if (excludeInstanceId && placed.instance_id === excludeInstanceId) continue;
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    for (const c of footprintCells(dev, placed)) set.add(key(c));
  }
  return set;
}

/** Returns the first cell of `placed` that collides with the given occupied
 *  set, or null if there is no collision. */
export function findCollision(
  device: Device,
  placed: Pick<PlacedDevice, 'position' | 'rotation'>,
  occupied: Set<string>,
): Cell | null {
  for (const c of footprintCells(device, placed)) {
    if (occupied.has(key(c))) return c;
  }
  return null;
}

/** Find a placed device by instance id. */
export function findDevice(project: Project, instance_id: string): PlacedDevice | undefined {
  return project.devices.find((d) => d.instance_id === instance_id);
}
