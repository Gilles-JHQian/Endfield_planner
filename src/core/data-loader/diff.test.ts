import { describe, expect, it } from 'vitest';
import { loadDataBundle } from './load-from-fs.ts';
import { diffDataBundles } from './diff.ts';

describe('diffDataBundles', () => {
  it('reports devices and recipes only present in v1.1 as missing from v1.2', async () => {
    const [v1, v2] = await Promise.all([loadDataBundle('1.1'), loadDataBundle('1.2')]);
    const diff = diffDataBundles(v1, v2);
    expect(diff.missing_devices).toContain('obsolete-furnance-0');
    expect(diff.missing_recipes).toContain('recipe-obsolete');
  });

  it('reports devices and recipes whose record changed between v1.1 and v1.2', async () => {
    const [v1, v2] = await Promise.all([loadDataBundle('1.1'), loadDataBundle('1.2')]);
    const diff = diffDataBundles(v1, v2);
    // furnance-1 power_draw changed (8 in v1.1, 10 in v1.2 per scraper output).
    expect(diff.changed_devices).toContain('furnance-1');
    // recipe-iron-cmpt cycle_seconds changed (3 in v1.1, 2 in v1.2).
    expect(diff.changed_recipes).toContain('recipe-iron-cmpt');
  });

  it('returns empty diffs when bundles are byte-identical', async () => {
    const bundle = await loadDataBundle('1.2');
    const diff = diffDataBundles(bundle, bundle);
    expect(diff.missing_devices).toEqual([]);
    expect(diff.missing_recipes).toEqual([]);
    expect(diff.changed_devices).toEqual([]);
    expect(diff.changed_recipes).toEqual([]);
  });

  it('does not flag identical-content records (miner-1 unchanged across versions)', async () => {
    const [v1, v2] = await Promise.all([loadDataBundle('1.1'), loadDataBundle('1.2')]);
    const diff = diffDataBundles(v1, v2);
    expect(diff.changed_devices).not.toContain('miner-1');
    expect(diff.missing_devices).not.toContain('miner-1');
  });
});
