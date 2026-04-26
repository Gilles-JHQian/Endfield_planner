import { describe, expect, it } from 'vitest';
import { buildOccupancy, cellBlockedFor, type DeviceLookup } from './occupancy.ts';
import type { Project } from './types.ts';
import type { Device } from '@core/data-loader/types.ts';

const FURNACE: Device = mkDev('furnance-1', { width: 3, height: 3 });
const lookup: DeviceLookup = (id) => (id === FURNACE.id ? FURNACE : undefined);

const baseProject = (): Project => ({
  id: 'p',
  name: '',
  region_id: '',
  data_version: '1.2',
  plot: { width: 30, height: 30 },
  devices: [
    {
      instance_id: 'a',
      device_id: 'furnance-1',
      position: { x: 5, y: 5 },
      rotation: 0,
      recipe_id: null,
    },
  ],
  solid_links: [
    {
      id: 'belt-a',
      layer: 'solid',
      tier_id: 'belt-1',
      path: [
        { x: 10, y: 0 },
        { x: 11, y: 0 },
      ],
    },
  ],
  fluid_links: [{ id: 'pipe-a', layer: 'fluid', tier_id: 'pipe-wuling', path: [{ x: 0, y: 10 }] }],
  created_at: '',
  updated_at: '',
});

describe('buildOccupancy + cellBlockedFor', () => {
  it('marks device footprint cells as blocked on BOTH layers (REQUIREMENT §4.5)', () => {
    const occ = buildOccupancy(baseProject(), lookup);
    // Device sits at (5..7, 5..7) — pick any internal cell.
    const inside = { x: 6, y: 6 };
    expect(cellBlockedFor(inside, 'solid', occ)).toBe('device');
    expect(cellBlockedFor(inside, 'fluid', occ)).toBe('device');
  });

  it('a belt cell blocks new belts but allows new pipes there', () => {
    const occ = buildOccupancy(baseProject(), lookup);
    expect(cellBlockedFor({ x: 10, y: 0 }, 'solid', occ)).toBe('same_layer');
    // Belt and pipe may share a cell on different layers (REQUIREMENT §4.5.2).
    expect(cellBlockedFor({ x: 10, y: 0 }, 'fluid', occ)).toBeNull();
  });

  it('a pipe cell blocks new pipes but allows new belts', () => {
    const occ = buildOccupancy(baseProject(), lookup);
    expect(cellBlockedFor({ x: 0, y: 10 }, 'fluid', occ)).toBe('same_layer');
    expect(cellBlockedFor({ x: 0, y: 10 }, 'solid', occ)).toBeNull();
  });

  it('returns null for an empty cell on both layers', () => {
    const occ = buildOccupancy(baseProject(), lookup);
    expect(cellBlockedFor({ x: 20, y: 20 }, 'solid', occ)).toBeNull();
    expect(cellBlockedFor({ x: 20, y: 20 }, 'fluid', occ)).toBeNull();
  });
});

function mkDev(id: string, footprint: { width: number; height: number }): Device {
  return {
    id,
    display_name_zh_hans: id,
    footprint,
    bandwidth: 1,
    power_draw: 0,
    requires_power: false,
    has_fluid_interface: false,
    io_ports: [],
    tech_prereq: [],
    category: 'basic_production',
    recipes: [],
  };
}
