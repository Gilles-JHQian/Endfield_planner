/** Node-only convenience wrapper around loadDataBundleFromReader. Tests and
 *  CLIs use this; the browser must NOT import this file (it would pull
 *  node:fs into the bundle). The barrel re-exports it so Node callers can
 *  reach it via `@core/data-loader`, while the browser uses the IO-agnostic
 *  loadDataBundleFromReader directly.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadDataBundleFromReader, type JsonReader } from './load.ts';
import type { DataBundle } from './types.ts';

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
