import { describe, expect, it } from 'vitest';
import { runDrc } from '../run.ts';
import { lookupFrom, mkBundle, mkDevice, mkProject } from '../fixtures.ts';
import type { PlacedDevice, SolidLink, FluidLink } from '@core/domain/types.ts';

const FURNACE = mkDevice({
  id: 'furnace',
  footprint: { width: 3, height: 3 },
  io_ports: [
    { side: 'W', offset: 1, kind: 'solid', direction_constraint: 'input' },
    { side: 'E', offset: 1, kind: 'solid', direction_constraint: 'output' },
  ],
});
const PUMP = mkDevice({
  id: 'pump',
  footprint: { width: 3, height: 3 },
  io_ports: [
    { side: 'W', offset: 1, kind: 'fluid', direction_constraint: 'input' },
    { side: 'E', offset: 1, kind: 'fluid', direction_constraint: 'output' },
  ],
});

const placed = (instance_id: string, device_id: string, x: number, y: number): PlacedDevice => ({
  instance_id,
  device_id,
  position: { x, y },
  rotation: 0,
  recipe_id: null,
});

describe('PORT_001', () => {
  it('flags an input port that has no link attached', () => {
    const bundle = mkBundle({ devices: [FURNACE] });
    const project = { ...mkProject(), devices: [placed('a', 'furnace', 5, 5)] };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'PORT_001');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.device_instance_id).toBe('a');
  });

  it('does not flag an input port with a connected link', () => {
    const bundle = mkBundle({ devices: [FURNACE] });
    const project = {
      ...mkProject(),
      devices: [placed('a', 'furnace', 5, 5)],
      solid_links: [
        {
          id: 'l1',
          layer: 'solid',
          tier_id: 'belt-1',
          path: [{ x: 5, y: 6 }],
          dst: { device_instance_id: 'a', port_index: 0 },
        } as SolidLink,
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'PORT_001')).toEqual([]);
  });

  it('is skipped when no device declares io_ports', () => {
    const bundle = mkBundle({ devices: [mkDevice({ id: 'no-ports' })] });
    const project = mkProject();
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.skipped.find((s) => s.rule_id === 'PORT_001')?.missing).toContain('io_ports');
  });
});

describe('PORT_003', () => {
  it('flags a fluid link attached to a solid port', () => {
    const bundle = mkBundle({ devices: [FURNACE] });
    const project = {
      ...mkProject(),
      devices: [placed('a', 'furnace', 5, 5)],
      fluid_links: [
        {
          id: 'l1',
          layer: 'fluid',
          tier_id: 'pipe-wuling',
          path: [{ x: 5, y: 6 }],
          dst: { device_instance_id: 'a', port_index: 0 },
        } as FluidLink,
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'PORT_003');
    expect(issues).toHaveLength(1);
  });

  it('does not flag a matching layer/kind pair', () => {
    const bundle = mkBundle({ devices: [PUMP] });
    const project = {
      ...mkProject(),
      devices: [placed('a', 'pump', 5, 5)],
      fluid_links: [
        {
          id: 'l1',
          layer: 'fluid',
          tier_id: 'pipe-wuling',
          path: [{ x: 5, y: 6 }],
          dst: { device_instance_id: 'a', port_index: 0 },
        } as FluidLink,
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'PORT_003')).toEqual([]);
  });
});

describe('LAYER_CROSS_003', () => {
  it('flags a link path that enters a device at a non-port cell', () => {
    const bundle = mkBundle({ devices: [FURNACE] });
    // Furnace at (5,5) has W port at (5,6), E port at (7,6). Cell (6,6) is body.
    const project = {
      ...mkProject(),
      devices: [placed('a', 'furnace', 5, 5)],
      solid_links: [
        {
          id: 'l1',
          layer: 'solid',
          tier_id: 'belt-1',
          path: [{ x: 6, y: 6 }],
        } as SolidLink,
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    const issues = report.issues.filter((i) => i.rule_id === 'LAYER_CROSS_003');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.cells[0]).toEqual({ x: 6, y: 6 });
  });

  it('does not flag a path that touches a device only at its port cell', () => {
    const bundle = mkBundle({ devices: [FURNACE] });
    const project = {
      ...mkProject(),
      devices: [placed('a', 'furnace', 5, 5)],
      solid_links: [
        {
          id: 'l1',
          layer: 'solid',
          tier_id: 'belt-1',
          path: [{ x: 5, y: 6 }], // W port cell
        } as SolidLink,
      ],
    };
    const report = runDrc(project, bundle, lookupFrom(bundle.devices));
    expect(report.issues.filter((i) => i.rule_id === 'LAYER_CROSS_003')).toEqual([]);
  });
});
