import { describe, expect, it } from 'vitest';
import { loadDataBundle } from './load-from-fs.ts';

describe('loadDataBundle', () => {
  it('loads v1.2 with the full scraped catalog (69 devices)', async () => {
    const bundle = await loadDataBundle('1.2');
    expect(bundle.version).toBe('1.2');
    expect(bundle.devices.length).toBe(69);
    expect(bundle.recipes.length).toBeGreaterThan(0);
    expect(bundle.items.length).toBeGreaterThan(0);
    expect(bundle.regions.length).toBeGreaterThan(0);
    expect(bundle.crossing_rules.bridge_port_constraint).toBe('paired_opposite');
  });

  it('loads v1.1 with the diff fixture data', async () => {
    const bundle = await loadDataBundle('1.1');
    expect(bundle.version).toBe('1.1');
    expect(bundle.devices.map((d) => d.id).sort()).toEqual(
      ['furnance-1', 'miner-1', 'obsolete-furnance-0'].sort(),
    );
  });
});
