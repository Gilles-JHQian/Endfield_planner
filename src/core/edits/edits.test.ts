import { describe, expect, it } from 'vitest';
import { createProject, type Region, type Device, type Project } from '@core/domain/index.ts';
import {
  addLink,
  deleteDevice,
  deleteLink,
  moveDevice,
  placeDevice,
  resizePlot,
  rotateDevice,
  setDeviceRecipe,
} from './index.ts';

const REGION: Region = {
  id: 'test',
  display_name_zh_hans: '测试',
  plot_default_size: { width: 20, height: 20 },
  core_position: { x: 0, y: 0 },
  sub_core_positions: [],
  available_tech_tiers: [],
  mining_nodes: [],
};

const FURNACE: Device = mkDev(
  'furnance-1',
  { width: 3, height: 3 },
  ['recipe-iron-nugget'],
  [{ side: 'N', offset: 1, kind: 'solid', direction_constraint: 'input' }],
);
const MINER: Device = mkDev('miner-1', { width: 3, height: 3 }, [], []);

const lookup = (id: string): Device | undefined => {
  if (id === FURNACE.id) return FURNACE;
  if (id === MINER.id) return MINER;
  return undefined;
};

function freshProject(): Project {
  return createProject({ region: REGION, data_version: 'test' });
}

function unwrap<T>(
  r: { ok: true; value: T } | { ok: false; error: { kind: string; message: string } },
): T {
  if (!r.ok) throw new Error(`Expected ok, got error ${r.error.kind}: ${r.error.message}`);
  return r.value;
}

describe('placeDevice', () => {
  it('appends a new device at the requested position', () => {
    const r = placeDevice({
      project: freshProject(),
      device: FURNACE,
      position: { x: 2, y: 2 },
      lookup,
      instance_id: 'd-1',
    });
    const { project, placed } = unwrap(r);
    expect(project.devices).toHaveLength(1);
    expect(placed.position).toEqual({ x: 2, y: 2 });
    expect(placed.recipe_id).toBeNull();
  });

  it('rejects placements that extend past the plot', () => {
    const small = { ...freshProject(), plot: { width: 5, height: 5 } };
    const r = placeDevice({ project: small, device: FURNACE, position: { x: 4, y: 0 }, lookup });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('out_of_bounds');
  });

  it('rejects placements that collide with another device', () => {
    const r1 = placeDevice({
      project: freshProject(),
      device: FURNACE,
      position: { x: 5, y: 5 },
      lookup,
      instance_id: 'a',
    });
    const project1 = unwrap(r1).project;
    const r2 = placeDevice({
      project: project1,
      device: MINER,
      position: { x: 6, y: 6 },
      lookup,
      instance_id: 'b',
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error.kind).toBe('collision');
      expect(r2.error.at).toBeDefined();
    }
  });
});

describe('moveDevice', () => {
  it('moves to a free cell', () => {
    const project = unwrap(
      placeDevice({
        project: freshProject(),
        device: FURNACE,
        position: { x: 0, y: 0 },
        lookup,
        instance_id: 'a',
      }),
    ).project;
    const r = moveDevice(project, 'a', { x: 10, y: 10 }, lookup);
    const moved = unwrap(r);
    expect(moved.devices[0]?.position).toEqual({ x: 10, y: 10 });
  });

  it('reports not_found for an unknown instance', () => {
    const r = moveDevice(freshProject(), 'nope', { x: 0, y: 0 }, lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('not_found');
  });

  it('treats the device own current cells as free during move', () => {
    // Device at (0,0). Moving to (1,0) overlaps its own current footprint —
    // should still be allowed because the moving device is excluded from the
    // collision check.
    const project = unwrap(
      placeDevice({
        project: freshProject(),
        device: FURNACE,
        position: { x: 0, y: 0 },
        lookup,
        instance_id: 'a',
      }),
    ).project;
    const r = moveDevice(project, 'a', { x: 1, y: 0 }, lookup);
    expect(r.ok).toBe(true);
  });
});

describe('rotateDevice', () => {
  it('cycles 0 → 90 → 180 → 270 → 0', () => {
    let project = unwrap(
      placeDevice({
        project: freshProject(),
        device: FURNACE,
        position: { x: 0, y: 0 },
        lookup,
        instance_id: 'a',
      }),
    ).project;
    for (const expected of [90, 180, 270, 0]) {
      project = unwrap(rotateDevice(project, 'a', lookup));
      expect(project.devices[0]?.rotation).toBe(expected);
    }
  });
});

describe('deleteDevice', () => {
  it('removes the device', () => {
    const project = unwrap(
      placeDevice({
        project: freshProject(),
        device: FURNACE,
        position: { x: 0, y: 0 },
        lookup,
        instance_id: 'a',
      }),
    ).project;
    const after = unwrap(deleteDevice(project, 'a'));
    expect(after.devices).toHaveLength(0);
  });

  it('also drops links anchored to the deleted device', () => {
    let project = unwrap(
      placeDevice({
        project: freshProject(),
        device: FURNACE,
        position: { x: 0, y: 0 },
        lookup,
        instance_id: 'a',
      }),
    ).project;
    const linkR = addLink({
      project,
      layer: 'solid',
      tier_id: 'belt-1',
      path: [{ x: 0, y: 0 }],
      src: { device_instance_id: 'a', port_index: 0 },
      lookup,
    });
    project = unwrap(linkR).project;
    expect(project.solid_links).toHaveLength(1);
    const after = unwrap(deleteDevice(project, 'a'));
    expect(after.solid_links).toHaveLength(0);
  });
});

describe('setDeviceRecipe', () => {
  function placedProject() {
    return unwrap(
      placeDevice({
        project: freshProject(),
        device: FURNACE,
        position: { x: 0, y: 0 },
        lookup,
        instance_id: 'a',
      }),
    ).project;
  }

  it('binds a whitelisted recipe', () => {
    const after = unwrap(setDeviceRecipe(placedProject(), 'a', 'recipe-iron-nugget', lookup));
    expect(after.devices[0]?.recipe_id).toBe('recipe-iron-nugget');
  });

  it('clears with null', () => {
    const bound = unwrap(setDeviceRecipe(placedProject(), 'a', 'recipe-iron-nugget', lookup));
    const after = unwrap(setDeviceRecipe(bound, 'a', null, lookup));
    expect(after.devices[0]?.recipe_id).toBeNull();
  });

  it('rejects a recipe outside the device whitelist', () => {
    const r = setDeviceRecipe(placedProject(), 'a', 'recipe-not-allowed', lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_recipe');
  });

  it('rejects an unknown instance', () => {
    const r = setDeviceRecipe(freshProject(), 'nope', null, lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('not_found');
  });
});

describe('addLink / deleteLink', () => {
  function placed() {
    return unwrap(
      placeDevice({
        project: freshProject(),
        device: FURNACE,
        position: { x: 0, y: 0 },
        lookup,
        instance_id: 'a',
      }),
    ).project;
  }

  it('adds a solid link with a path', () => {
    const r = addLink({
      project: placed(),
      layer: 'solid',
      tier_id: 'belt-1',
      path: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
      ],
      lookup,
    });
    const { project, link } = unwrap(r);
    expect(link.layer).toBe('solid');
    expect(project.solid_links).toHaveLength(1);
    expect(project.fluid_links).toHaveLength(0);
  });

  it('rejects out-of-plot path cells', () => {
    const r = addLink({
      project: placed(),
      layer: 'solid',
      tier_id: 'belt-1',
      path: [{ x: 100, y: 100 }],
      lookup,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('out_of_bounds');
  });

  it('rejects PortRef pointing at a missing device', () => {
    const r = addLink({
      project: placed(),
      layer: 'solid',
      tier_id: 'belt-1',
      path: [{ x: 0, y: 0 }],
      src: { device_instance_id: 'ghost', port_index: 0 },
      lookup,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_link');
  });

  it('deleteLink removes by id', () => {
    const r = addLink({
      project: placed(),
      layer: 'fluid',
      tier_id: 'pipe-wuling',
      path: [{ x: 5, y: 5 }],
      lookup,
      id: 'lnk-1',
    });
    const project = unwrap(r).project;
    const after = unwrap(deleteLink(project, 'lnk-1'));
    expect(after.fluid_links).toHaveLength(0);
  });
});

describe('resizePlot', () => {
  it('grows freely', () => {
    const after = unwrap(resizePlot(freshProject(), 100, 100, lookup));
    expect(after.plot).toEqual({ width: 100, height: 100 });
  });

  it('rejects non-positive size', () => {
    const r = resizePlot(freshProject(), 0, 5, lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('out_of_bounds');
  });

  it('returns shrink_conflict when devices fall outside', () => {
    const project = unwrap(
      placeDevice({
        project: freshProject(),
        device: FURNACE,
        position: { x: 15, y: 15 },
        lookup,
        instance_id: 'far',
      }),
    ).project;
    const r = resizePlot(project, 10, 10, lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('shrink_conflict');
      expect(r.error.conflicts).toContain('far');
    }
  });

  it('shrinks cleanly when nothing is outside', () => {
    const project = unwrap(
      placeDevice({
        project: freshProject(),
        device: FURNACE,
        position: { x: 0, y: 0 },
        lookup,
        instance_id: 'a',
      }),
    ).project;
    const after = unwrap(resizePlot(project, 5, 5, lookup));
    expect(after.plot).toEqual({ width: 5, height: 5 });
  });
});

function mkDev(
  id: string,
  footprint: { width: number; height: number },
  recipes: string[],
  io_ports: Device['io_ports'],
): Device {
  return {
    id,
    display_name_zh_hans: id,
    footprint,
    bandwidth: 1,
    power_draw: 0,
    requires_power: false,
    has_fluid_interface: false,
    io_ports,
    tech_prereq: [],
    category: 'basic_production',
    recipes,
  };
}
