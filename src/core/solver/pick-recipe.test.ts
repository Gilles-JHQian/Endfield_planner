import { describe, expect, it } from 'vitest';
import type { Recipe } from '@core/data-loader/index.ts';
import { pickRecipe } from './pick-recipe.ts';

const r = (overrides: Partial<Recipe> & { id: string }): Recipe => ({
  display_name_zh_hans: overrides.id,
  cycle_seconds: 1,
  inputs: [],
  outputs: [],
  compatible_devices: ['x'],
  ...overrides,
});

describe('pickRecipe', () => {
  it('returns null when no candidates', () => {
    expect(pickRecipe([], { item_id: 'x', rate_per_minute: 1 }, {})).toBeNull();
  });

  it('alphabetical (default) picks the lowest id when scores tie', () => {
    const a = r({ id: 'recipe-b' });
    const b = r({ id: 'recipe-a' });
    const picked = pickRecipe([a, b], { item_id: 'x', rate_per_minute: 1 }, {});
    expect(picked?.id).toBe('recipe-a');
  });

  it('fewest_inputs picks the recipe with the smallest input count', () => {
    const a = r({
      id: 'big',
      inputs: [
        { item_id: 'x', qty_per_cycle: 1 },
        { item_id: 'y', qty_per_cycle: 1 },
      ],
    });
    const b = r({ id: 'small', inputs: [{ item_id: 'x', qty_per_cycle: 1 }] });
    const picked = pickRecipe(
      [a, b],
      { item_id: 'x', rate_per_minute: 1 },
      { recipe_preference: 'fewest_inputs' },
    );
    expect(picked?.id).toBe('small');
  });

  it('region filter excludes recipes whose regions[] does not include target.region_id', () => {
    const wuling_only = r({ id: 'recipe-w', regions: ['wuling'] });
    const both = r({ id: 'recipe-b', regions: ['valley_4', 'wuling'] });
    const picked = pickRecipe(
      [wuling_only, both],
      { item_id: 'x', rate_per_minute: 1, region_id: 'valley_4' },
      {},
    );
    expect(picked?.id).toBe('recipe-b');
  });

  it('region filter passes recipes with no regions[] (interpreted as universal)', () => {
    const universal = r({ id: 'recipe-u' });
    const picked = pickRecipe(
      [universal],
      { item_id: 'x', rate_per_minute: 1, region_id: 'anywhere' },
      {},
    );
    expect(picked?.id).toBe('recipe-u');
  });
});
