import test from 'node:test';
import assert from 'node:assert/strict';
import { runDrc } from '../src/drc.js';

const base = {
  unpoweredDeviceCount: 0,
  powerDeficit: 0,
  unconnectedRequiredPorts: 0,
  outputToOutputEdges: 0,
  wrongLayerEdges: 0,
  pairedOppositeViolations: 0,
  overBeltCapacityEdges: 0,
  beltSameLayerCollisions: 0,
  beltCrossingsOverOneBridge: 0,
  overPipeCapacityEdges: 0,
  pipeSameLayerCollisions: 0,
  pipeInfraOnBelt: 0,
  beltInfraOnPipe: 0,
  enteredDeviceNonPortCount: 0,
  outOfRegionBoundsDevices: 0,
  lockedTechDevices: 0,
  fullStorageNoDrain: 0,
};

const checks = [
  ['unpoweredDeviceCount', 'POWER_001'],
  ['powerDeficit', 'POWER_002'],
  ['unconnectedRequiredPorts', 'PORT_001'],
  ['outputToOutputEdges', 'PORT_002'],
  ['wrongLayerEdges', 'PORT_003'],
  ['pairedOppositeViolations', 'PORT_004'],
  ['overBeltCapacityEdges', 'BELT_001'],
  ['beltSameLayerCollisions', 'BELT_CROSS_001'],
  ['beltCrossingsOverOneBridge', 'BELT_CROSS_DELAY_001'],
  ['overPipeCapacityEdges', 'PIPE_001'],
  ['pipeSameLayerCollisions', 'PIPE_CROSS_001'],
  ['pipeInfraOnBelt', 'LAYER_CROSS_001'],
  ['beltInfraOnPipe', 'LAYER_CROSS_002'],
  ['enteredDeviceNonPortCount', 'LAYER_CROSS_003'],
  ['outOfRegionBoundsDevices', 'REGION_001'],
  ['lockedTechDevices', 'TECH_001'],
  ['fullStorageNoDrain', 'STORAGE_001'],
];

for (const [field, expectedId] of checks) {
  test(`runDrc emits ${expectedId}`, () => {
    const ctx = { ...base, [field]: 1 };
    const ids = runDrc(ctx).map((m) => m.id);
    assert.equal(ids.includes(expectedId), true);
  });
}
