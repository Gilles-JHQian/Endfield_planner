/** Rotation-aware geometry for placed devices.
 *
 *  REQUIREMENT.md §6.4: rotation is clockwise; ports are stored in the
 *  device's unrotated frame. These helpers transform footprint cells and
 *  port positions to world coordinates.
 */
import type { Cell, Direction, PlacedDevice, Rotation } from './types.ts';
import type { Device, Port } from '@core/data-loader/types.ts';

const SIDES_CW: readonly Direction[] = ['N', 'E', 'S', 'W'];

/** The bounding box of `device` after rotation, in cells. Rotations of 90/270
 *  swap width/height; 0/180 keep them. */
export function rotatedBoundingBox(
  device: Pick<Device, 'footprint'>,
  rotation: Rotation,
): { width: number; height: number } {
  const { width: w, height: h } = device.footprint;
  if (rotation === 90 || rotation === 270) return { width: h, height: w };
  return { width: w, height: h };
}

/** Map a local (lx, ly) cell in the unrotated footprint to a local cell in the
 *  rotated frame. Both are 0-indexed against the (rotated or unrotated) bbox. */
function rotateLocal(lx: number, ly: number, w: number, h: number, rotation: Rotation): Cell {
  switch (rotation) {
    case 0:
      return { x: lx, y: ly };
    case 90:
      return { x: h - 1 - ly, y: lx };
    case 180:
      return { x: w - 1 - lx, y: h - 1 - ly };
    case 270:
      return { x: ly, y: w - 1 - lx };
  }
}

/** Rotate a side direction clockwise by `rotation` degrees. */
export function rotateSide(side: Direction, rotation: Rotation): Direction {
  const steps = rotation / 90; // 0|1|2|3
  const idx = SIDES_CW.indexOf(side);
  return SIDES_CW[(idx + steps) % 4]!;
}

/** All world-frame cells covered by a placed device's footprint. */
export function footprintCells(
  device: Pick<Device, 'footprint'>,
  placed: Pick<PlacedDevice, 'position' | 'rotation'>,
): Cell[] {
  const { width: w, height: h } = device.footprint;
  const cells: Cell[] = [];
  for (let ly = 0; ly < h; ly++) {
    for (let lx = 0; lx < w; lx++) {
      const r = rotateLocal(lx, ly, w, h, placed.rotation);
      cells.push({ x: placed.position.x + r.x, y: placed.position.y + r.y });
    }
  }
  return cells;
}

/** Which local cell does an unrotated port (side, offset) sit on? */
function portLocalCell(port: Pick<Port, 'side' | 'offset'>, w: number, h: number): Cell {
  switch (port.side) {
    case 'N':
      return { x: port.offset, y: 0 };
    case 'S':
      return { x: port.offset, y: h - 1 };
    case 'W':
      return { x: 0, y: port.offset };
    case 'E':
      return { x: w - 1, y: port.offset };
  }
}

export interface WorldPort {
  /** Index into `device.io_ports` so callers can dereference back to the catalog. */
  readonly port_index: number;
  /** World cell occupied by the port (within the device footprint). */
  readonly cell: Cell;
  /** Direction the port faces in world coords (post-rotation). */
  readonly side: Direction;
  readonly kind: Port['kind'];
  readonly direction_constraint: Port['direction_constraint'];
}

/** All ports of a placed device in world coordinates. Returns empty if the
 *  device has no `io_ports` defined yet (the §10.1 "ports unknown" case). */
export function portsInWorldFrame(
  device: Pick<Device, 'footprint' | 'io_ports'>,
  placed: Pick<PlacedDevice, 'position' | 'rotation'>,
): WorldPort[] {
  const { width: w, height: h } = device.footprint;
  return device.io_ports.map((port, port_index) => {
    const local = portLocalCell(port, w, h);
    const rotated = rotateLocal(local.x, local.y, w, h, placed.rotation);
    return {
      port_index,
      cell: { x: placed.position.x + rotated.x, y: placed.position.y + rotated.y },
      side: rotateSide(port.side, placed.rotation),
      kind: port.kind,
      direction_constraint: port.direction_constraint,
    };
  });
}

/** True if [position, position + rotated bbox) lies entirely inside [0, plot). */
export function fitsInPlot(
  device: Pick<Device, 'footprint'>,
  placed: Pick<PlacedDevice, 'position' | 'rotation'>,
  plot: { width: number; height: number },
): boolean {
  if (placed.position.x < 0 || placed.position.y < 0) return false;
  const bbox = rotatedBoundingBox(device, placed.rotation);
  return (
    placed.position.x + bbox.width <= plot.width && placed.position.y + bbox.height <= plot.height
  );
}
