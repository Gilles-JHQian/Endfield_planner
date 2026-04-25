/** Recursive top-down recipe expansion.
 *
 *  Walks demand from the target item back to its raw inputs. Picks one recipe
 *  per item (see pick-recipe.ts), accumulates runs-per-minute additively when
 *  the same recipe is reached through multiple paths, and stops descending
 *  when it would re-enter a recipe already on the call stack — those are
 *  cycles per §G "酮化灌木 self-loop". Cycle handling at this stage is the
 *  minimal "stop and report" pattern; the LP-style fixed-point solve §6.1
 *  alludes to is deferred until the recursive solver is shown to be too
 *  loose for the §10.6 planter cases.
 */
import { pickRecipe } from './pick-recipe.ts';
import type { RecipeIndex, SolveOptions, SolveTarget } from './types.ts';

export interface ExpansionResult {
  /** Recipe id → fractional runs-per-minute needed (round up at aggregate time). */
  readonly runs_by_recipe: ReadonlyMap<string, number>;
  /** Recipes whose expansion was short-circuited because of a dependency cycle. */
  readonly cycles: ReadonlySet<string>;
  /** Items the solver had to leave unexplored — no producing recipe in the chosen region. */
  readonly unproduced: ReadonlySet<string>;
}

const EPSILON = 1e-9;

export function expand(
  index: RecipeIndex,
  target: SolveTarget,
  opts: SolveOptions,
): ExpansionResult {
  const runs_by_recipe = new Map<string, number>();
  const cycles = new Set<string>();
  const unproduced = new Set<string>();
  const visiting = new Set<string>();

  function walk(item_id: string, rate_per_minute: number): void {
    if (rate_per_minute <= EPSILON) return;

    const candidates = index.byOutput.get(item_id);
    if (!candidates || candidates.length === 0) {
      unproduced.add(item_id);
      return;
    }
    const recipe = pickRecipe(candidates, target, opts);
    if (!recipe) {
      unproduced.add(item_id);
      return;
    }
    if (visiting.has(recipe.id)) {
      cycles.add(recipe.id);
      return;
    }

    const out = recipe.outputs.find((o) => o.item_id === item_id);
    if (!out || out.qty_per_cycle <= 0) return;

    const cycles_per_minute = 60 / recipe.cycle_seconds;
    const runs_needed = rate_per_minute / (out.qty_per_cycle * cycles_per_minute);

    runs_by_recipe.set(recipe.id, (runs_by_recipe.get(recipe.id) ?? 0) + runs_needed);

    visiting.add(recipe.id);
    for (const inp of recipe.inputs) {
      walk(inp.item_id, inp.qty_per_cycle * cycles_per_minute * runs_needed);
    }
    visiting.delete(recipe.id);
  }

  walk(target.item_id, target.rate_per_minute);
  return { runs_by_recipe, cycles, unproduced };
}
