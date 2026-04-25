import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRecipesIndex } from './parse-recipes-index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(
  __dirname,
  '..',
  '..',
  'tests',
  'fixtures',
  'end-wiki',
  'recipes-index.html',
);

describe('parseRecipesIndex', () => {
  it('extracts a substantial recipe catalog from the captured fixture', async () => {
    const html = await readFile(fixture, 'utf8');
    const recipes = parseRecipesIndex(html);
    // RESEARCH_FINDINGS §A.1 said "74 recipes" as of an earlier snapshot. The
    // captured 2026-04-25 page contains more — the catalog grew. Plant rows
    // (cycle is wall-clock, not seconds) are skipped per §10.6, so the count
    // here is the duration-bearing subset.
    expect(recipes.length).toBeGreaterThanOrEqual(200);
  });

  it('every recipe has at least one output, a positive cycle time, and a unique id', async () => {
    const html = await readFile(fixture, 'utf8');
    const recipes = parseRecipesIndex(html);
    const ids = new Set<string>();
    for (const r of recipes) {
      expect(r.outputs.length).toBeGreaterThan(0);
      expect(r.cycle_seconds).toBeGreaterThan(0);
      expect(ids.has(r.id), `duplicate recipe id ${r.id}`).toBe(false);
      ids.add(r.id);
    }
  });

  it('parses the first recipe (紫晶质瓶 + 清水 → 紫晶质瓶（清水）, 2s)', async () => {
    const html = await readFile(fixture, 'utf8');
    const recipes = parseRecipesIndex(html);
    const first = recipes[0];
    expect(first).toBeDefined();
    expect(first?.cycle_seconds).toBe(2);
    expect(first?.inputs.map((i) => i.item_id)).toEqual(['item-glass-bottle', 'item-liquid-water']);
    expect(first?.inputs.map((i) => i.qty_per_cycle)).toEqual([1, 1]);
    expect(first?.outputs.map((o) => o.item_id)).toEqual(['item-fbottle-glass-water']);
    expect(first?.outputs[0]?.qty_per_cycle).toBe(1);
  });
});
