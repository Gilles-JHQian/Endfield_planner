import { describe, expect, it } from 'vitest';
import { applySeed, defaultNorthSouthPorts } from './seed-default-ports.ts';

describe('defaultNorthSouthPorts', () => {
  it('emits W INPUTs on N + W OUTPUTs on S', () => {
    const ports = defaultNorthSouthPorts(3);
    expect(ports).toHaveLength(6);
    expect(ports.filter((p) => p.side === 'N')).toEqual([
      { side: 'N', offset: 0, kind: 'solid', direction_constraint: 'input' },
      { side: 'N', offset: 1, kind: 'solid', direction_constraint: 'input' },
      { side: 'N', offset: 2, kind: 'solid', direction_constraint: 'input' },
    ]);
    expect(ports.filter((p) => p.side === 'S')).toEqual([
      { side: 'S', offset: 0, kind: 'solid', direction_constraint: 'output' },
      { side: 'S', offset: 1, kind: 'solid', direction_constraint: 'output' },
      { side: 'S', offset: 2, kind: 'solid', direction_constraint: 'output' },
    ]);
  });
});

describe('applySeed', () => {
  it('replaces io_ports for matching categories only', () => {
    const devices = [
      {
        id: 'a',
        category: 'basic_production',
        footprint: { width: 3, height: 3 },
        io_ports: [],
      },
      {
        id: 'b',
        category: 'synthesis',
        footprint: { width: 6, height: 4 },
        io_ports: [],
      },
      {
        id: 'c',
        category: 'utility',
        footprint: { width: 2, height: 2 },
        io_ports: [
          {
            side: 'N' as const,
            offset: 0,
            kind: 'solid' as const,
            direction_constraint: 'input' as const,
          },
        ],
      },
    ];
    const diffs = applySeed(devices);
    expect(diffs).toHaveLength(2);
    expect(diffs.map((d) => d.id)).toEqual(['a', 'b']);
    expect(devices[0]!.io_ports).toHaveLength(6); // 3 N + 3 S
    expect(devices[1]!.io_ports).toHaveLength(12); // 6 N + 6 S
    expect(devices[2]!.io_ports).toHaveLength(1); // utility unchanged
  });

  it('marks identical existing ports as unchanged', () => {
    const seeded = defaultNorthSouthPorts(3);
    const devices = [
      {
        id: 'pre-seeded',
        category: 'basic_production',
        footprint: { width: 3, height: 3 },
        io_ports: seeded,
      },
    ];
    const diffs = applySeed(devices);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.changed).toBe(false);
  });
});
