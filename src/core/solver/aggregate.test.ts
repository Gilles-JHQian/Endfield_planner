import { describe, expect, it } from 'vitest';
import type { DataBundle, Device, Recipe } from '@core/data-loader/index.ts';
import { buildRecipeIndex } from './types.ts';
import { expand } from './expand.ts';
import { aggregate } from './aggregate.ts';

const dev = (overrides: Partial<Device> & { id: string }): Device => ({
  display_name_zh_hans: overrides.id,
  footprint: { width: 1, height: 1 },
  bandwidth: 1,
  power_draw: 0,
  requires_power: false,
  has_fluid_interface: false,
  io_ports: [],
  tech_prereq: [],
  category: 'basic_production',
  recipes: [],
  ...overrides,
});

const rec = (overrides: Partial<Recipe> & { id: string }): Recipe => ({
  display_name_zh_hans: overrides.id,
  cycle_seconds: 1,
  inputs: [],
  outputs: [],
  compatible_devices: ['x'],
  ...overrides,
});

const bundle = (devices: Device[], recipes: Recipe[]): DataBundle => ({
  version: 'test',
  devices,
  recipes,
  items: [],
  regions: [],
  crossing_rules: {
    same_layer_crossing: {
      solid: {
        allowed_without_component: false,
        crossing_component_id: 'x',
        latency_penalty: null,
      },
      fluid: {
        allowed_without_component: false,
        crossing_component_id: 'x',
        latency_penalty: null,
      },
    },
    bridge_port_constraint: 'paired_opposite',
    cross_layer_crossing: { default: 'allowed', exceptions: [] },
  },
  transport_tiers: { solid_belts: [], fluid_pipes: [] },
});

describe('aggregate', () => {
  it('rounds runs up to integer machine_count and applies power+footprint per machine', () => {
    const b = bundle(
      [
        dev({
          id: 'machine-1',
          power_draw: 10,
          requires_power: true,
          footprint: { width: 2, height: 3 },
        }),
      ],
      [
        rec({
          id: 'recipe-x',
          cycle_seconds: 60,
          outputs: [{ item_id: 'x', qty_per_cycle: 1 }],
          compatible_devices: ['machine-1'],
        }),
      ],
    );
    const idx = buildRecipeIndex(b);
    const exp = expand(idx, { item_id: 'x', rate_per_minute: 5 }, {});
    const agg = aggregate(b, idx, exp, { item_id: 'x', rate_per_minute: 5 });
    // 5/min, 60s cycle → 5 runs/min → 5 machines, power 50, footprint 30.
    const node = agg.nodes[0];
    expect(node?.machine_count).toBe(5);
    expect(node?.power_draw).toBe(50);
    expect(node?.footprint).toBe(30);
    expect(agg.total_power_draw).toBe(50);
    expect(agg.total_footprint).toBe(30);
  });

  it('rounds fractional runs up: 4.2 runs needs 5 machines', () => {
    const b = bundle(
      [dev({ id: 'm1', power_draw: 0, requires_power: false })],
      [
        rec({
          id: 'recipe-x',
          cycle_seconds: 60,
          outputs: [{ item_id: 'x', qty_per_cycle: 1 }],
          compatible_devices: ['m1'],
        }),
      ],
    );
    const idx = buildRecipeIndex(b);
    const exp = expand(idx, { item_id: 'x', rate_per_minute: 4.2 }, {});
    const agg = aggregate(b, idx, exp, { item_id: 'x', rate_per_minute: 4.2 });
    expect(agg.nodes[0]?.machine_count).toBe(5);
  });

  it('puts unproduced items into raw_inputs at the demanded rate', () => {
    const b = bundle(
      [dev({ id: 'm1' })],
      [
        rec({
          id: 'recipe-b',
          cycle_seconds: 60,
          inputs: [{ item_id: 'a', qty_per_cycle: 2 }],
          outputs: [{ item_id: 'b', qty_per_cycle: 1 }],
          compatible_devices: ['m1'],
        }),
      ],
    );
    const idx = buildRecipeIndex(b);
    const exp = expand(idx, { item_id: 'b', rate_per_minute: 3 }, {});
    const agg = aggregate(b, idx, exp, { item_id: 'b', rate_per_minute: 3 });
    // 3 b/min → 3 runs → 6 a/min raw demand.
    expect(agg.raw_inputs.a).toBeCloseTo(6);
  });

  it('reports byproducts when a recipe produces extras', () => {
    const b = bundle(
      [dev({ id: 'm1' })],
      [
        rec({
          id: 'recipe-bp',
          cycle_seconds: 60,
          outputs: [
            { item_id: 'main', qty_per_cycle: 1 },
            { item_id: 'side', qty_per_cycle: 2 },
          ],
          compatible_devices: ['m1'],
        }),
      ],
    );
    const idx = buildRecipeIndex(b);
    const exp = expand(idx, { item_id: 'main', rate_per_minute: 1 }, {});
    const agg = aggregate(b, idx, exp, { item_id: 'main', rate_per_minute: 1 });
    // 1 run/min produces 2 side; nothing consumes it → 2/min byproduct.
    expect(agg.byproducts.side).toBeCloseTo(2);
  });

  it('does not double-count the target item as a byproduct', () => {
    const b = bundle(
      [dev({ id: 'm1' })],
      [
        rec({
          id: 'recipe-x',
          cycle_seconds: 60,
          outputs: [{ item_id: 'x', qty_per_cycle: 1 }],
          compatible_devices: ['m1'],
        }),
      ],
    );
    const idx = buildRecipeIndex(b);
    const exp = expand(idx, { item_id: 'x', rate_per_minute: 1 }, {});
    const agg = aggregate(b, idx, exp, { item_id: 'x', rate_per_minute: 1 });
    expect(agg.byproducts.x).toBeUndefined();
  });
});
