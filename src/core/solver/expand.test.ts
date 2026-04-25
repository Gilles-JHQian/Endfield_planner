import { describe, expect, it } from 'vitest';
import type { DataBundle, Recipe } from '@core/data-loader/index.ts';
import { buildRecipeIndex } from './types.ts';
import { expand } from './expand.ts';

const minimalBundle = (recipes: Recipe[]): DataBundle => ({
  version: 'test',
  devices: [],
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
});

const r = (overrides: Partial<Recipe> & { id: string }): Recipe => ({
  id: overrides.id,
  display_name_zh_hans: overrides.id,
  cycle_seconds: 1,
  inputs: [],
  outputs: [{ item_id: 'unspecified', qty_per_cycle: 1 }],
  compatible_devices: ['x'],
  ...overrides,
});

describe('expand', () => {
  it('handles a single-recipe demand', () => {
    const bundle = minimalBundle([
      r({
        id: 'recipe-x',
        cycle_seconds: 60,
        outputs: [{ item_id: 'x', qty_per_cycle: 1 }],
      }),
    ]);
    const idx = buildRecipeIndex(bundle);
    const result = expand(idx, { item_id: 'x', rate_per_minute: 1 }, {});
    // 1 unit / minute, 60s cycle, 1 unit per cycle → 1 run/min, no inputs.
    expect(result.runs_by_recipe.get('recipe-x')).toBeCloseTo(1);
    expect(result.unproduced.size).toBe(0);
    expect(result.cycles.size).toBe(0);
  });

  it('expands a 2-step chain (B from A) with correct intermediate rate', () => {
    const bundle = minimalBundle([
      r({
        id: 'recipe-b',
        cycle_seconds: 60,
        inputs: [{ item_id: 'a', qty_per_cycle: 2 }],
        outputs: [{ item_id: 'b', qty_per_cycle: 1 }],
      }),
      r({
        id: 'recipe-a',
        cycle_seconds: 60,
        outputs: [{ item_id: 'a', qty_per_cycle: 1 }],
      }),
    ]);
    const idx = buildRecipeIndex(bundle);
    const result = expand(idx, { item_id: 'b', rate_per_minute: 3 }, {});
    // Need 3 b/min → 3 runs of recipe-b → 6 a/min → 6 runs of recipe-a.
    expect(result.runs_by_recipe.get('recipe-b')).toBeCloseTo(3);
    expect(result.runs_by_recipe.get('recipe-a')).toBeCloseTo(6);
  });

  it('marks items with no producing recipe as unproduced', () => {
    const bundle = minimalBundle([
      r({
        id: 'recipe-b',
        inputs: [{ item_id: 'raw-ore', qty_per_cycle: 1 }],
        outputs: [{ item_id: 'b', qty_per_cycle: 1 }],
      }),
    ]);
    const idx = buildRecipeIndex(bundle);
    const result = expand(idx, { item_id: 'b', rate_per_minute: 1 }, {});
    expect(result.unproduced.has('raw-ore')).toBe(true);
  });

  it('detects a cycle and stops without infinite recursion', () => {
    const bundle = minimalBundle([
      r({
        id: 'recipe-a',
        inputs: [{ item_id: 'b', qty_per_cycle: 1 }],
        outputs: [{ item_id: 'a', qty_per_cycle: 1 }],
      }),
      r({
        id: 'recipe-b',
        inputs: [{ item_id: 'a', qty_per_cycle: 1 }],
        outputs: [{ item_id: 'b', qty_per_cycle: 1 }],
      }),
    ]);
    const idx = buildRecipeIndex(bundle);
    const result = expand(idx, { item_id: 'a', rate_per_minute: 1 }, {});
    // Both recipes get partial expansion; cycle reported for the one that triggered the guard.
    expect(result.runs_by_recipe.size).toBeGreaterThan(0);
    expect(result.cycles.size).toBeGreaterThan(0);
  });

  it('accumulates additively when the same recipe is reached through two paths', () => {
    // A → C and B → C; demand from A and B both pull from recipe-c.
    // All cycles 60s for arithmetic that's easy to read.
    const bundle = minimalBundle([
      r({
        id: 'recipe-a',
        cycle_seconds: 60,
        inputs: [{ item_id: 'c', qty_per_cycle: 1 }],
        outputs: [{ item_id: 'a', qty_per_cycle: 1 }],
      }),
      r({
        id: 'recipe-b',
        cycle_seconds: 60,
        inputs: [
          { item_id: 'c', qty_per_cycle: 1 },
          { item_id: 'a', qty_per_cycle: 1 },
        ],
        outputs: [{ item_id: 'b', qty_per_cycle: 1 }],
      }),
      r({
        id: 'recipe-c',
        cycle_seconds: 60,
        outputs: [{ item_id: 'c', qty_per_cycle: 1 }],
      }),
    ]);
    const idx = buildRecipeIndex(bundle);
    const result = expand(idx, { item_id: 'b', rate_per_minute: 1 }, {});
    // 1 b → 1 c (direct) + 1 a → 1 c (via recipe-a) = 2 c demand.
    expect(result.runs_by_recipe.get('recipe-c')).toBeCloseTo(2);
  });
});
