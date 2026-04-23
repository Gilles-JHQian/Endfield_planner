export function runDrc(ctx) {
  const out = [];
  push(out, 'POWER_001', 'error', ctx.unpoweredDeviceCount > 0, 'device outside power pole square');
  push(out, 'POWER_002', 'error', ctx.powerDeficit > 0, 'total power draw exceeds supply');
  push(out, 'PORT_001', 'error', ctx.unconnectedRequiredPorts > 0, 'required input port not connected');
  push(out, 'PORT_002', 'error', ctx.outputToOutputEdges > 0, 'two outputs connected without merger');
  push(out, 'PORT_003', 'error', ctx.wrongLayerEdges > 0, 'fluid port connected to solid link or vice versa');
  push(out, 'PORT_004', 'error', ctx.pairedOppositeViolations > 0, 'bridge violates paired_opposite');
  push(out, 'BELT_001', 'error', ctx.overBeltCapacityEdges > 0, 'belt throughput exceeds tier limit');
  push(out, 'BELT_CROSS_001', 'error', ctx.beltSameLayerCollisions > 0, 'same-cell belt crossing without logistics bridge');
  push(out, 'BELT_CROSS_DELAY_001', 'warning', ctx.beltCrossingsOverOneBridge > 0, 'critical path uses more than one logistics bridge');
  push(out, 'PIPE_001', 'error', ctx.overPipeCapacityEdges > 0, 'pipe throughput exceeds cap');
  push(out, 'PIPE_CROSS_001', 'error', ctx.pipeSameLayerCollisions > 0, 'same-cell pipe crossing without pipe bridge');
  push(out, 'LAYER_CROSS_001', 'error', ctx.pipeInfraOnBelt > 0, 'pipe infrastructure overlaps belt');
  push(out, 'LAYER_CROSS_002', 'error', ctx.beltInfraOnPipe > 0, 'belt infrastructure overlaps pipe');
  push(out, 'LAYER_CROSS_003', 'error', ctx.enteredDeviceNonPortCount > 0, 'transport enters device via non-port cell');
  push(out, 'REGION_001', 'error', ctx.outOfRegionBoundsDevices > 0, 'device outside plot bounds');
  push(out, 'TECH_001', 'warning', ctx.lockedTechDevices > 0, 'device used without unlocked tech');
  push(out, 'STORAGE_001', 'info', ctx.fullStorageNoDrain > 0, 'sink storage full with no drain');
  return out;
}

function push(messages, id, severity, triggered, message) {
  if (triggered) {
    messages.push({ id, severity, message });
  }
}
