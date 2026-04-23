import test from 'node:test';
import assert from 'node:assert/strict';
import { diffDataBundles, loadDataBundle } from '../src/data-layer.js';

test('loadDataBundle loads versioned files', async () => {
  const bundle = await loadDataBundle('1.2');
  assert.equal(bundle.devices.length > 0, true);
  assert.equal(bundle.recipes.length > 0, true);
});

test('diffDataBundles reports changed and missing definitions', async () => {
  const diff = await diffDataBundles('1.2', '1.1');
  assert.equal(diff.missingDevices.includes('furnance-1'), true);
  assert.equal(diff.changedDevices.includes('miner-1'), true);
  assert.equal(diff.missingRecipes.includes('recipe-ingot'), true);
});
