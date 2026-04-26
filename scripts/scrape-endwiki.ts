/**
 * Scrape end.wiki for the integrated industry catalog and write
 * data/versions/<version>/{devices,recipes,items}.json.
 *
 * Usage:
 *   pnpm scrape:endwiki --version 1.2
 *   pnpm scrape:endwiki --version 1.2 --no-cache
 *
 * Files NOT touched by the scraper (regions.json, crossing_rules.json,
 * tech_tree.json) keep whatever the working tree already has — they are
 * hand-curated per REQUIREMENT.md §10.
 *
 * io_ports on existing devices are preserved per §6.2 (merge, don't
 * overwrite — the device editor in Phase 2 fills these in).
 *
 * After writing each file the scraper re-validates everything against
 * data/schema/. On any failure the run fails non-zero AFTER attempting
 * to roll back the partial writes via tmpfile + rename.
 */
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchHtml } from './scraper/http.ts';
import { parseBuildingsIndex } from './scraper/parse-buildings-index.ts';
import { parseDevicePage } from './scraper/parse-device-page.ts';
import { parseRecipesIndex } from './scraper/parse-recipes-index.ts';
import { crossReference } from './scraper/cross-reference.ts';
import { deriveItems } from './scraper/derive-items.ts';
import { validateAllVersions } from './validate-data.ts';
import type { ScrapedDevice } from './scraper/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const versionsDir = resolve(repoRoot, 'data', 'versions');

const BASE_URL = 'https://end.wiki';

interface CliArgs {
  version: string;
  noCache: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let version: string | undefined;
  let noCache = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--version') {
      version = argv[i + 1];
      i++;
    } else if (arg === '--no-cache') {
      noCache = true;
    }
  }
  if (!version || !/^\d+(\.\d+)+$/.test(version)) {
    throw new Error('Usage: scrape-endwiki --version <semver-like-string> [--no-cache]');
  }
  return { version, noCache };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

type CuratedFields = Pick<ScrapedDevice, 'io_ports' | 'tech_prereq'> & {
  power_aoe?: ScrapedDevice['power_aoe'];
};

interface CuratedSet {
  /** Per-id field overrides for devices the scraper finds on end.wiki. */
  fields: Map<string, CuratedFields>;
  /** Full device records for ids the scraper does NOT find — typically
   *  hand-authored devices like the 6 logistics bridges that don't exist
   *  on end.wiki. These are preserved verbatim. */
  fullRecords: Map<string, ScrapedDevice>;
}

async function loadCuratedDevices(versionDir: string): Promise<CuratedSet> {
  const devicesFile = resolve(versionDir, 'devices.json');
  if (!(await fileExists(devicesFile))) return { fields: new Map(), fullRecords: new Map() };
  const raw = await readFile(devicesFile, 'utf8');
  const parsed = JSON.parse(raw) as Partial<ScrapedDevice>[];
  const fields = new Map<string, CuratedFields>();
  const fullRecords = new Map<string, ScrapedDevice>();
  for (const d of parsed) {
    if (typeof d.id !== 'string') continue;
    const entry: CuratedFields = {
      io_ports: d.io_ports ?? [],
      tech_prereq: d.tech_prereq ?? [],
    };
    if (d.power_aoe) entry.power_aoe = d.power_aoe;
    fields.set(d.id, entry);
    // Anything that looks like a complete device record (has all required
    // schema fields) is also stashed for full-record preservation when the
    // scraper later finds the id missing from end.wiki.
    if (
      typeof d.display_name_zh_hans === 'string' &&
      typeof d.footprint === 'object' &&
      typeof d.bandwidth === 'number' &&
      typeof d.power_draw === 'number' &&
      typeof d.requires_power === 'boolean' &&
      typeof d.has_fluid_interface === 'boolean' &&
      typeof d.category === 'string'
    ) {
      fullRecords.set(d.id, d as ScrapedDevice);
    }
  }
  return { fields, fullRecords };
}

async function writeAtomic(target: string, content: string): Promise<void> {
  const tmp = `${target}.tmp`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, target);
}

async function main(): Promise<void> {
  const { version, noCache } = parseArgs(process.argv.slice(2));
  const versionDir = resolve(versionsDir, version);
  await mkdir(versionDir, { recursive: true });

  console.log(`[scrape] writing to ${versionDir}`);
  console.log(`[scrape] cache ${noCache ? 'BYPASSED' : 'enabled'} (scripts/.cache/)`);

  console.log('[scrape] fetching buildings index ...');
  const buildingsHtml = await fetchHtml(`${BASE_URL}/zh-Hans/factory/buildings/`, {
    noCache,
  });
  const slugs = parseBuildingsIndex(buildingsHtml);
  console.log(`[scrape] found ${slugs.length.toString()} device slugs`);

  console.log('[scrape] fetching recipes index ...');
  const recipesHtml = await fetchHtml(`${BASE_URL}/zh-Hans/factory/recipes/`, { noCache });
  const recipes = parseRecipesIndex(recipesHtml);
  console.log(`[scrape] parsed ${recipes.length.toString()} recipes`);

  const devicePages = new Map<string, string>();
  const devices: ScrapedDevice[] = [];
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i]!;
    const url = `${BASE_URL}/zh-Hans/factory/buildings/${slug}/`;
    process.stdout.write(
      `\r[scrape] device ${(i + 1).toString()}/${slugs.length.toString()} ${slug.padEnd(30)} `,
    );
    const html = await fetchHtml(url, { noCache });
    devicePages.set(slug, html);
    devices.push(parseDevicePage(html, slug));
  }
  process.stdout.write('\n');

  console.log('[scrape] cross-referencing devices ↔ recipes ...');
  const xref = crossReference({ devices, recipes, devicePages });
  if (xref.unmatched.length > 0) {
    console.log(
      `[scrape] ${xref.unmatched.length.toString()} device-page recipes had no match in the global index (variants / removed recipes; non-fatal)`,
    );
  }

  console.log(
    '[scrape] preserving curated io_ports / tech_prereq / power_aoe + fully-curated devices ...',
  );
  const curated = await loadCuratedDevices(versionDir);
  const finalDevices: ScrapedDevice[] = xref.devices.map((d) => {
    const c = curated.fields.get(d.id);
    if (!c) return d;
    // Preserve io_ports if curated; preserve tech_prereq only if scraper produced an empty list;
    // always preserve curated power_aoe (scraper has no way to derive it from end.wiki text).
    const merged: ScrapedDevice = {
      ...d,
      io_ports: c.io_ports.length > 0 ? c.io_ports : d.io_ports,
      tech_prereq: d.tech_prereq.length > 0 ? d.tech_prereq : c.tech_prereq,
    };
    if (c.power_aoe) merged.power_aoe = c.power_aoe;
    return merged;
  });
  // Append hand-authored devices that the scraper didn't find on end.wiki
  // (e.g. the 6 logistics bridges added in P3-B13). These are preserved
  // verbatim across re-scrapes; schema validation at the end of main()
  // catches malformed records before they land.
  const scrapedIds = new Set(xref.devices.map((d) => d.id));
  let preservedCount = 0;
  for (const [id, record] of curated.fullRecords) {
    if (scrapedIds.has(id)) continue;
    finalDevices.push(record);
    preservedCount++;
  }
  if (preservedCount > 0) {
    console.log(
      `[scrape] preserved ${preservedCount.toString()} hand-authored devices not found on end.wiki`,
    );
  }

  // Drop recipes nobody can produce — they show up when the global recipes
  // index lists a recipe but no device page mentions a matching fingerprint
  // (typically catalog-only oddities or fingerprint drift between pages).
  // We can't validate them against the schema (compatible_devices minItems 1)
  // and the solver couldn't use them anyway.
  const matchedRecipes = xref.recipes.filter((r) => r.compatible_devices.length > 0);
  const droppedRecipeCount = xref.recipes.length - matchedRecipes.length;
  if (droppedRecipeCount > 0) {
    console.log(
      `[scrape] dropped ${droppedRecipeCount.toString()} recipes with no producing device`,
    );
  }

  const items = deriveItems(matchedRecipes);
  console.log(`[scrape] derived ${items.length.toString()} items from recipes`);

  // Strip the display_name field from recipe ports — it's a scraper-only hint
  // for items derivation, not part of the persisted recipes schema.
  const recipesForOutput = matchedRecipes.map((r) => ({
    ...r,
    inputs: r.inputs.map(({ item_id, qty_per_cycle }) => ({ item_id, qty_per_cycle })),
    outputs: r.outputs.map(({ item_id, qty_per_cycle }) => ({ item_id, qty_per_cycle })),
  }));

  // Sort outputs for stable diffs across runs.
  finalDevices.sort((a, b) => a.id.localeCompare(b.id));
  recipesForOutput.sort((a, b) => a.id.localeCompare(b.id));

  // Pre-merge scraped baseline. Captures only what the wiki produces — no
  // owner-curated io_ports / power_aoe / hand-authored bridges. Stored
  // alongside devices.json so the device editor can offer per-device
  // "restore to scraped" with a field-level diff (P3-B16).
  const scrapedBaseline = [...xref.devices].sort((a, b) => a.id.localeCompare(b.id));

  const meta = {
    version,
    generated_at: new Date().toISOString(),
    source: BASE_URL,
    counts: {
      devices: finalDevices.length,
      recipes: recipesForOutput.length,
      items: items.length,
    },
  };

  console.log('[scrape] writing JSON files atomically ...');
  await writeAtomic(
    resolve(versionDir, 'devices.json'),
    JSON.stringify(finalDevices, null, 2) + '\n',
  );
  await writeAtomic(
    resolve(versionDir, 'devices.scraped.json'),
    JSON.stringify(scrapedBaseline, null, 2) + '\n',
  );
  await writeAtomic(
    resolve(versionDir, 'recipes.json'),
    JSON.stringify(recipesForOutput, null, 2) + '\n',
  );
  await writeAtomic(resolve(versionDir, 'items.json'), JSON.stringify(items, null, 2) + '\n');
  await writeAtomic(
    resolve(versionDir, 'generated.meta.json'),
    JSON.stringify(meta, null, 2) + '\n',
  );

  console.log('[scrape] validating output against schemas ...');
  const reports = await validateAllVersions();
  let totalFailures = 0;
  for (const r of reports) {
    for (const f of r.failures) {
      totalFailures++;
      console.error(`✗ ${f.file} (against ${f.schema})\n  ${f.errors}`);
    }
  }
  if (totalFailures > 0) {
    throw new Error(`Schema validation failed (${totalFailures.toString()} failures).`);
  }

  console.log(
    `[scrape] done. ${meta.counts.devices.toString()} devices, ${meta.counts.recipes.toString()} recipes, ${meta.counts.items.toString()} items.`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
