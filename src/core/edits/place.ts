/** Device placement / move / rotate / delete edits. Each is a pure
 *  (project, ...) → Result<Project, EditError>; the original project is never
 *  mutated. All collision-checking edits take a `lookup: DeviceLookup` so
 *  they can resolve OTHER placed devices' footprints from the catalog.
 */
import { fitsInPlot } from '@core/domain/geometry.ts';
import { generateInstanceId } from '@core/domain/project.ts';
import { err, ok } from '@core/domain/types.ts';
import type { Cell, PlacedDevice, Project, Result, Rotation } from '@core/domain/types.ts';
import type { Device } from '@core/data-loader/types.ts';
import { findCollision, findDevice, occupiedCellSet, type DeviceLookup } from './utils.ts';

function bumpUpdatedAt(project: Project, patch: Partial<Project>): Project {
  return { ...project, ...patch, updated_at: new Date().toISOString() };
}

interface PlaceArgs {
  project: Project;
  device: Device;
  position: Cell;
  rotation?: Rotation;
  lookup: DeviceLookup;
  /** Used by tests to pin the generated instance id. */
  instance_id?: string;
}

export function placeDevice({
  project,
  device,
  position,
  rotation = 0,
  lookup,
  instance_id,
}: PlaceArgs): Result<{ project: Project; placed: PlacedDevice }> {
  const placed: PlacedDevice = {
    instance_id: instance_id ?? generateInstanceId('d'),
    device_id: device.id,
    position,
    rotation,
    recipe_id: null,
  };

  if (!fitsInPlot(device, placed, project.plot)) {
    return err(
      'out_of_bounds',
      `Device ${device.id} at (${position.x.toString()}, ${position.y.toString()}) would extend past the plot.`,
      { at: position },
    );
  }

  const occupied = occupiedCellSet(project, lookup);
  const collision = findCollision(device, placed, occupied);
  if (collision) {
    return err(
      'collision',
      `Device ${device.id} would overlap an existing device at (${collision.x.toString()}, ${collision.y.toString()}).`,
      { at: collision },
    );
  }

  return ok({
    project: bumpUpdatedAt(project, { devices: [...project.devices, placed] }),
    placed,
  });
}

export function moveDevice(
  project: Project,
  instance_id: string,
  newPosition: Cell,
  lookup: DeviceLookup,
): Result<Project> {
  const placed = findDevice(project, instance_id);
  if (!placed) return err('not_found', `No placed device with instance_id=${instance_id}.`);
  const device = lookup(placed.device_id);
  if (!device)
    return err(
      'not_found',
      `Catalog device ${placed.device_id} missing for instance ${instance_id}.`,
    );

  const moved: PlacedDevice = { ...placed, position: newPosition };
  if (!fitsInPlot(device, moved, project.plot)) {
    return err('out_of_bounds', `Move would push device ${device.id} past the plot.`, {
      at: newPosition,
    });
  }
  const occupied = occupiedCellSet(project, lookup, instance_id);
  const collision = findCollision(device, moved, occupied);
  if (collision) {
    return err(
      'collision',
      `Move would overlap an existing device at (${collision.x.toString()}, ${collision.y.toString()}).`,
      { at: collision },
    );
  }

  return ok(
    bumpUpdatedAt(project, {
      devices: project.devices.map((d) => (d.instance_id === instance_id ? moved : d)),
    }),
  );
}

const NEXT_ROTATION: Record<Rotation, Rotation> = { 0: 90, 90: 180, 180: 270, 270: 0 };

export function rotateDevice(
  project: Project,
  instance_id: string,
  lookup: DeviceLookup,
): Result<Project> {
  const placed = findDevice(project, instance_id);
  if (!placed) return err('not_found', `No placed device with instance_id=${instance_id}.`);
  const device = lookup(placed.device_id);
  if (!device) return err('not_found', `Catalog device ${placed.device_id} missing.`);

  const rotated: PlacedDevice = { ...placed, rotation: NEXT_ROTATION[placed.rotation] };
  if (!fitsInPlot(device, rotated, project.plot)) {
    return err('out_of_bounds', `Rotation would push device ${device.id} past the plot.`, {
      at: placed.position,
    });
  }
  const occupied = occupiedCellSet(project, lookup, instance_id);
  const collision = findCollision(device, rotated, occupied);
  if (collision) {
    return err(
      'collision',
      `Rotation would overlap an existing device at (${collision.x.toString()}, ${collision.y.toString()}).`,
      { at: collision },
    );
  }

  return ok(
    bumpUpdatedAt(project, {
      devices: project.devices.map((d) => (d.instance_id === instance_id ? rotated : d)),
    }),
  );
}

export function deleteDevice(project: Project, instance_id: string): Result<Project> {
  const exists = project.devices.some((d) => d.instance_id === instance_id);
  if (!exists) return err('not_found', `No placed device with instance_id=${instance_id}.`);

  // P4 v7: do NOT cascade-delete attached links. The owner often replaces a
  // device with a different one and wants the surrounding belts to stay in
  // place; PORT DRC rules surface the now-dangling refs as warnings until
  // re-attached. (Cascading also caused mixed F-delete batches to roll back
  // because delete_link on already-removed links errored as not_found.)
  return ok(
    bumpUpdatedAt(project, {
      devices: project.devices.filter((d) => d.instance_id !== instance_id),
    }),
  );
}
