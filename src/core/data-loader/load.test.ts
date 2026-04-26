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
    // Transport tiers per RESEARCH_FINDINGS §B.
    expect(bundle.transport_tiers.solid_belts.find((t) => t.tier === 1)?.items_per_minute).toBe(30);
    expect(bundle.transport_tiers.solid_belts.find((t) => t.tier === 2)?.items_per_minute).toBe(60);
    expect(bundle.transport_tiers.fluid_pipes.find((t) => t.tier === 1)?.units_per_minute).toBe(
      120,
    );
  });

  it('exposes power_aoe on 供电桩 / 中继器 devices (B1 round-trip check)', async () => {
    const bundle = await loadDataBundle('1.2');
    const supply = bundle.devices.find((d) => d.id === 'power-diffuser-1');
    expect(supply?.power_aoe).toEqual({
      kind: 'square_centered',
      edge: 12,
      purpose: 'device_supply',
    });
    const repeater = bundle.devices.find((d) => d.id === 'power-pole-2');
    expect(repeater?.power_aoe).toEqual({
      kind: 'square_centered',
      edge: 7,
      purpose: 'pole_link',
    });
  });

  it('loads v1.1 with the diff fixture data', async () => {
    const bundle = await loadDataBundle('1.1');
    expect(bundle.version).toBe('1.1');
    expect(bundle.devices.map((d) => d.id).sort()).toEqual(
      ['furnance-1', 'miner-1', 'obsolete-furnance-0'].sort(),
    );
  });
});
