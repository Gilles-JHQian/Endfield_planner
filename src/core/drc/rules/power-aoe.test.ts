import { describe, expect, it } from 'vitest';
import { runDrc } from '../run.ts';
import { lookupFrom, mkBundle, mkDevice, mkProject } from '../fixtures.ts';
import type { PlacedDevice } from '@core/domain/types.ts';

const POLE = mkDevice({
  id: 'power-pole',
  footprint: { width: 2, height: 2 },
  requires_power: false,
  power_aoe: { kind: 'square_centered', edge: 12, purpose: 'device_supply' },
});
const RELAY = mkDevice({
  id: 'relay',
  footprint: { width: 3, height: 3 },
  requires_power: false,
  power_aoe: { kind: 'square_centered', edge: 7, purpose: 'pole_link' },
});
const FURNACE = mkDevice({
  id: 'furnace',
  footprint: { width: 3, height: 3 },
  requires_power: true,
  power_draw: 100,
});
const NO_POWER_NEEDED = mkDevice({
  id: 'storage',
  footprint: { width: 2, height: 2 },
  requires_power: false,
});

function placed(
  instance_id: string,
  device_id: string,
  position: { x: number; y: number },
): PlacedDevice {
  return { instance_id, device_id, position, rotation: 0, recipe_id: null };
}

describe('POWER_001', () => {
  it('is skipped when no device has device_supply AoE', () => {
    const bundle = mkBundle({ devices: [FURNACE] });
    const project = {
      ...mkProject(),
      devices: [placed('a', 'furnace', { x: 5, y: 5 })],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const skipped = report.skipped.find((s) => s.rule_id === 'POWER_001');
    expect(skipped?.missing).toContain('power_aoe_supply');
    expect(report.issues.filter((i) => i.rule_id === 'POWER_001')).toEqual([]);
  });

  it('flags a powered device outside every supply pole AoE', () => {
    const bundle = mkBundle({ devices: [POLE, FURNACE] });
    // Pole at (0,0): footprint occupies (0,0)-(1,1), center (1,1).
    // 12-edge AoE covers x∈[-5,7], y∈[-5,7]. Furnace at (10,10) is far outside.
    const project = {
      ...mkProject(),
      devices: [
        placed('p', 'power-pole', { x: 0, y: 0 }),
        placed('f', 'furnace', { x: 10, y: 10 }),
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'POWER_001');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.device_instance_id).toBe('f');
  });

  it('does not flag a powered device fully inside the AoE', () => {
    const bundle = mkBundle({ devices: [POLE, FURNACE] });
    const project = {
      ...mkProject(),
      devices: [placed('p', 'power-pole', { x: 5, y: 5 }), placed('f', 'furnace', { x: 4, y: 4 })],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'POWER_001')).toEqual([]);
  });

  it('does not flag a non-powered device', () => {
    const bundle = mkBundle({ devices: [POLE, NO_POWER_NEEDED] });
    const project = {
      ...mkProject(),
      devices: [
        placed('p', 'power-pole', { x: 5, y: 5 }),
        placed('s', 'storage', { x: 15, y: 15 }),
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'POWER_001')).toEqual([]);
  });

  it('does not treat pole_link relays as supply sources', () => {
    // Bundle has a supply pole declared (so the rule is enabled), but only the
    // relay is placed near the furnace. Furnace must still flag because the
    // relay only extends pole connectivity, not device supply.
    const bundle = mkBundle({ devices: [POLE, RELAY, FURNACE] });
    const project = {
      ...mkProject(),
      devices: [placed('r', 'relay', { x: 5, y: 5 }), placed('f', 'furnace', { x: 5, y: 5 })],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'POWER_001');
    expect(issues).toHaveLength(1);
  });
});
