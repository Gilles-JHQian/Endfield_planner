import { describe, expect, it } from 'vitest';
import { runDrc } from '../run.ts';
import { lookupFrom, mkBundle, mkDevice, mkProject } from '../fixtures.ts';
import type { FluidLink, PlacedDevice, SolidLink } from '@core/domain/types.ts';

const BELT_BRIDGE = mkDevice({
  id: 'belt-cross-bridge',
  category: 'logistics',
  io_ports: [
    { side: 'W', offset: 0, kind: 'solid', direction_constraint: 'paired_opposite' },
    { side: 'E', offset: 0, kind: 'solid', direction_constraint: 'paired_opposite' },
  ],
});
const PIPE_BRIDGE = mkDevice({
  id: 'pipe-cross-bridge',
  category: 'logistics',
  has_fluid_interface: true,
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

describe('BELT_CROSS_001 (perpendicular crossing only — P3 narrowing)', () => {
  it('flags perpendicular crossing without a cross-bridge', () => {
    const bundle = mkBundle({ devices: [BELT_BRIDGE, PIPE_BRIDGE] });
    const project = {
      ...mkProject(),
      // Horizontal belt through (5,5) and vertical belt through (5,5).
      solid_links: [
        {
          id: 'h',
          layer: 'solid',
          tier_id: 'belt-1',
          path: [
            { x: 4, y: 5 },
            { x: 5, y: 5 },
            { x: 6, y: 5 },
          ],
        } as SolidLink,
        {
          id: 'v',
          layer: 'solid',
          tier_id: 'belt-1',
          path: [
            { x: 5, y: 4 },
            { x: 5, y: 5 },
            { x: 5, y: 6 },
          ],
        } as SolidLink,
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'BELT_CROSS_001');
    expect(issues).toHaveLength(1);
  });

  it('does not flag when a cross-bridge is placed at the crossing', () => {
    const bundle = mkBundle({ devices: [BELT_BRIDGE, PIPE_BRIDGE] });
    const project = {
      ...mkProject(),
      devices: [placed('br', 'belt-cross-bridge', 5, 5)],
      solid_links: [
        {
          id: 'h',
          layer: 'solid',
          tier_id: 'belt-1',
          path: [
            { x: 4, y: 5 },
            { x: 5, y: 5 },
            { x: 6, y: 5 },
          ],
        } as SolidLink,
        {
          id: 'v',
          layer: 'solid',
          tier_id: 'belt-1',
          path: [
            { x: 5, y: 4 },
            { x: 5, y: 5 },
            { x: 5, y: 6 },
          ],
        } as SolidLink,
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'BELT_CROSS_001')).toEqual([]);
  });
});

describe('LAYER_CROSS_001 / 002 asymmetry', () => {
  it('LAYER_CROSS_001 flags a solid belt crossing a fluid (pipe) bridge cell', () => {
    const bundle = mkBundle({ devices: [BELT_BRIDGE, PIPE_BRIDGE] });
    const project = {
      ...mkProject(),
      devices: [placed('pb', 'pipe-cross-bridge', 5, 5)],
      solid_links: [
        { id: 'l', layer: 'solid', tier_id: 'belt-1', path: [{ x: 5, y: 5 }] } as SolidLink,
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'LAYER_CROSS_001');
    expect(issues).toHaveLength(1);
  });

  it('LAYER_CROSS_002 does NOT flag a fluid pipe under a solid belt-bridge (P3 asymmetric)', () => {
    const bundle = mkBundle({ devices: [BELT_BRIDGE, PIPE_BRIDGE] });
    const project = {
      ...mkProject(),
      devices: [placed('bb', 'belt-cross-bridge', 5, 5)],
      fluid_links: [
        {
          id: 'l',
          layer: 'fluid',
          tier_id: 'pipe-wuling',
          path: [{ x: 5, y: 5 }],
        } as FluidLink,
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'LAYER_CROSS_002')).toEqual([]);
  });
});
