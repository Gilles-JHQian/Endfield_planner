/** Public types for the throughput solver. The solver consumes a DataBundle
 *  and a target (item + rate per minute), and returns a recipe graph plus
 *  rollups (machine count, raw inputs, total power, total footprint).
 */
import type { DataBundle, Recipe } from '@core/data-loader/index.ts';

export interface SolveTarget {
  readonly item_id: string;
  readonly rate_per_minute: number;
  /** Region id from the bundle. Used to pick region-restricted recipes. */
  readonly region_id?: string;
}

export interface SolveOptions {
  /**
   * Preference between competing recipes for the same item.
   * - 'alphabetical' (default): pick the first recipe by id. Fully deterministic.
   * - 'fewest_inputs': pick the recipe with the smallest input count.
   */
  readonly recipe_preference?: 'alphabetical' | 'fewest_inputs';
}

export interface RecipeNode {
  readonly recipe_id: string;
  readonly machine_id: string | null;
  readonly runs_per_minute: number;
  readonly machine_count: number;
  readonly power_draw: number;
  readonly footprint: number;
}

export interface SolveResult {
  readonly target: SolveTarget;
  readonly nodes: readonly RecipeNode[];
  /** Items consumed but never produced, in items-per-minute. */
  readonly raw_inputs: Readonly<Record<string, number>>;
  /** Items produced in excess of consumption (byproducts), items-per-minute. */
  readonly byproducts: Readonly<Record<string, number>>;
  readonly total_power_draw: number;
  readonly total_footprint: number;
  /** Recipes encountered along a cycle — solver stopped expanding to avoid
   *  infinite recursion. Surfaced so the UI can warn. */
  readonly cycles: readonly string[];
  /** Item ids the solver could not find a producing recipe for in the chosen
   *  region. They appear in raw_inputs by definition. */
  readonly unproduced: readonly string[];
}

/** Internal bundle index built once per solve, exported for tests. */
export interface RecipeIndex {
  /** All recipes that produce the given item, in deterministic order. */
  byOutput: ReadonlyMap<string, readonly Recipe[]>;
  byId: ReadonlyMap<string, Recipe>;
}

export function buildRecipeIndex(bundle: DataBundle): RecipeIndex {
  const byOutput = new Map<string, Recipe[]>();
  const byId = new Map<string, Recipe>();
  // Iterate sorted-by-id so the byOutput buckets are deterministic.
  const sorted = [...bundle.recipes].sort((a, b) => a.id.localeCompare(b.id));
  for (const recipe of sorted) {
    byId.set(recipe.id, recipe);
    for (const out of recipe.outputs) {
      const list = byOutput.get(out.item_id);
      if (list) list.push(recipe);
      else byOutput.set(out.item_id, [recipe]);
    }
  }
  return { byOutput, byId };
}
