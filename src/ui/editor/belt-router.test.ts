/** Tests for belt-router's port-finding helpers. The routing planner itself
 *  is covered by path.test.ts; this file focuses on the catalog-aware port
 *  resolution that landed in P4 v6/v7. */
import { describe, expect, it } from 'vitest';
import {
  findInputPortAtCell,
  findOutputPortAtCell,
  hasMultipleOutputPortsAtCell,
} from './belt-router.ts';
import { createProject } from '@core/domain/project.ts';
import type { Device, Region } from '@core/data-loader/types.ts';
import type { PlacedDevice, Project } from '@core/domain/types.ts';

const REGION: Region = {
  id: 'r',
  display_name_zh_hans: 'R',
  plot_default_size: { width: 30, height: 30 },
  core_position: { x: 0, y: 0 },
  sub_core_positions: [],
  available_tech_tiers: [],
  mining_nodes: [],
};

// 1×1 belt-splitter analog: 1 W input + 3 N/E/S outputs all on the single cell.
const SPLITTER: Device = {
  id: 'belt-splitter',
  display_name_zh_hans: 'splitter',
  footprint: { width: 1, height: 1 },
  bandwidth: 60,
  power_draw: 0,
  requires_power: false,
  has_fluid_interface: false,
  io_ports: [
    { side: 'W', offset: 0, kind: 'solid', direction_constraint: 'input' },
    { side: 'N', offset: 0, kind: 'solid', direction_constraint: 'output' },
    { side: 'E', offset: 0, kind: 'solid', direction_constraint: 'output' },
    { side: 'S', offset: 0, kind: 'solid', direction_constraint: 'output' },
  ],
  tech_prereq: [],
  category: 'logistics',
  recipes: [],
};

const MERGER: Device = {
  ...SPLITTER,
  id: 'belt-merger',
  io_ports: [
    { side: 'N', offset: 0, kind: 'solid', direction_constraint: 'input' },
    { side: 'E', offset: 0, kind: 'solid', direction_constraint: 'input' },
    { side: 'S', offset: 0, kind: 'solid', direction_constraint: 'input' },
    { side: 'W', offset: 0, kind: 'solid', direction_constraint: 'output' },
  ],
};

const lookup = (id: string): Device | undefined => {
  if (id === SPLITTER.id) return SPLITTER;
  if (id === MERGER.id) return MERGER;
  return undefined;
};

const placed = (instance_id: string, device_id: string, x = 5, y = 5): PlacedDevice => ({
  instance_id,
  device_id,
  position: { x, y },
  rotation: 0,
  recipe_id: null,
});

function project(devices: PlacedDevice[]): Project {
  return { ...createProject({ region: REGION, data_version: 'test' }), devices };
}

describe('findOutputPortAtCell with departure filter (P4 v7)', () => {
  it('without departure: returns first output port at cell (legacy)', () => {
    const p = project([placed('s', 'belt-splitter')]);
    // Splitter has outputs on N/E/S; first matching output is N (port_index 1).
    const r = findOutputPortAtCell({ x: 5, y: 5 }, 'solid', p, lookup);
    expect(r?.face_direction).toEqual({ dx: 0, dy: -1 });
    expect(r?.port_index).toBe(1);
  });

  it('with departure east: returns the E output port (port_index 2)', () => {
    const p = project([placed('s', 'belt-splitter')]);
    const r = findOutputPortAtCell({ x: 5, y: 5 }, 'solid', p, lookup, { dx: 1, dy: 0 });
    expect(r?.face_direction).toEqual({ dx: 1, dy: 0 });
    expect(r?.port_index).toBe(2);
  });

  it('with departure south: returns the S output port (port_index 3)', () => {
    const p = project([placed('s', 'belt-splitter')]);
    const r = findOutputPortAtCell({ x: 5, y: 5 }, 'solid', p, lookup, { dx: 0, dy: 1 });
    expect(r?.face_direction).toEqual({ dx: 0, dy: 1 });
    expect(r?.port_index).toBe(3);
  });

  it('with departure west: no match (no output port faces west on splitter)', () => {
    const p = project([placed('s', 'belt-splitter')]);
    expect(findOutputPortAtCell({ x: 5, y: 5 }, 'solid', p, lookup, { dx: -1, dy: 0 })).toBeNull();
  });
});

describe('findInputPortAtCell with arrival filter on multi-port mergers (P4 v7)', () => {
  it('east-going belt does not match any input on a merger (W is the OUTPUT face)', () => {
    const p = project([placed('m', 'belt-merger')]);
    const east = findInputPortAtCell({ x: 5, y: 5 }, 'solid', p, lookup, { dx: 1, dy: 0 });
    expect(east).toBeNull();
  });

  it('arrival from north (going south): matches the N-facing input', () => {
    const p = project([placed('m', 'belt-merger')]);
    // Belt going south (dx=0, dy=1) → arriving from north → enters N face
    // (port whose face_direction is (0,-1) = N).
    const r = findInputPortAtCell({ x: 5, y: 5 }, 'solid', p, lookup, { dx: 0, dy: 1 });
    expect(r?.arrival_direction).toEqual({ dx: 0, dy: 1 });
    expect(r?.port_index).toBe(0); // N is index 0 in MERGER
  });

  it('arrival from south (going north): matches the S-facing input', () => {
    const p = project([placed('m', 'belt-merger')]);
    const r = findInputPortAtCell({ x: 5, y: 5 }, 'solid', p, lookup, { dx: 0, dy: -1 });
    expect(r?.port_index).toBe(2); // S is index 2
  });

  it('arrival from east (going west): matches the E-facing input', () => {
    const p = project([placed('m', 'belt-merger')]);
    const r = findInputPortAtCell({ x: 5, y: 5 }, 'solid', p, lookup, { dx: -1, dy: 0 });
    expect(r?.port_index).toBe(1); // E is index 1
  });
});

describe('hasMultipleOutputPortsAtCell (P4 v7)', () => {
  it('true for a splitter (3 outputs at one cell)', () => {
    const p = project([placed('s', 'belt-splitter')]);
    expect(hasMultipleOutputPortsAtCell({ x: 5, y: 5 }, 'solid', p, lookup)).toBe(true);
  });

  it('false for a merger (1 output)', () => {
    const p = project([placed('m', 'belt-merger')]);
    expect(hasMultipleOutputPortsAtCell({ x: 5, y: 5 }, 'solid', p, lookup)).toBe(false);
  });

  it('false on a cell with no devices', () => {
    expect(hasMultipleOutputPortsAtCell({ x: 0, y: 0 }, 'solid', project([]), lookup)).toBe(false);
  });
});
