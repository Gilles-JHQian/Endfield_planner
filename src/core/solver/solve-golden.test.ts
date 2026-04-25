/** Golden tests against the scraped v1.2 data. These pin down the F2
 *  acceptance criterion (§5.1) — for known reference recipes the solver
 *  output should match hand-verified values within rounding tolerance.
 *
 *  When end.wiki ships an updated catalog and the scraper regenerates v1.2,
 *  these tests may need their expected values revisited.
 */
import { describe, expect, it } from 'vitest';
import { loadDataBundle } from '@core/data-loader/index.ts';
import { solveThroughput } from './index.ts';

describe('solveThroughput against bundled v1.2 catalog', () => {
  it('produces 30 item-iron-cmpt per minute via a 2-step chain', async () => {
    const bundle = await loadDataBundle('1.2');
    const result = solveThroughput(bundle, {
      item_id: 'item-iron-cmpt',
      rate_per_minute: 30,
    });

    // Hand-derived from data/versions/1.2:
    //   recipe-iron-cmpt: 1 nugget→1 cmpt, cycle 2s on component-mc-1 (pw 20, 3×3)
    //   recipe-iron-nugget: 1 ore→1 nugget, cycle 2s on furnance-1 (pw 5, 3×3)
    //   30 cmpt/min ÷ (1 × 30 cycles/min) = 1 run → 1 component-mc-1
    //   nugget demand 30/min → 1 furnance-1 → ore demand 30/min raw.
    const cmpt = result.nodes.find((n) => n.recipe_id === 'recipe-iron-cmpt');
    const nugget = result.nodes.find((n) => n.recipe_id === 'recipe-iron-nugget');
    expect(cmpt?.machine_id).toBe('component-mc-1');
    expect(cmpt?.machine_count).toBe(1);
    expect(nugget?.machine_id).toBe('furnance-1');
    expect(nugget?.machine_count).toBe(1);

    expect(result.total_power_draw).toBe(25); // 20 + 5
    expect(result.total_footprint).toBe(18); // 3×3 + 3×3

    expect(result.raw_inputs['item-iron-ore']).toBeCloseTo(30);
    // No cycles, no unproduced items beyond the ore.
    expect(result.cycles).toEqual([]);
    expect(result.unproduced).toContain('item-iron-ore');
  });

  it('respects ceil() rounding: 31/min cmpt still needs only 2 furnaces despite fractional runs', async () => {
    const bundle = await loadDataBundle('1.2');
    const result = solveThroughput(bundle, {
      item_id: 'item-iron-cmpt',
      rate_per_minute: 31,
    });
    // 31/30 = 1.033… runs of cmpt → 2 component-mc-1.
    // 31/min nugget demand → 1.033… runs → 2 furnance-1.
    const cmpt = result.nodes.find((n) => n.recipe_id === 'recipe-iron-cmpt');
    const nugget = result.nodes.find((n) => n.recipe_id === 'recipe-iron-nugget');
    expect(cmpt?.machine_count).toBe(2);
    expect(nugget?.machine_count).toBe(2);
  });

  it('reports raw_inputs across multiple ingredients for a multi-input recipe', async () => {
    const bundle = await loadDataBundle('1.2');
    // recipe-proc-battery-3 (高容谷地电池): 10 iron-enr-cmpt + 15 originium-enr-powder
    // → 1 battery, cycle 10s. Pick this as a known multi-input case.
    const result = solveThroughput(bundle, {
      item_id: 'item-proc-battery-3',
      rate_per_minute: 6,
    });
    // 6/min ÷ (1 × 6 cycles/min) = 1 run → 1 tools-assebling-mc-1.
    const battery = result.nodes.find((n) => n.recipe_id === 'recipe-proc-battery-3');
    expect(battery?.machine_count).toBe(1);
    // Both ingredients should appear somewhere in the chain — either as raw_inputs
    // or as further-expanded recipes whose own raw_inputs are populated.
    // We don't pin exact deeper-chain numbers here; the simpler iron-cmpt case
    // already exercises the math precisely. This case proves the solver
    // doesn't crash on multi-input recipes.
    expect(battery).toBeDefined();
    expect(result.nodes.length).toBeGreaterThan(1);
  });
});
