/**
 * Parse /zh-Hans/factory/recipes/ (the global recipe browser) into a list of
 * ScrapedRecipe records.
 *
 * Each row is `<tr data-recipe-row>` with four columns:
 *   1. inputs  — `div.recipe-items > a.mat-item[href="/zh-Hans/items/<slug>/"]`
 *      whose visible text is `<name> ×<qty>`.
 *   2. arrow   — ignored.
 *   3. outputs — same shape as inputs.
 *   4. duration — `span.recipe-duration` with text `Ns` (seconds).
 *
 * Recipes have no end.wiki URL slug; we synthesize stable ids from the primary
 * output item slug, disambiguating duplicates with a numeric suffix. The
 * cross-reference pass later attaches `compatible_devices`.
 */
import { load, type CheerioAPI, type Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import type { ScrapedRecipe, ScrapedRecipePort } from './types.ts';

const ITEM_HREF_PATTERN = /^\/zh-Hans\/items\/([a-z0-9][a-z0-9-]*)\/?$/;
const QUANTITY_PATTERN = /×\s*([0-9]+(?:\.[0-9]+)?)/;
const DURATION_PATTERN = /^([0-9]+(?:\.[0-9]+)?)s$/;

function parseRecipeItems($: CheerioAPI, td: Cheerio<Element>): ScrapedRecipePort[] {
  const ports: ScrapedRecipePort[] = [];
  td.find('a.mat-item').each((_, el) => {
    const a = $(el);
    const href = a.attr('href') ?? '';
    const hrefMatch = ITEM_HREF_PATTERN.exec(href);
    if (!hrefMatch?.[1]) return;
    const item_id = hrefMatch[1];

    // Visible text is "<display name> ×<qty>" plus possibly a hover-card subtree;
    // the hover-card lives in a span with class mat-hover-card. Drop it before reading text.
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

function parseDuration(td: Cheerio<Element>): number | null {
  const text = td.find('.recipe-duration').first().text().trim();
  if (!text) return null;
  const match = DURATION_PATTERN.exec(text);
  if (!match?.[1]) {
    throw new Error(`Cannot parse recipe duration "${text}"`);
  }
  return Number.parseFloat(match[1]);
}

function synthesizeId(outputs: ScrapedRecipePort[], used: Map<string, number>): string {
  const primary = outputs[0]?.item_id ?? 'unknown';
  const base = `recipe-${primary.replace(/^item-/, '')}`;
  const seen = used.get(base) ?? 0;
  used.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${(seen + 1).toString()}`;
}

export function parseRecipesIndex(html: string): ScrapedRecipe[] {
  const $ = load(html);
  const recipes: ScrapedRecipe[] = [];
  const usedIds = new Map<string, number>();

  // The recipes browser repeats some recipes when multiple devices can run them
  // and includes plant/seed rows with no duration (planting cycle is wall-clock,
  // not a per-machine cycle_seconds). Dedup by data-recipe-text and skip
  // duration-less rows; the latter belong to the §10.6 planter modeling gap.
  const seenText = new Set<string>();

  $('tr[data-recipe-row]').each((_, el) => {
    const tr = $(el);
    const recipeText = (tr.attr('data-recipe-text') ?? '').trim();
    if (recipeText && seenText.has(recipeText)) return;

    const tds = tr.children('td');
    if (tds.length < 4) return;

    const inputsTd = tds.eq(0);
    const outputsTd = tds.eq(2);
    const durationTd = tds.eq(3);

    const cycle_seconds = parseDuration(durationTd);
    if (cycle_seconds === null) return;

    const inputs = parseRecipeItems($, inputsTd);
    const outputs = parseRecipeItems($, outputsTd);
    if (outputs.length === 0) return;

    if (recipeText) seenText.add(recipeText);
    const id = synthesizeId(outputs, usedIds);
    const display_name_zh_hans = outputs[0]?.display_name_zh_hans ?? id;

    recipes.push({
      id,
      display_name_zh_hans,
      cycle_seconds,
      inputs,
      outputs,
      compatible_devices: [],
    });
  });

  return recipes;
}
