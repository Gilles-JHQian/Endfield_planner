import test from 'node:test';
import assert from 'node:assert/strict';
import { runDrc } from '../src/drc.js';

function baseLayout() {
  return {
    devices: [{ id: 'd1', x: 1, y: 1, width: 2, height: 2, requiresPower: true, powerDraw: 100, powered: true, inBounds: true, techUnlocked: true, requiredInputsConnected: true }],
    links: [],
    bridges: [],
    powerSupply: 200,
    regionBounds: { width: 20, height: 20 },
  };
}

test('runDrc covers every required P0 rule id', () => {
  const layout = baseLayout();
  layout.devices[0].powered = false;
  layout.devices[0].inBounds = false;
  layout.devices[0].techUnlocked = false;
  layout.devices[0].requiredInputsConnected = false;
  layout.powerSupply = 1;
  layout.links.push(
    { id: 'l1', layer: 'solid', from: 'a:solid:out', to: 'b:solid:out', throughput: 61, limit: 60, hasValidMerger: false, throughBridgeCount: 2, crossesSameLayerWithoutBridge: true, crossesOtherLayerInfrastructure: 'pipe', entersDeviceFootprintWithoutPort: true },
    { id: 'l2', layer: 'fluid', from: 'a:solid:out', to: 'b:fluid:in', throughput: 121, limit: 120, crossesSameLayerWithoutBridge: true, crossesOtherLayerInfrastructure: 'belt' },
  );
  layout.bridges.push({ id: 'b1', validPairedOpposite: false, at: { x: 3, y: 3 } });
  layout.storageFull = true;

  const ids = new Set(runDrc(layout).map((item) => item.ruleId));
  assert.deepEqual(ids, new Set([
    'POWER_001', 'POWER_002',
    'PORT_001', 'PORT_002', 'PORT_003', 'PORT_004',
    'BELT_001', 'BELT_CROSS_001', 'BELT_CROSS_DELAY_001',
    'PIPE_001', 'PIPE_CROSS_001',
    'LAYER_CROSS_001', 'LAYER_CROSS_002', 'LAYER_CROSS_003',
    'REGION_001', 'TECH_001', 'STORAGE_001',
  ]));
});
