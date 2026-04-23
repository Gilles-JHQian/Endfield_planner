import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDataBundle } from '../src/data-layer.js';
import { solveThroughput } from '../src/solver.js';

test('solveThroughput computes machine counts and aggregates', async () => {
  const bundle = await loadDataBundle('1.2');
  const result = solveThroughput(bundle, {
    item_id: 'item-ingot',
    rate_per_minute: 6,
    region_id: 'valley_4',
  });

  assert.equal(result.nodes.some((n) => n.recipe_id === 'recipe-ingot'), true);
  assert.equal(result.nodes.some((n) => n.recipe_id === 'recipe-ore'), true);
  assert.equal(result.total_power_draw > 0, true);
  assert.equal(result.total_footprint > 0, true);
  assert.deepEqual(result.raw_inputs, {});
});
