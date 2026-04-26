import { describe, expect, it } from 'vitest';
import {
  computePowerCoverage,
  inZone,
  previewPoleLinkZone,
  previewSupplyZone,
} from './power-coverage.ts';
import { createProject } from './project.ts';
import type { Device, Region } from '@core/data-loader/types.ts';
import type { PlacedDevice } from './types.ts';

const REGION: Region = {
  id: 'r',
  display_name_zh_hans: 'R',
  plot_default_size: { width: 30, height: 30 },
  core_position: { x: 0, y: 0 },
  sub_core_positions: [],
  available_tech_tiers: [],
  mining_nodes: [],
};

const POLE: Device = {
  id: 'pole',
  display_name_zh_hans: 'pole',
  footprint: { width: 2, height: 2 },
  bandwidth: 0,
  power_draw: 0,
  requires_power: false,
  has_fluid_interface: false,
  io_ports: [],
  tech_prereq: [],
  category: 'power',
  recipes: [],
  power_aoe: { kind: 'square_centered', edge: 12, purpose: 'device_supply' },
};
const REPEATER: Device = {
  ...POLE,
  id: 'repeater',
  footprint: { width: 3, height: 3 },
  power_aoe: { kind: 'square_centered', edge: 7, purpose: 'pole_link' },
};
const FURNACE: Device = {
  id: 'furnace',
  display_name_zh_hans: 'furnace',
  footprint: { width: 3, height: 3 },
  bandwidth: 0,
  power_draw: 100,
  requires_power: true,
  has_fluid_interface: false,
  io_ports: [],
  tech_prereq: [],
  category: 'basic_production',
  recipes: [],
};

const lookup = (id: string): Device | undefined =>
  ({ pole: POLE, repeater: REPEATER, furnace: FURNACE })[id];

const placed = (instance_id: string, device_id: string, x = 0, y = 0): PlacedDevice => ({
  instance_id,
  device_id,
  position: { x, y },
  rotation: 0,
  recipe_id: null,
});

describe('computePowerCoverage', () => {
  it('marks a powered device inside a pole AoE as covered', () => {
    const project = {
      ...createProject({ region: REGION, data_version: 'test' }),
      devices: [placed('p', 'pole', 5, 5), placed('f', 'furnace', 4, 4)],
    };
    const cov = computePowerCoverage(project, lookup);
    expect(cov.coveredInstanceIds.has('f')).toBe(true);
    expect(cov.zones).toHaveLength(1);
  });

  it('does not mark a powered device far from any pole', () => {
    const project = {
      ...createProject({ region: REGION, data_version: 'test' }),
      devices: [placed('p', 'pole', 0, 0), placed('f', 'furnace', 20, 20)],
    };
    const cov = computePowerCoverage(project, lookup);
    expect(cov.coveredInstanceIds.has('f')).toBe(false);
  });

  it('marks a device with ANY footprint cell in the AoE as covered (P4 v5)', () => {
    // Pole at (0,0): 2×2 footprint, center (1,1), 12-edge AoE → x ∈ [-5, 6], y ∈ [-5, 6].
    // Place a 3×3 furnace at (5, 5) → footprint cells (5..7, 5..7). Only (5,5), (5,6),
    // (6,5), (6,6) are inside the AoE; (7,*) and (*,7) are outside. The v4 "every cell"
    // rule rejects this; v5 "any cell" accepts it.
    const project = {
      ...createProject({ region: REGION, data_version: 'test' }),
      devices: [placed('p', 'pole', 0, 0), placed('f', 'furnace', 5, 5)],
    };
    const cov = computePowerCoverage(project, lookup);
    expect(cov.coveredInstanceIds.has('f')).toBe(true);
  });

  it('treats supply poles as self-covered', () => {
    const project = {
      ...createProject({ region: REGION, data_version: 'test' }),
      devices: [placed('p', 'pole', 5, 5)],
    };
    const cov = computePowerCoverage(project, lookup);
    expect(cov.coveredInstanceIds.has('p')).toBe(true);
  });

  it('repeaters do not count as supply zones', () => {
    const project = {
      ...createProject({ region: REGION, data_version: 'test' }),
      devices: [placed('r', 'repeater', 5, 5), placed('f', 'furnace', 4, 4)],
    };
    const cov = computePowerCoverage(project, lookup);
    expect(cov.zones).toHaveLength(0);
    expect(cov.coveredInstanceIds.has('f')).toBe(false);
  });

  it('inZone is inclusive on both bounds', () => {
    const zone = { minX: 0, maxX: 5, minY: 0, maxY: 5, supplier_instance_id: 's' };
    expect(inZone({ x: 0, y: 0 }, zone)).toBe(true);
    expect(inZone({ x: 5, y: 5 }, zone)).toBe(true);
    expect(inZone({ x: 6, y: 5 }, zone)).toBe(false);
    expect(inZone({ x: -1, y: 0 }, zone)).toBe(false);
  });

  it('previewSupplyZone returns null for non-supply devices', () => {
    expect(previewSupplyZone(REPEATER, { x: 0, y: 0 }, 0)).toBeNull();
    expect(previewSupplyZone(FURNACE, { x: 0, y: 0 }, 0)).toBeNull();
  });

  it('previewPoleLinkZone returns a zone for repeaters', () => {
    const z = previewPoleLinkZone(REPEATER, { x: 5, y: 5 }, 0);
    expect(z).not.toBeNull();
    // 3×3 footprint at (5,5)-(7,7), center (6.5, 6.5), 7-edge AoE → spans 7 cells
    // around the center: floor(6.5 - 3) = 3 .. floor(6.5 + 4) - 1 = 9
    expect(z!.maxX - z!.minX + 1).toBe(7);
    expect(z!.maxY - z!.minY + 1).toBe(7);
  });
});
