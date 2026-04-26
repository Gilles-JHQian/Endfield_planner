import { describe, expect, it } from 'vitest';
import { runDrc } from './run.ts';
import { ALL_RULES } from './registry.ts';
import { lookupFrom, mkBundle, mkDevice, mkProject } from './fixtures.ts';

describe('runDrc engine', () => {
  it('produces no issues against an empty project + empty bundle', () => {
    const bundle = mkBundle();
    const report = runDrc(mkProject(), bundle, lookupFrom(bundle.devices));
    expect(report.issues).toEqual([]);
    // Rules whose data prereqs aren't satisfied by the empty bundle (POWER_001
    // wants supply poles; POWER_002 wants power_supply data) appear in skipped.
    const skippedIds = new Set(report.skipped.map((s) => s.rule_id));
    expect(skippedIds.has('POWER_001')).toBe(true);
    expect(skippedIds.has('POWER_002')).toBe(true);
    expect(skippedIds.has('REGION_001')).toBe(false); // REGION_001 has no prereqs
  });

  it('exposes a non-empty rule registry with unique ids', () => {
    expect(ALL_RULES.length).toBeGreaterThan(0);
    const ids = new Set(ALL_RULES.map((r) => r.id));
    expect(ids.size).toBe(ALL_RULES.length);
  });
});

describe('REGION_001', () => {
  it('flags a device whose footprint extends past the plot edge', () => {
    const dev = mkDevice({ id: 'big', footprint: { width: 4, height: 4 } });
    const bundle = mkBundle({ devices: [dev] });
    const project = mkProject();
    const placedProject = {
      ...project,
      plot: { width: 5, height: 5 },
      devices: [
        {
          instance_id: 'a',
          device_id: 'big',
          position: { x: 3, y: 3 },
          rotation: 0 as const,
          recipe_id: null,
        },
      ],
    };
    const report = runDrc(placedProject, bundle, lookupFrom(bundle.devices));
    const r001 = report.issues.filter((i) => i.rule_id === 'REGION_001');
    expect(r001).toHaveLength(1);
    expect(r001[0]!.device_instance_id).toBe('a');
  });

  it('does not flag devices that fit', () => {
    const dev = mkDevice({ id: 'tiny', footprint: { width: 2, height: 2 } });
    const bundle = mkBundle({ devices: [dev] });
    const project = mkProject();
    const placedProject = {
      ...project,
      devices: [
        {
          instance_id: 'a',
          device_id: 'tiny',
          position: { x: 1, y: 1 },
          rotation: 0 as const,
          recipe_id: null,
        },
      ],
    };
    const report = runDrc(placedProject, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'REGION_001')).toEqual([]);
  });
});
