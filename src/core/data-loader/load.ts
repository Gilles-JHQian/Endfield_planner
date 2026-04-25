/** IO-agnostic data bundle loader. Works in any JS environment because the
 *  caller injects the JsonReader. The fs-bound convenience wrapper lives in
 *  load-from-fs.ts so the browser bundle never pulls node:fs.
 */
import type { CrossingRules, DataBundle, Device, Item, Recipe, Region } from './types.ts';

/** A function that, given a path relative to data/versions/<version>/, returns
 *  the parsed JSON contents. Lets callers pick fs, fetch, import.meta.glob, etc. */
export type JsonReader = (relPath: string) => Promise<unknown>;

const FILES = ['devices', 'recipes', 'items', 'regions', 'crossing_rules'] as const;

export async function loadDataBundleFromReader(
  version: string,
  reader: JsonReader,
): Promise<DataBundle> {
  const [devices, recipes, items, regions, crossing_rules] = (await Promise.all(
    FILES.map((name) => reader(`${name}.json`)),
  )) as [Device[], Recipe[], Item[], Region[], CrossingRules];
  return { version, devices, recipes, items, regions, crossing_rules };
}
