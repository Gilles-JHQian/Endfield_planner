/**
 * Walk each device page to find which recipes it can run, then attach
 * `compatible_devices` to recipes and `recipes` to devices.
 *
 * Device pages embed their own recipe table whose rows have the same
 * inputs/outputs/duration shape as the global recipes index. We match by
 * "fingerprint" — sorted (item_id, qty) tuples for inputs and outputs — so
 * the matching is robust to row ordering and avoids depending on synthesized
 * recipe ids.
 */
import { load, type CheerioAPI, type Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import type { ScrapedDevice, ScrapedRecipe, ScrapedRecipePort } from './types.ts';

const ITEM_HREF_PATTERN = /^\/zh-Hans\/items\/([a-z0-9][a-z0-9-]*)\/?$/;
const QUANTITY_PATTERN = /×\s*([0-9]+(?:\.[0-9]+)?)/;
const DURATION_PATTERN = /^([0-9]+(?:\.[0-9]+)?)s$/;

export type RecipeFingerprint = string;

export function fingerprintRecipe(
  inputs: ScrapedRecipePort[],
  outputs: ScrapedRecipePort[],
): RecipeFingerprint {
  const fmt = (ports: ScrapedRecipePort[]): string =>
    ports
      .map((p) => `${p.item_id}:${p.qty_per_cycle.toString()}`)
      .sort()
      .join(',');
  return `${fmt(inputs)}|${fmt(outputs)}`;
}

interface DeviceRecipeRow {
  inputs: ScrapedRecipePort[];
  outputs: ScrapedRecipePort[];
  cycle_seconds: number;
}

export function parseDeviceRecipeRows(html: string): DeviceRecipeRow[] {
  const $ = load(html);
  const rows: DeviceRecipeRow[] = [];

  // Device pages put recipes in `table.recipe-table` (no per-row stable id).
  // We iterate every <tr> inside but skip the duplicated `recipe-hidden` rows
  // the page uses for its expand/collapse UI.
  $('table.recipe-table tr').each((_, el) => {
    const tr = $(el);
    if (tr.hasClass('recipe-hidden')) return;
    const tds = tr.children('td');
    if (tds.length < 4) return;

    const inputs = parsePorts($, tds.eq(0));
    const outputs = parsePorts($, tds.eq(2));
    if (outputs.length === 0) return;

    const durText = tds.eq(3).find('.recipe-duration').first().text().trim();
    const durMatch = DURATION_PATTERN.exec(durText);
    if (!durMatch?.[1]) return;
    rows.push({ inputs, outputs, cycle_seconds: Number.parseFloat(durMatch[1]) });
  });

  return rows;
}

function parsePorts($: CheerioAPI, td: Cheerio<Element>): ScrapedRecipePort[] {
  const ports: ScrapedRecipePort[] = [];
  td.find('a.mat-item').each((_, el) => {
    const a = $(el);
    const href = a.attr('href') ?? '';
    const hrefMatch = ITEM_HREF_PATTERN.exec(href);
    if (!hrefMatch?.[1]) return;
    const item_id = hrefMatch[1];
    const clone = a.clone();
    clone.find('.mat-hover-card').remove();
    clone.find('img').remove();
    const text = clone.text().trim();
    const qtyMatch = QUANTITY_PATTERN.exec(text);
    if (!qtyMatch?.[1]) return;
    const qty_per_cycle = Number.parseFloat(qtyMatch[1]);
    const display_name_zh_hans = text.replace(QUANTITY_PATTERN, '').trim();
    ports.push({ item_id, qty_per_cycle, display_name_zh_hans });
  });
  return ports;
}

export interface CrossReferenceInput {
  devices: ScrapedDevice[];
  recipes: ScrapedRecipe[];
  /** Map of slug -> device page HTML. */
  devicePages: ReadonlyMap<string, string>;
}

export interface CrossReferenceResult {
  devices: ScrapedDevice[];
  recipes: ScrapedRecipe[];
  /** Recipe fingerprints found on device pages but not in the global index. */
  unmatched: { device_id: string; fingerprint: RecipeFingerprint }[];
}

export function crossReference(input: CrossReferenceInput): CrossReferenceResult {
  const recipeByFingerprint = new Map<RecipeFingerprint, ScrapedRecipe>();
  for (const r of input.recipes) {
    recipeByFingerprint.set(fingerprintRecipe(r.inputs, r.outputs), r);
  }

  const recipesByDevice = new Map<string, Set<string>>();
  const devicesByRecipe = new Map<string, Set<string>>();
  const unmatched: CrossReferenceResult['unmatched'] = [];

  for (const device of input.devices) {
    const html = input.devicePages.get(device.id);
    if (!html) continue;
    const rows = parseDeviceRecipeRows(html);
    for (const row of rows) {
      const fp = fingerprintRecipe(row.inputs, row.outputs);
      const recipe = recipeByFingerprint.get(fp);
      if (!recipe) {
        unmatched.push({ device_id: device.id, fingerprint: fp });
        continue;
      }
      let rs = recipesByDevice.get(device.id);
      if (!rs) {
        rs = new Set<string>();
        recipesByDevice.set(device.id, rs);
      }
      rs.add(recipe.id);
      let ds = devicesByRecipe.get(recipe.id);
      if (!ds) {
        ds = new Set<string>();
        devicesByRecipe.set(recipe.id, ds);
      }
      ds.add(device.id);
    }
  }

  const devices = input.devices.map((d) => ({
    ...d,
    recipes: [...(recipesByDevice.get(d.id) ?? [])].sort(),
  }));
  const recipes = input.recipes.map((r) => ({
    ...r,
    compatible_devices: [...(devicesByRecipe.get(r.id) ?? [])].sort(),
  }));

  return { devices, recipes, unmatched };
}
