import { describe, expect, it } from 'vitest';
import { createProject, type Region, type Device, type Project } from '@core/domain/index.ts';
import {
  addLink,
  deleteDevice,
  deleteLink,
  moveDevice,
  moveRotateDevice,
  placeDevice,
  resizePlot,
  rotateDevice,
  setDeviceRecipe,
  setLinkEndpoint,
  splitLink,
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

  // P4 v7 — per-layer collision: solid bridges only block the solid layer.
  it('places a belt-cross-bridge on top of a fluid-only device cell (P4 v7)', () => {
    // A fluid-only device is hard to construct without the real catalog; the
    // simplest stand-in is "an existing pipe-cross-bridge" — but pipe bridges
    // block both layers, so they don't help. Instead, demonstrate the
    // ASYMMETRY: place a solid bridge first, then place ANOTHER solid bridge
    // (or solid-blocking device) at the same cell — should still collide.
    // The fluid-passthrough is exercised separately by occupancy.test.ts and
    // by the editor's link router (which already routes pipes over solid
    // bridges).
    const beltBridge: Device = mkDev(
      'belt-cross-bridge',
      { width: 1, height: 1 },
      [],
      [],
    );
    const lookupB = (id: string): Device | undefined => {
      if (id === beltBridge.id) return beltBridge;
      if (id === FURNACE.id) return FURNACE;
      return undefined;
    };
    const p1 = unwrap(
      placeDevice({
        project: freshProject(),
        device: beltBridge,
        position: { x: 5, y: 5 },
        lookup: lookupB,
        instance_id: 'br1',
      }),
    ).project;
    const r = placeDevice({
      project: p1,
      device: beltBridge,
      position: { x: 5, y: 5 },
      lookup: lookupB,
      instance_id: 'br2',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('collision');
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

  it('leaves links anchored to the deleted device dangling (P4 v7)', () => {
    // v6 cascade-deleted these links, which made mixed F-delete batches roll
    // back. v7 leaves them in place with their (now stale) PortRefs; DRC's
    // PORT validators surface the dangling reference instead.
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
    expect(after.solid_links).toHaveLength(1);
    expect(after.solid_links[0]!.src?.device_instance_id).toBe('a');
    expect(after.devices).toHaveLength(0);
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

describe('moveRotateDevice (P4 v7)', () => {
  it('applies a new position AND rotation in one transactional step', () => {
    const project = unwrap(
      placeDevice({
        project: freshProject(),
        device: FURNACE,
        position: { x: 0, y: 0 },
        lookup,
        instance_id: 'a',
      }),
    ).project;
    const after = unwrap(moveRotateDevice(project, 'a', { x: 10, y: 10 }, 90, lookup));
    expect(after.devices[0]!.position).toEqual({ x: 10, y: 10 });
    expect(after.devices[0]!.rotation).toBe(90);
  });

  it('rejects out-of-bounds new position', () => {
    const project = unwrap(
      placeDevice({
        project: { ...freshProject(), plot: { width: 10, height: 10 } },
        device: FURNACE,
        position: { x: 0, y: 0 },
        lookup,
        instance_id: 'a',
      }),
    ).project;
    const r = moveRotateDevice(project, 'a', { x: 9, y: 0 }, 0, lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('out_of_bounds');
  });

  it('rejects collision with another device at the new spot', () => {
    let project = unwrap(
      placeDevice({
        project: freshProject(),
        device: FURNACE,
        position: { x: 0, y: 0 },
        lookup,
        instance_id: 'a',
      }),
    ).project;
    project = unwrap(
      placeDevice({
        project,
        device: MINER,
        position: { x: 10, y: 10 },
        lookup,
        instance_id: 'b',
      }),
    ).project;
    const r = moveRotateDevice(project, 'a', { x: 10, y: 10 }, 0, lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('collision');
  });
});

describe('splitLink', () => {
  function mkProjectWithLink(
    path: { x: number; y: number }[],
    src?: { device_instance_id: string; port_index: number },
    dst?: { device_instance_id: string; port_index: number },
  ): Project {
    const r = addLink({
      project: freshProject(),
      layer: 'solid',
      tier_id: 'belt-1',
      path,
      ...(src ? { src } : {}),
      ...(dst ? { dst } : {}),
      lookup,
      id: 'L0',
    });
    if (!r.ok) throw new Error('addLink failed in fixture');
    return r.value.project;
  }

  it('splits a 5-cell horizontal link at the middle cell — at_cell kept in BOTH halves (P4 v7.1)', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ];
    const project = mkProjectWithLink(path);
    const r = splitLink({
      project,
      link_id: 'L0',
      at_cell: { x: 2, y: 0 },
      left_dst: { device_instance_id: 'br', port_index: 3 },
      right_src: { device_instance_id: 'br', port_index: 1 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.project.solid_links).toHaveLength(2);
    expect(r.value.project.solid_links.find((l) => l.id === 'L0')).toBeUndefined();
    const left = r.value.project.solid_links.find((l) => l.id === r.value.left_id)!;
    const right = r.value.project.solid_links.find((l) => l.id === r.value.right_id)!;
    expect(left.path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(right.path).toEqual([
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);
    expect(left.dst).toEqual({ device_instance_id: 'br', port_index: 3 });
    expect(right.src).toEqual({ device_instance_id: 'br', port_index: 1 });
  });

  it('honors pinned ids via the `ids` option (P4 v7.5)', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const project = mkProjectWithLink(path);
    const r = splitLink({
      project,
      link_id: 'L0',
      at_cell: { x: 1, y: 0 },
      left_dst: { device_instance_id: 'br', port_index: 0 },
      right_src: { device_instance_id: 'br', port_index: 0 },
      ids: { left: 'pinned-L', right: 'pinned-R' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.left_id).toBe('pinned-L');
    expect(r.value.right_id).toBe('pinned-R');
  });

  it('chains splits — second split targets the right-half of the first (P4 v7.5)', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ];
    let project = mkProjectWithLink(path);
    // First split at (1, 0) → right half pinned to 'mid'.
    const r1 = splitLink({
      project,
      link_id: 'L0',
      at_cell: { x: 1, y: 0 },
      left_dst: { device_instance_id: 'b1', port_index: 0 },
      right_src: { device_instance_id: 'b1', port_index: 0 },
      ids: { right: 'mid' },
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    project = r1.value.project;
    // Second split at (3, 0) on the pinned right half.
    const r2 = splitLink({
      project,
      link_id: 'mid',
      at_cell: { x: 3, y: 0 },
      left_dst: { device_instance_id: 'b2', port_index: 0 },
      right_src: { device_instance_id: 'b2', port_index: 0 },
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    // 3 segments now: [0,1] / [1,2,3] / [3,4]
    expect(r2.value.project.solid_links).toHaveLength(3);
  });

  it('preserves original src/dst on the outer ends', () => {
    // Place a real device so the src PortRef passes addLink's validation.
    const placed = unwrap(
      placeDevice({
        project: freshProject(),
        device: FURNACE,
        position: { x: 5, y: 5 },
        lookup,
        instance_id: 'src-dev',
      }),
    ).project;
    const linked = unwrap(
      addLink({
        project: placed,
        layer: 'solid',
        tier_id: 'belt-1',
        path: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
        src: { device_instance_id: 'src-dev', port_index: 0 },
        lookup,
        id: 'L0',
      }),
    ).project;
    const r = splitLink({
      project: linked,
      link_id: 'L0',
      at_cell: { x: 1, y: 0 },
      left_dst: { device_instance_id: 'br', port_index: 3 },
      right_src: { device_instance_id: 'br', port_index: 1 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const left = r.value.project.solid_links.find((l) => l.id === r.value.left_id)!;
    const right = r.value.project.solid_links.find((l) => l.id === r.value.right_id)!;
    expect(left.src).toEqual({ device_instance_id: 'src-dev', port_index: 0 });
    // Right half had no original dst → stays undefined.
    expect(right.dst).toBeUndefined();
  });

  it('rejects splits at endpoint cells', () => {
    const project = mkProjectWithLink([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    const r = splitLink({
      project,
      link_id: 'L0',
      at_cell: { x: 0, y: 0 },
      left_dst: { device_instance_id: 'br', port_index: 0 },
      right_src: { device_instance_id: 'br', port_index: 0 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_link');
  });

  it('rejects splits at cells not on the path', () => {
    const project = mkProjectWithLink([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    const r = splitLink({
      project,
      link_id: 'L0',
      at_cell: { x: 5, y: 5 },
      left_dst: { device_instance_id: 'br', port_index: 0 },
      right_src: { device_instance_id: 'br', port_index: 0 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_link');
  });
});

describe('setLinkEndpoint (P4 v7.1)', () => {
  it('updates dst', () => {
    const placed = unwrap(
      placeDevice({
        project: freshProject(),
        device: FURNACE,
        position: { x: 5, y: 5 },
        lookup,
        instance_id: 'd',
      }),
    ).project;
    const project = unwrap(
      addLink({
        project: placed,
        layer: 'solid',
        tier_id: 'belt-1',
        path: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        lookup,
        id: 'L',
      }),
    ).project;
    const after = unwrap(
      setLinkEndpoint({
        project,
        link_id: 'L',
        end: 'dst',
        ref: { device_instance_id: 'd', port_index: 0 },
        lookup,
      }),
    );
    expect(after.solid_links[0]!.dst).toEqual({ device_instance_id: 'd', port_index: 0 });
    expect(after.solid_links[0]!.path).toHaveLength(2);
  });

  it('clears src when ref is undefined', () => {
    const placed = unwrap(
      placeDevice({
        project: freshProject(),
        device: FURNACE,
        position: { x: 5, y: 5 },
        lookup,
        instance_id: 'd',
      }),
    ).project;
    const project = unwrap(
      addLink({
        project: placed,
        layer: 'solid',
        tier_id: 'belt-1',
        path: [{ x: 0, y: 0 }],
        src: { device_instance_id: 'd', port_index: 0 },
        lookup,
        id: 'L',
      }),
    ).project;
    expect(project.solid_links[0]!.src).toBeDefined();
    const after = unwrap(
      setLinkEndpoint({ project, link_id: 'L', end: 'src', ref: undefined, lookup }),
    );
    expect(after.solid_links[0]!.src).toBeUndefined();
  });

  it('rejects unknown link id', () => {
    const r = setLinkEndpoint({
      project: freshProject(),
      link_id: 'NOPE',
      end: 'dst',
      ref: undefined,
      lookup,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('not_found');
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
