/** Load a versioned data bundle.
 *
 *  Two entry points:
 *  - loadDataBundle(version, dataRoot?) — Node-side convenience that wraps
 *    node:fs/promises. Used by tests, scripts, and CLI.
 *  - loadDataBundleFromReader(version, reader) — IO-agnostic. The browser
 *    passes an import.meta.glob-based reader so the bundle is loaded from
 *    Vite-bundled JSON modules, not the filesystem.
 *
 *  Both produce identical DataBundle records — the IO boundary is the only
 *  difference.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  CrossingRules,
  DataBundle,
  Device,
  Item,
  Recipe,
  Region,
} from './types.ts';

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

export async function loadDataBundle(
  version: string,
  dataRoot: string = resolve(process.cwd(), 'data'),
): Promise<DataBundle> {
  const dir = resolve(dataRoot, 'versions', version);
  const reader: JsonReader = async (relPath) => {
    const raw = await readFile(resolve(dir, relPath), 'utf8');
    return JSON.parse(raw) as unknown;
  };
  return loadDataBundleFromReader(version, reader);
}
