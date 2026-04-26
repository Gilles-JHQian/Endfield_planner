import { describe, expect, it } from 'vitest';
import { runDrc } from '../run.ts';
import { lookupFrom, mkBundle, mkDevice, mkProject } from '../fixtures.ts';
import type { PlacedDevice, SolidLink, FluidLink } from '@core/domain/types.ts';
import type { Recipe } from '@core/data-loader/types.ts';

const FAST_RECIPE: Recipe = {
  id: 'fast-iron',
  display_name_zh_hans: '快速炼铁',
  cycle_seconds: 1,
  inputs: [{ item_id: 'iron-ore', qty_per_cycle: 1 }],
  outputs: [{ item_id: 'iron-ingot', qty_per_cycle: 100 }], // 6000/min — way over tier
  compatible_devices: ['turbo-furnace'],
};
const SLOW_RECIPE: Recipe = {
  id: 'slow-iron',
  display_name_zh_hans: '慢炼铁',
  cycle_seconds: 10,
  inputs: [],
  outputs: [{ item_id: 'iron-ingot', qty_per_cycle: 4 }], // 24/min — under tier-1
  compatible_devices: ['turbo-furnace'],
};

const TURBO = mkDevice({
  id: 'turbo-furnace',
  recipes: [FAST_RECIPE.id, SLOW_RECIPE.id],
  power_aoe: { kind: 'square_centered', edge: 12, purpose: 'device_supply' },
});
const FAST_FLUID: Recipe = {
  id: 'fast-fluid',
  display_name_zh_hans: '快速产液',
  cycle_seconds: 1,
  inputs: [],
  outputs: [{ item_id: 'water', qty_per_cycle: 200 }], // 12000/min over pipe cap 120
  compatible_devices: ['extractor'],
};
const EXTRACTOR = mkDevice({
  id: 'extractor',
  recipes: [FAST_FLUID.id],
  has_fluid_interface: true,
  power_aoe: { kind: 'square_centered', edge: 12, purpose: 'device_supply' },
});

const placed = (instance_id: string, device_id: string, recipe_id: string): PlacedDevice => ({
  instance_id,
  device_id,
  position: { x: 0, y: 0 },
  rotation: 0,
  recipe_id,
});

const solidLink = (id: string, src_id: string): SolidLink => ({
  id,
  layer: 'solid',
  tier_id: 'belt-1',
  path: [{ x: 0, y: 1 }],
  src: { device_instance_id: src_id, port_index: 0 },
});
const fluidLink = (id: string, src_id: string): FluidLink => ({
  id,
  layer: 'fluid',
  tier_id: 'pipe-wuling',
  path: [{ x: 0, y: 1 }],
  src: { device_instance_id: src_id, port_index: 0 },
});

describe('BELT_001', () => {
  it('flags a belt whose source recipe exceeds tier capacity', () => {
    const bundle = mkBundle({
      devices: [TURBO],
      recipes: [FAST_RECIPE, SLOW_RECIPE],
      transport_tiers: {
        solid_belts: [{ tier: 1, id: 'belt-1', items_per_minute: 30 }],
        fluid_pipes: [],
      },
    });
    const project = {
      ...mkProject(),
      devices: [placed('a', 'turbo-furnace', 'fast-iron')],
      solid_links: [solidLink('l1', 'a')],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'BELT_001');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.link_id).toBe('l1');
  });

  it('does not flag a belt within capacity', () => {
    const bundle = mkBundle({
      devices: [TURBO],
      recipes: [FAST_RECIPE, SLOW_RECIPE],
      transport_tiers: {
        solid_belts: [{ tier: 1, id: 'belt-1', items_per_minute: 30 }],
        fluid_pipes: [],
      },
    });
    const project = {
      ...mkProject(),
      devices: [placed('a', 'turbo-furnace', 'slow-iron')],
      solid_links: [solidLink('l1', 'a')],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'BELT_001')).toEqual([]);
  });

  it('emits nothing for links with no src/dst attached', () => {
    const bundle = mkBundle({
      devices: [TURBO],
      recipes: [FAST_RECIPE],
      transport_tiers: {
        solid_belts: [{ tier: 1, id: 'belt-1', items_per_minute: 30 }],
        fluid_pipes: [],
      },
    });
    const project = {
      ...mkProject(),
      devices: [placed('a', 'turbo-furnace', 'fast-iron')],
      solid_links: [
        { id: 'l1', layer: 'solid', tier_id: 'belt-1', path: [{ x: 0, y: 1 }] } as SolidLink,
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'BELT_001')).toEqual([]);
  });

  it('is skipped when transport_tiers.solid_belts is empty', () => {
    const bundle = mkBundle({ transport_tiers: { solid_belts: [], fluid_pipes: [] } });
    const project = mkProject();
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const skipped = report.skipped.find((s) => s.rule_id === 'BELT_001');
    expect(skipped?.missing).toContain('transport_tiers');
  });
});

describe('PIPE_001', () => {
  it('flags a pipe whose source recipe exceeds tier capacity', () => {
    const bundle = mkBundle({
      devices: [EXTRACTOR],
      recipes: [FAST_FLUID],
      transport_tiers: {
        solid_belts: [],
        fluid_pipes: [{ tier: 1, id: 'pipe-wuling', units_per_minute: 120 }],
      },
    });
    const project = {
      ...mkProject(),
      devices: [placed('a', 'extractor', 'fast-fluid')],
      fluid_links: [fluidLink('l1', 'a')],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'PIPE_001');
    expect(issues).toHaveLength(1);
  });
});
