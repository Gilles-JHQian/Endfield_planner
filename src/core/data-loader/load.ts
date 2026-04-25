/** Load a versioned data bundle from disk. Used by tests and by the Node-side
 *  CLI. The browser path (Phase 1 solver UI) gets its own IO-agnostic loader
 *  in a follow-up — kept simple here to avoid premature abstraction.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CrossingRules, DataBundle, Device, Item, Recipe, Region } from './types.ts';

async function readJson<T>(file: string): Promise<T> {
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw) as T;
}

/**
 * Read every JSON file in `data/versions/<version>/` and return them as one
 * `DataBundle`. The directory is resolved relative to `dataRoot`, which
 * defaults to `<cwd>/data` so call sites in tests / CLIs need not pass it.
 */
export async function loadDataBundle(
  version: string,
  dataRoot: string = resolve(process.cwd(), 'data'),
): Promise<DataBundle> {
  const dir = resolve(dataRoot, 'versions', version);
  const [devices, recipes, items, regions, crossing_rules] = await Promise.all([
    readJson<Device[]>(resolve(dir, 'devices.json')),
    readJson<Recipe[]>(resolve(dir, 'recipes.json')),
    readJson<Item[]>(resolve(dir, 'items.json')),
    readJson<Region[]>(resolve(dir, 'regions.json')),
    readJson<CrossingRules>(resolve(dir, 'crossing_rules.json')),
  ]);

  return { version, devices, recipes, items, regions, crossing_rules };
}
