import { describe, expect, it } from 'vitest';
import {
  fitsInPlot,
  footprintCells,
  portsInWorldFrame,
  rotateSide,
  rotatedBoundingBox,
} from './geometry.ts';
import type { Device, Port } from '@core/data-loader/types.ts';

const DEV_2x3 = mk({ width: 2, height: 3 }, []);
const DEV_2x3_PORTS: Device = mk({ width: 2, height: 3 }, [
  { side: 'N', offset: 0, kind: 'solid', direction_constraint: 'input' },
  { side: 'E', offset: 1, kind: 'fluid', direction_constraint: 'output' },
  { side: 'S', offset: 1, kind: 'solid', direction_constraint: 'output' },
  { side: 'W', offset: 2, kind: 'power', direction_constraint: 'bidirectional' },
]);

describe('rotatedBoundingBox', () => {
  it('keeps W×H at 0° and 180°', () => {
    expect(rotatedBoundingBox(DEV_2x3, 0)).toEqual({ width: 2, height: 3 });
    expect(rotatedBoundingBox(DEV_2x3, 180)).toEqual({ width: 2, height: 3 });
  });

  it('swaps to H×W at 90° and 270°', () => {
    expect(rotatedBoundingBox(DEV_2x3, 90)).toEqual({ width: 3, height: 2 });
    expect(rotatedBoundingBox(DEV_2x3, 270)).toEqual({ width: 3, height: 2 });
  });
});

describe('rotateSide (clockwise)', () => {
  it('cycles N→E→S→W→N at 90°', () => {
    expect(rotateSide('N', 90)).toBe('E');
    expect(rotateSide('E', 90)).toBe('S');
    expect(rotateSide('S', 90)).toBe('W');
    expect(rotateSide('W', 90)).toBe('N');
  });
  it('cycles 180° and 270° correctly', () => {
    expect(rotateSide('N', 180)).toBe('S');
    expect(rotateSide('N', 270)).toBe('W');
  });
  it('is identity at 0°', () => {
    for (const s of ['N', 'E', 'S', 'W'] as const) expect(rotateSide(s, 0)).toBe(s);
  });
});

describe('footprintCells', () => {
  it('lists all W×H cells at 0° starting from position', () => {
    const cells = footprintCells(DEV_2x3, { position: { x: 5, y: 7 }, rotation: 0 });
    expect(cells).toHaveLength(6);
    expect(cells).toContainEqual({ x: 5, y: 7 });
    expect(cells).toContainEqual({ x: 6, y: 9 });
  });

  it('produces an H×W bounding region at 90°', () => {
    const cells = footprintCells(DEV_2x3, { position: { x: 0, y: 0 }, rotation: 90 });
    // Rotated bbox is 3 wide × 2 tall.
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    expect(Math.max(...xs)).toBe(2);
    expect(Math.max(...ys)).toBe(1);
    expect(cells).toHaveLength(6);
  });
});

describe('portsInWorldFrame', () => {
  it('returns ports unchanged at 0°', () => {
    const ports = portsInWorldFrame(DEV_2x3_PORTS, { position: { x: 0, y: 0 }, rotation: 0 });
    // N port at offset 0 → (0, 0) facing N.
    expect(ports[0]).toMatchObject({ port_index: 0, cell: { x: 0, y: 0 }, side: 'N' });
    // E port at offset 1 → (W-1=1, 1) facing E.
    expect(ports[1]).toMatchObject({ port_index: 1, cell: { x: 1, y: 1 }, side: 'E' });
    // S port at offset 1 → (1, H-1=2) facing S.
    expect(ports[2]).toMatchObject({ port_index: 2, cell: { x: 1, y: 2 }, side: 'S' });
    // W port at offset 2 → (0, 2) facing W.
    expect(ports[3]).toMatchObject({ port_index: 3, cell: { x: 0, y: 2 }, side: 'W' });
  });

  it('rotates port sides 90° CW (N→E)', () => {
    const ports = portsInWorldFrame(DEV_2x3_PORTS, { position: { x: 0, y: 0 }, rotation: 90 });
    // The N port at unrotated (0,0) — after 90° CW rotation, it's at (H-1=2, 0) facing E.
    expect(ports[0]?.side).toBe('E');
    expect(ports[0]?.cell).toEqual({ x: 2, y: 0 });
  });

  it('preserves port kind and direction_constraint across rotation', () => {
    const ports = portsInWorldFrame(DEV_2x3_PORTS, { position: { x: 4, y: 4 }, rotation: 180 });
    expect(ports[1]?.kind).toBe('fluid');
    expect(ports[3]?.direction_constraint).toBe('bidirectional');
  });

  it('returns empty array when device has no io_ports', () => {
    const ports = portsInWorldFrame(DEV_2x3, { position: { x: 0, y: 0 }, rotation: 0 });
    expect(ports).toEqual([]);
  });

  it('exposes face_direction matching the post-rotation side (P4 v5)', () => {
    const ports = portsInWorldFrame(DEV_2x3_PORTS, { position: { x: 0, y: 0 }, rotation: 0 });
    // N port → faces north → (0, -1)
    expect(ports[0]?.face_direction).toEqual({ dx: 0, dy: -1 });
    // E port → (1, 0)
    expect(ports[1]?.face_direction).toEqual({ dx: 1, dy: 0 });
    // S port → (0, 1)
    expect(ports[2]?.face_direction).toEqual({ dx: 0, dy: 1 });
    // W port → (-1, 0)
    expect(ports[3]?.face_direction).toEqual({ dx: -1, dy: 0 });
  });

  it('rotates face_direction with the device (90° CW: north port → east face)', () => {
    const ports = portsInWorldFrame(DEV_2x3_PORTS, { position: { x: 4, y: 4 }, rotation: 90 });
    // The original N port now faces E after a 90° rotation.
    expect(ports[0]?.face_direction).toEqual({ dx: 1, dy: 0 });
  });
});

describe('fitsInPlot', () => {
  const plot = { width: 10, height: 10 };

  it('accepts in-bounds placement', () => {
    expect(fitsInPlot(DEV_2x3, { position: { x: 0, y: 0 }, rotation: 0 }, plot)).toBe(true);
    expect(fitsInPlot(DEV_2x3, { position: { x: 8, y: 7 }, rotation: 0 }, plot)).toBe(true);
  });

  it('rejects placements past the right or bottom edge', () => {
    // 2x3 at (9, 0) → x extends to 11, plot width 10.
    expect(fitsInPlot(DEV_2x3, { position: { x: 9, y: 0 }, rotation: 0 }, plot)).toBe(false);
    expect(fitsInPlot(DEV_2x3, { position: { x: 0, y: 8 }, rotation: 0 }, plot)).toBe(false);
  });

  it('rejects negative positions', () => {
    expect(fitsInPlot(DEV_2x3, { position: { x: -1, y: 0 }, rotation: 0 }, plot)).toBe(false);
  });

  it('respects rotated bbox', () => {
    // Rotated 90°, bbox is 3×2. (8, 0) → 8+3 = 11, out of bounds.
    expect(fitsInPlot(DEV_2x3, { position: { x: 8, y: 0 }, rotation: 90 }, plot)).toBe(false);
    expect(fitsInPlot(DEV_2x3, { position: { x: 7, y: 0 }, rotation: 90 }, plot)).toBe(true);
  });
});

function mk(footprint: { width: number; height: number }, io_ports: Port[]): Device {
  return {
    id: 'test-device',
    display_name_zh_hans: 'Test',
    footprint,
    bandwidth: 1,
    power_draw: 0,
    requires_power: false,
    has_fluid_interface: false,
    io_ports,
    tech_prereq: [],
    category: 'basic_production',
    recipes: [],
  };
}
