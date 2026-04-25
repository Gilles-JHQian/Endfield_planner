import { describe, expect, it } from 'vitest';
import { fingerprintRecipe, parseDeviceRecipeRows } from './cross-reference.ts';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(__dirname, '..', '..', 'tests', 'fixtures', 'end-wiki', 'furnance-1.html');

describe('fingerprintRecipe', () => {
  it('is order-insensitive within inputs and within outputs', () => {
    const a = fingerprintRecipe(
      [
        { item_id: 'a', qty_per_cycle: 2, display_name_zh_hans: 'A' },
        { item_id: 'b', qty_per_cycle: 1, display_name_zh_hans: 'B' },
      ],
      [{ item_id: 'c', qty_per_cycle: 1, display_name_zh_hans: 'C' }],
    );
    const b = fingerprintRecipe(
      [
        { item_id: 'b', qty_per_cycle: 1, display_name_zh_hans: 'B' },
        { item_id: 'a', qty_per_cycle: 2, display_name_zh_hans: 'A' },
      ],
      [{ item_id: 'c', qty_per_cycle: 1, display_name_zh_hans: 'C' }],
    );
    expect(a).toBe(b);
  });

  it('distinguishes inputs from outputs', () => {
    const fwd = fingerprintRecipe(
      [{ item_id: 'a', qty_per_cycle: 1, display_name_zh_hans: 'A' }],
      [{ item_id: 'b', qty_per_cycle: 1, display_name_zh_hans: 'B' }],
    );
    const rev = fingerprintRecipe(
      [{ item_id: 'b', qty_per_cycle: 1, display_name_zh_hans: 'B' }],
      [{ item_id: 'a', qty_per_cycle: 1, display_name_zh_hans: 'A' }],
    );
    expect(fwd).not.toBe(rev);
  });
});

describe('parseDeviceRecipeRows', () => {
  it('extracts every visible recipe row from the furnance-1 page', async () => {
    const html = await readFile(fixture, 'utf8');
    const rows = parseDeviceRecipeRows(html);
    // furnance-1 is a smelter; it should run multiple ore->ingot recipes.
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.outputs.length).toBeGreaterThan(0);
      expect(row.cycle_seconds).toBeGreaterThan(0);
    }
    // Must include 蓝铁矿 → ingot smelting (a documented furnance recipe).
    const hasIron = rows.some((r) => r.inputs.some((i) => i.item_id === 'item-iron-ore'));
    expect(hasIron).toBe(true);
  });
});
