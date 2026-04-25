/**
 * Synthesize items.json from the recipe catalog: every item that appears as
 * an input or output gets one record with display_name and a heuristic kind.
 *
 * Known accuracy gaps (acceptable for v1, follow-up TODO):
 * - kind detection is by slug prefix (`item-liquid-` => fluid). Other fluids
 *   slip through as solid. The device editor / item-page scraper can fix this.
 * - rarity defaults to 1; the recipes index hover-card has rarity but we don't
 *   currently extract it.
 */
import type { ScrapedRecipe, ScrapedRecipePort } from './types.ts';

export interface ScrapedItem {
  id: string;
  display_name_zh_hans: string;
  kind: 'solid' | 'fluid';
  rarity: number;
}

const FLUID_SLUG_PREFIXES = ['item-liquid-'];

export function deriveItems(recipes: readonly ScrapedRecipe[]): ScrapedItem[] {
  const byId = new Map<string, ScrapedItem>();
  const visit = (port: ScrapedRecipePort): void => {
    if (byId.has(port.item_id)) return;
    byId.set(port.item_id, {
      id: port.item_id,
      display_name_zh_hans: port.display_name_zh_hans || port.item_id,
      kind: FLUID_SLUG_PREFIXES.some((p) => port.item_id.startsWith(p)) ? 'fluid' : 'solid',
      rarity: 1,
    });
  };
  for (const r of recipes) {
    for (const i of r.inputs) visit(i);
    for (const o of r.outputs) visit(o);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
