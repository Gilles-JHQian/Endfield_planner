import { describe, expect, it } from 'vitest';
import { injectSampleIoPorts } from './sample-io-ports.ts';
import { mkBundle, mkDevice } from './fixtures.ts';

describe('injectSampleIoPorts', () => {
  it('adds io_ports to a known fixture device id', () => {
    const bundle = mkBundle({ devices: [mkDevice({ id: 'furnance-1' })] });
    const augmented = injectSampleIoPorts(bundle);
    const dev = augmented.devices.find((d) => d.id === 'furnance-1');
    expect(dev?.io_ports.length).toBeGreaterThan(0);
  });

  it('does not overwrite io_ports already present on a device', () => {
    const realPort = {
      side: 'N' as const,
      offset: 0,
      kind: 'solid' as const,
      direction_constraint: 'input' as const,
    };
    const bundle = mkBundle({
      devices: [mkDevice({ id: 'furnance-1', io_ports: [realPort] })],
    });
    const augmented = injectSampleIoPorts(bundle);
    const dev = augmented.devices.find((d) => d.id === 'furnance-1');
    expect(dev?.io_ports).toEqual([realPort]);
  });

  it('leaves devices not in the fixture untouched', () => {
    const bundle = mkBundle({ devices: [mkDevice({ id: 'unknown-x' })] });
    const augmented = injectSampleIoPorts(bundle);
    expect(augmented.devices[0]!.io_ports).toEqual([]);
  });
});
