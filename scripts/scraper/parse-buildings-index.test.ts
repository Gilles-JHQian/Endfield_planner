import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBuildingsIndex } from './parse-buildings-index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(
  __dirname,
  '..',
  '..',
  'tests',
  'fixtures',
  'end-wiki',
  'buildings-index.html',
);

describe('parseBuildingsIndex', () => {
  it('extracts all 69 device slugs from the captured fixture', async () => {
    const html = await readFile(fixture, 'utf8');
    const slugs = parseBuildingsIndex(html);
    // RESEARCH_FINDINGS §A.1 / §E lists 69 devices in the catalog as of v1.2.
    expect(slugs).toHaveLength(69);
    // Spot-check a few well-known slugs from RESEARCH_FINDINGS §E.
    expect(slugs).toContain('furnance-1');
    expect(slugs).toContain('miner-1');
    expect(slugs).toContain('udpipe-loader-1');
    expect(slugs).toContain('power-diffuser-1');
  });

  it('returns slugs in deterministic sorted order', async () => {
    const html = await readFile(fixture, 'utf8');
    const slugs = parseBuildingsIndex(html);
    const sorted = [...slugs].sort();
    expect(slugs).toEqual(sorted);
  });
});
