import { describe, expect, it } from 'vitest';
import { runDrc } from '../run.ts';
import { lookupFrom, mkBundle, mkDevice, mkProject } from '../fixtures.ts';
import type { PlacedDevice, SolidLink } from '@core/domain/types.ts';

const BELT_BRIDGE = mkDevice({
  id: 'belt-bridge',
  category: 'logistics',
  io_ports: [
    { side: 'W', offset: 0, kind: 'solid', direction_constraint: 'paired_opposite' },
    { side: 'E', offset: 0, kind: 'solid', direction_constraint: 'paired_opposite' },
  ],
});
const PIPE_BRIDGE = mkDevice({
  id: 'pipe-bridge',
  category: 'logistics',
  io_ports: [
    { side: 'W', offset: 0, kind: 'fluid', direction_constraint: 'paired_opposite' },
    { side: 'E', offset: 0, kind: 'fluid', direction_constraint: 'paired_opposite' },
  ],
});

const placed = (instance_id: string, device_id: string, x = 0, y = 0): PlacedDevice => ({
  instance_id,
  device_id,
  position: { x, y },
  rotation: 0,
  recipe_id: null,
});

describe('skip behavior on prod-style data (no bridge devices)', () => {
  it('BELT_CROSS_001 / PIPE_CROSS_001 / BELT_CROSS_DELAY_001 / PORT_004 / LAYER_CROSS_001/002 are all skipped', () => {
    const bundle = mkBundle();
    const report = runDrc(mkProject(), bundle, lookupFrom(bundle.devices));
    const skippedIds = new Set(report.skipped.map((s) => s.rule_id));
    for (const id of [
      'BELT_CROSS_001',
      'PIPE_CROSS_001',
      'BELT_CROSS_DELAY_001',
      'PORT_004',
      'LAYER_CROSS_001',
      'LAYER_CROSS_002',
    ] as const) {
      expect(skippedIds.has(id)).toBe(true);
    }
  });
});

describe('BELT_CROSS_001', () => {
  it('flags two solid links sharing a cell with no bridge present', () => {
    const bundle = mkBundle({ devices: [BELT_BRIDGE, PIPE_BRIDGE] });
    const project = {
      ...mkProject(),
      solid_links: [
        { id: 'a', layer: 'solid', tier_id: 'belt-1', path: [{ x: 5, y: 5 }] } as SolidLink,
        { id: 'b', layer: 'solid', tier_id: 'belt-1', path: [{ x: 5, y: 5 }] } as SolidLink,
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'BELT_CROSS_001');
    expect(issues).toHaveLength(1);
  });

  it('does not flag when a bridge is placed at the crossing', () => {
    const bundle = mkBundle({ devices: [BELT_BRIDGE, PIPE_BRIDGE] });
    const project = {
      ...mkProject(),
      devices: [placed('br', 'belt-bridge', 5, 5)],
      solid_links: [
        { id: 'a', layer: 'solid', tier_id: 'belt-1', path: [{ x: 5, y: 5 }] } as SolidLink,
        { id: 'b', layer: 'solid', tier_id: 'belt-1', path: [{ x: 5, y: 5 }] } as SolidLink,
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'BELT_CROSS_001')).toEqual([]);
  });
});

describe('LAYER_CROSS_001', () => {
  it('flags a solid belt that crosses a logistics device cell', () => {
    const bundle = mkBundle({ devices: [BELT_BRIDGE, PIPE_BRIDGE] });
    // Pipe-bridge sits on (5,5) and the belt path crosses through it.
    const project = {
      ...mkProject(),
      devices: [placed('pb', 'pipe-bridge', 5, 5)],
      solid_links: [
        { id: 'l', layer: 'solid', tier_id: 'belt-1', path: [{ x: 5, y: 5 }] } as SolidLink,
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'LAYER_CROSS_001');
    expect(issues).toHaveLength(1);
  });
});
