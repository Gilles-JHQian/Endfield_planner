import { describe, expect, it } from 'vitest';
import { buildPortConnectivity, linkItem, portKey } from './topology.ts';
import { createProject } from './project.ts';
import type { Device, Recipe, Region } from '@core/data-loader/types.ts';
import type { PlacedDevice, SolidLink } from './types.ts';

const REGION: Region = {
  id: 'r',
  display_name_zh_hans: 'R',
  plot_default_size: { width: 30, height: 30 },
  core_position: { x: 0, y: 0 },
  sub_core_positions: [],
  available_tech_tiers: [],
  mining_nodes: [],
};

const MINER: Device = {
  id: 'miner',
  display_name_zh_hans: 'miner',
  footprint: { width: 2, height: 2 },
  bandwidth: 30,
  power_draw: 10,
  requires_power: true,
  has_fluid_interface: false,
  io_ports: [
    { side: 'E', offset: 0, kind: 'solid', direction_constraint: 'output' },
  ],
  tech_prereq: [],
  category: 'miner',
  recipes: ['r-iron'],
};

const FURNACE: Device = {
  id: 'furnace',
  display_name_zh_hans: 'furnace',
  footprint: { width: 2, height: 2 },
  bandwidth: 30,
  power_draw: 50,
  requires_power: true,
  has_fluid_interface: false,
  io_ports: [
    { side: 'W', offset: 0, kind: 'solid', direction_constraint: 'input' },
  ],
  tech_prereq: [],
  category: 'basic_production',
  recipes: ['r-iron'],
};

const RECIPE_IRON: Recipe = {
  id: 'r-iron',
  display_name_zh_hans: 'iron',
  cycle_seconds: 2,
  inputs: [],
  outputs: [{ item_id: 'item-iron-ore', qty_per_cycle: 1 }],
  compatible_devices: ['miner', 'furnace'],
};

const RECIPE_MULTI: Recipe = {
  id: 'r-multi',
  display_name_zh_hans: 'multi',
  cycle_seconds: 5,
  inputs: [],
  outputs: [
    { item_id: 'item-a', qty_per_cycle: 1 },
    { item_id: 'item-b', qty_per_cycle: 1 },
  ],
  compatible_devices: ['miner'],
};

const lookup = (id: string): Device | undefined =>
  ({ miner: MINER, furnace: FURNACE })[id];

const placed = (instance_id: string, device_id: string, recipe_id: string | null = null): PlacedDevice => ({
  instance_id,
  device_id,
  position: { x: 0, y: 0 },
  rotation: 0,
  recipe_id,
});

const link = (id: string, src?: { device_instance_id: string; port_index: number }, dst?: { device_instance_id: string; port_index: number }): SolidLink => ({
  id,
  layer: 'solid',
  tier_id: 'belt-1',
  path: [{ x: 0, y: 0 }],
  ...(src ? { src } : {}),
  ...(dst ? { dst } : {}),
});

describe('portKey', () => {
  it('encodes instance_id + port_index', () => {
    expect(portKey({ device_instance_id: 'd1', port_index: 3 })).toBe('d1:3');
  });
});

describe('buildPortConnectivity', () => {
  it('indexes both src and dst port refs', () => {
    const project = {
      ...createProject({ region: REGION, data_version: 'test' }),
      solid_links: [
        link('L1', { device_instance_id: 'm', port_index: 0 }, { device_instance_id: 'f', port_index: 0 }),
      ],
    };
    const conn = buildPortConnectivity(project);
    expect(conn.portToLink.get('m:0')).toBe('L1');
    expect(conn.portToLink.get('f:0')).toBe('L1');
    expect(conn.linkById.get('L1')?.id).toBe('L1');
  });

  it('handles links without endpoints', () => {
    const project = {
      ...createProject({ region: REGION, data_version: 'test' }),
      solid_links: [link('L1')],
    };
    const conn = buildPortConnectivity(project);
    expect(conn.portToLink.size).toBe(0);
    expect(conn.linkById.get('L1')).toBeDefined();
  });

  it('merges across solid + fluid layers', () => {
    const project = {
      ...createProject({ region: REGION, data_version: 'test' }),
      solid_links: [link('Ls', { device_instance_id: 'a', port_index: 0 })],
      fluid_links: [
        {
          id: 'Lf',
          layer: 'fluid' as const,
          tier_id: 'pipe-wuling',
          path: [{ x: 0, y: 0 }],
          src: { device_instance_id: 'b', port_index: 0 },
        },
      ],
    };
    const conn = buildPortConnectivity(project);
    expect(conn.portToLink.get('a:0')).toBe('Ls');
    expect(conn.portToLink.get('b:0')).toBe('Lf');
    expect(conn.linkById.size).toBe(2);
  });
});

describe('linkItem', () => {
  it('resolves single-output recipe via src device', () => {
    const project = {
      ...createProject({ region: REGION, data_version: 'test' }),
      devices: [placed('m', 'miner', 'r-iron')],
      solid_links: [link('L', { device_instance_id: 'm', port_index: 0 })],
    };
    const item = linkItem(project.solid_links[0]!, project, lookup, [RECIPE_IRON]);
    expect(item).toBe('item-iron-ore');
  });

  it('returns null when src is unset', () => {
    const project = {
      ...createProject({ region: REGION, data_version: 'test' }),
      solid_links: [link('L')],
    };
    expect(linkItem(project.solid_links[0]!, project, lookup, [RECIPE_IRON])).toBeNull();
  });

  it('returns null when source device has no recipe', () => {
    const project = {
      ...createProject({ region: REGION, data_version: 'test' }),
      devices: [placed('m', 'miner', null)],
      solid_links: [link('L', { device_instance_id: 'm', port_index: 0 })],
    };
    expect(linkItem(project.solid_links[0]!, project, lookup, [RECIPE_IRON])).toBeNull();
  });

  it('returns null for multi-output recipes (port→output mapping deferred)', () => {
    const project = {
      ...createProject({ region: REGION, data_version: 'test' }),
      devices: [placed('m', 'miner', 'r-multi')],
      solid_links: [link('L', { device_instance_id: 'm', port_index: 0 })],
    };
    expect(linkItem(project.solid_links[0]!, project, lookup, [RECIPE_MULTI])).toBeNull();
  });
});
