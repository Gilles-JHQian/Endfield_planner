import { describe, expect, it } from 'vitest';
import { runDrc } from '../run.ts';
import { lookupFrom, mkBundle, mkDevice, mkProject } from '../fixtures.ts';
import type { PlacedDevice } from '@core/domain/types.ts';

const placed = (instance_id: string, device_id: string): PlacedDevice => ({
  instance_id,
  device_id,
  position: { x: 0, y: 0 },
  rotation: 0,
  recipe_id: null,
});

describe('POWER_002', () => {
  it('is skipped when no device declares power_supply', () => {
    const consumer = mkDevice({ id: 'consumer', power_draw: 100, requires_power: true });
    const bundle = mkBundle({ devices: [consumer] });
    const project = { ...mkProject(), devices: [placed('a', 'consumer')] };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const skipped = report.skipped.find((s) => s.rule_id === 'POWER_002');
    expect(skipped?.missing).toContain('power_supply');
  });

  it('flags when total demand of COVERED devices exceeds supply', () => {
    // P3 update: only AoE-covered devices count toward demand. Add a supply
    // pole co-located with the heavy consumer so it counts.
    const pole = mkDevice({
      id: 'pole',
      footprint: { width: 2, height: 2 },
      power_aoe: { kind: 'square_centered', edge: 12, purpose: 'device_supply' },
    });
    const generator = mkDevice({ id: 'generator', power_supply: 200 });
    const heavy = mkDevice({ id: 'heavy', power_draw: 500, requires_power: true });
    const bundle = mkBundle({ devices: [pole, generator, heavy] });
    const project = {
      ...mkProject(),
      devices: [placed('p', 'pole'), placed('g', 'generator'), placed('h', 'heavy')],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'POWER_002');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message_en).toContain('500');
    expect(issues[0]!.message_en).toContain('200');
  });

  it('does NOT flag uncovered consumers (they are not running)', () => {
    // No supply pole → heavy consumer is uncovered → its demand doesn't count.
    const generator = mkDevice({ id: 'generator', power_supply: 200 });
    const heavy = mkDevice({ id: 'heavy', power_draw: 500, requires_power: true });
    const bundle = mkBundle({ devices: [generator, heavy] });
    const project = {
      ...mkProject(),
      devices: [placed('g', 'generator'), placed('h', 'heavy')],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'POWER_002')).toEqual([]);
  });

  it('does not flag when supply meets demand', () => {
    const pole = mkDevice({
      id: 'pole',
      footprint: { width: 2, height: 2 },
      power_aoe: { kind: 'square_centered', edge: 12, purpose: 'device_supply' },
    });
    const generator = mkDevice({ id: 'generator', power_supply: 1000 });
    const consumer = mkDevice({ id: 'consumer', power_draw: 200, requires_power: true });
    const bundle = mkBundle({ devices: [pole, generator, consumer] });
    const project = {
      ...mkProject(),
      devices: [placed('p', 'pole'), placed('g', 'generator'), placed('c', 'consumer')],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'POWER_002')).toEqual([]);
  });
});
