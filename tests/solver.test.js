import test from 'node:test';
import assert from 'node:assert/strict';
import { solveThroughput } from '../src/solver.js';

const bundle = {
  devices: [
    { id: 'smelter-1', displayName: 'Smelter', width: 3, height: 2, powerDraw: 80, requiresPower: true, recipes: ['smelt'] },
    { id: 'assembler-1', displayName: 'Assembler', width: 3, height: 3, powerDraw: 120, requiresPower: true, recipes: ['battery'] },
  ],
  recipes: [
    { id: 'smelt', displayName: 'Smelt', cycleSeconds: 30, inputs: [{ itemId: 'ore', qtyPerCycle: 2 }], outputs: [{ itemId: 'ingot', qtyPerCycle: 1 }], compatibleDevices: ['smelter-1'], regions: ['wuling'] },
    { id: 'battery', displayName: 'Battery', cycleSeconds: 60, inputs: [{ itemId: 'ingot', qtyPerCycle: 3 }, { itemId: 'water', qtyPerCycle: 1 }], outputs: [{ itemId: 'battery', qtyPerCycle: 1 }], compatibleDevices: ['assembler-1'], regions: ['wuling'] },
  ],
  items: [],
  regions: [{ id: 'wuling', plotDefaultSize: { width: 90, height: 90 }, availableTechTiers: ['t1'] }],
};

test('solveThroughput computes machine count, raw materials, power and footprint', () => {
  const result = solveThroughput({ itemId: 'battery', ratePerMinute: 6, regionId: 'wuling' }, bundle);
  assert.equal(result.nodes.find((n) => n.recipeId === 'battery')?.machineCount, 6);
  assert.equal(result.nodes.find((n) => n.recipeId === 'smelt')?.machineCount, 9);
  assert.ok(Math.abs(result.rawInputs.ore - 36) < 1e-6);
  assert.ok(Math.abs(result.rawInputs.water - 6) < 1e-6);
  assert.equal(result.totalPowerDraw, 1440);
  assert.equal(result.totalFootprint, 108);
});
