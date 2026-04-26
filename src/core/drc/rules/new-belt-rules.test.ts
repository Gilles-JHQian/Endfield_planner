import { describe, expect, it } from 'vitest';
import { runDrc } from '../run.ts';
import { lookupFrom, mkBundle, mkDevice, mkProject } from '../fixtures.ts';
import type { PlacedDevice, SolidLink } from '@core/domain/types.ts';

const BELT_TIERS = {
  solid_belts: [{ tier: 1, id: 'belt-1', items_per_minute: 30 }],
  fluid_pipes: [],
};

const placed = (instance_id: string, device_id: string, x = 0, y = 0): PlacedDevice => ({
  instance_id,
  device_id,
  position: { x, y },
  rotation: 0,
  recipe_id: null,
});

const sLink = (id: string, path: SolidLink['path']): SolidLink => ({
  id,
  layer: 'solid',
  tier_id: 'belt-1',
  path,
});

describe('BELT_PARALLEL_001', () => {
  it('flags two horizontally-running belts that share a cell', () => {
    const bundle = mkBundle({ transport_tiers: BELT_TIERS });
    const project = {
      ...mkProject(),
      solid_links: [
        sLink('a', [
          { x: 0, y: 5 },
          { x: 1, y: 5 },
          { x: 2, y: 5 },
        ]),
        sLink('b', [
          { x: 1, y: 5 },
          { x: 2, y: 5 },
          { x: 3, y: 5 },
        ]),
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'BELT_PARALLEL_001');
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does NOT flag perpendicular crossings (those are BELT_CROSS_001)', () => {
    const bundle = mkBundle({ transport_tiers: BELT_TIERS });
    const project = {
      ...mkProject(),
      solid_links: [
        sLink('h', [
          { x: 4, y: 5 },
          { x: 5, y: 5 },
          { x: 6, y: 5 },
        ]),
        sLink('v', [
          { x: 5, y: 4 },
          { x: 5, y: 5 },
          { x: 5, y: 6 },
        ]),
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'BELT_PARALLEL_001')).toEqual([]);
  });
});

describe('BELT_CORNER_001', () => {
  it('flags when a second belt visits a corner cell of another belt', () => {
    const bundle = mkBundle({ transport_tiers: BELT_TIERS });
    const project = {
      ...mkProject(),
      solid_links: [
        // Corner at (5,5): horizontal then vertical.
        sLink('a', [
          { x: 4, y: 5 },
          { x: 5, y: 5 },
          { x: 5, y: 6 },
        ]),
        // Second belt visits (5,5) on its way through.
        sLink('b', [
          { x: 5, y: 4 },
          { x: 5, y: 5 },
          { x: 6, y: 5 },
        ]),
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'BELT_CORNER_001');
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does NOT flag a single belt cornering on its own', () => {
    const bundle = mkBundle({ transport_tiers: BELT_TIERS });
    const project = {
      ...mkProject(),
      solid_links: [
        sLink('a', [
          { x: 4, y: 5 },
          { x: 5, y: 5 },
          { x: 5, y: 6 },
        ]),
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'BELT_CORNER_001')).toEqual([]);
  });
});

describe('BELT_TAP_001', () => {
  it('flags an endpoint landing on the interior of another belt', () => {
    const bundle = mkBundle({ transport_tiers: BELT_TIERS });
    const project = {
      ...mkProject(),
      solid_links: [
        sLink('main', [
          { x: 0, y: 5 },
          { x: 1, y: 5 },
          { x: 2, y: 5 },
          { x: 3, y: 5 },
          { x: 4, y: 5 },
        ]),
        // Tap arrives at (2,5) — interior of `main`.
        sLink('tap', [
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 2, y: 2 },
          { x: 2, y: 3 },
          { x: 2, y: 4 },
          { x: 2, y: 5 },
        ]),
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'BELT_TAP_001');
    expect(issues).toHaveLength(1);
  });

  it('does NOT flag when the tap cell hosts a logistics bridge', () => {
    const bundle = mkBundle({
      transport_tiers: BELT_TIERS,
      devices: [
        mkDevice({
          id: 'belt-merger',
          category: 'logistics',
          io_ports: [],
        }),
      ],
    });
    const project = {
      ...mkProject(),
      devices: [placed('m', 'belt-merger', 2, 5)],
      solid_links: [
        sLink('main', [
          { x: 0, y: 5 },
          { x: 1, y: 5 },
          { x: 2, y: 5 },
          { x: 3, y: 5 },
        ]),
        sLink('tap', [
          { x: 2, y: 4 },
          { x: 2, y: 5 },
        ]),
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'BELT_TAP_001')).toEqual([]);
  });

  it('does NOT flag end-to-end belt joins (endpoint on another endpoint)', () => {
    const bundle = mkBundle({ transport_tiers: BELT_TIERS });
    const project = {
      ...mkProject(),
      solid_links: [
        sLink('a', [
          { x: 0, y: 5 },
          { x: 1, y: 5 },
          { x: 2, y: 5 },
        ]),
        sLink('b', [
          { x: 2, y: 5 },
          { x: 3, y: 5 },
          { x: 4, y: 5 },
        ]),
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'BELT_TAP_001')).toEqual([]);
  });
});
