function issue(ruleId, severity, message, x = 0, y = 0) {
  return { ruleId, severity, message, at: { x, y } };
}

export function runDrc(layout) {
  const issues = [];

  for (const d of layout.devices) {
    if (d.requiresPower && !d.powered) issues.push(issue('POWER_001', 'error', 'Device outside power pole square.', d.x, d.y));
    if (!d.inBounds) issues.push(issue('REGION_001', 'error', 'Device outside plot bounds.', d.x, d.y));
    if (!d.techUnlocked) issues.push(issue('TECH_001', 'warning', 'Device tech prereq not unlocked.', d.x, d.y));
    if (!d.requiredInputsConnected) issues.push(issue('PORT_001', 'error', 'Required input port not connected.', d.x, d.y));
  }

  const powerDraw = layout.devices.reduce((sum, d) => sum + (d.requiresPower ? d.powerDraw : 0), 0);
  if (powerDraw > layout.powerSupply) issues.push(issue('POWER_002', 'error', 'Total power draw exceeds supply.'));

  for (const link of layout.links) {
    if (link.from.endsWith(':out') && link.to.endsWith(':out') && !link.hasValidMerger) issues.push(issue('PORT_002', 'error', 'Two outputs connected without valid merger.'));

    const fromLayer = link.from.includes('fluid') ? 'fluid' : 'solid';
    const toLayer = link.to.includes('fluid') ? 'fluid' : 'solid';
    if (fromLayer !== toLayer || fromLayer !== link.layer) issues.push(issue('PORT_003', 'error', 'Solid/fluid layer mismatch connection.'));

    if (link.layer === 'solid' && link.throughput > link.limit) issues.push(issue('BELT_001', 'error', 'Belt throughput exceeds tier limit.'));
    if (link.layer === 'fluid' && link.throughput > link.limit) issues.push(issue('PIPE_001', 'error', 'Pipe throughput exceeds tier limit.'));
    if (link.layer === 'solid' && link.crossesSameLayerWithoutBridge) issues.push(issue('BELT_CROSS_001', 'error', 'Solid crossing without logistics bridge.'));
    if (link.layer === 'fluid' && link.crossesSameLayerWithoutBridge) issues.push(issue('PIPE_CROSS_001', 'error', 'Fluid crossing without pipe bridge.'));
    if (link.layer === 'solid' && (link.throughBridgeCount ?? 0) > 1) issues.push(issue('BELT_CROSS_DELAY_001', 'warning', 'Critical path crosses >1 logistics bridge.'));
    if (link.crossesOtherLayerInfrastructure === 'pipe') issues.push(issue('LAYER_CROSS_001', 'error', 'Pipe infrastructure overlaps a belt.'));
    if (link.crossesOtherLayerInfrastructure === 'belt') issues.push(issue('LAYER_CROSS_002', 'error', 'Belt infrastructure overlaps a pipe.'));
    if (link.entersDeviceFootprintWithoutPort) issues.push(issue('LAYER_CROSS_003', 'error', 'Link enters device footprint not at a port.'));
  }

  for (const bridge of layout.bridges) {
    if (!bridge.validPairedOpposite) issues.push(issue('PORT_004', 'error', 'Bridge paired_opposite port constraint violated.', bridge.at.x, bridge.at.y));
  }

  if (layout.storageFull) issues.push(issue('STORAGE_001', 'info', 'Sink storage full; no drain configured.'));
  return issues;
}
