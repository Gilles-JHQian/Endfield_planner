/** Pick exactly one recipe from a candidate list, applying region filter and
 *  preference policy. Returns null when no candidate qualifies.
 */
import type { Recipe } from '@core/data-loader/index.ts';
import type { SolveOptions, SolveTarget } from './types.ts';

function regionAllows(recipe: Recipe, region_id: string | undefined): boolean {
  if (!region_id) return true;
  if (!recipe.regions || recipe.regions.length === 0) return true;
  return recipe.regions.includes(region_id);
}

function score(recipe: Recipe, preference: SolveOptions['recipe_preference']): number {
  if (preference === 'fewest_inputs') return recipe.inputs.length;
  // 'alphabetical' default: lower id wins. Score irrelevant; tiebreak does it all.
  return 0;
}

export function pickRecipe(
  candidates: readonly Recipe[],
  target: SolveTarget,
  opts: SolveOptions,
): Recipe | null {
  const eligible = candidates.filter((r) => regionAllows(r, target.region_id));
  if (eligible.length === 0) return null;
  // Sort by (score, id) — id is the deterministic tiebreak so the result is
  // stable across runs even when scores tie.
  const sorted = [...eligible].sort((a, b) => {
    const sa = score(a, opts.recipe_preference);
    const sb = score(b, opts.recipe_preference);
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  });
  return sorted[0] ?? null;
}
