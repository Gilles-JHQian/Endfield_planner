/** Top-level solver entry point. Composes index → expand → aggregate. */
import type { DataBundle } from '@core/data-loader/index.ts';
import { buildRecipeIndex } from './types.ts';
import { expand } from './expand.ts';
import { aggregate } from './aggregate.ts';
import type { SolveOptions, SolveResult, SolveTarget } from './types.ts';

export * from './types.ts';
export { pickRecipe } from './pick-recipe.ts';
export { expand } from './expand.ts';
export { aggregate } from './aggregate.ts';

export function solveThroughput(
  bundle: DataBundle,
  target: SolveTarget,
  opts: SolveOptions = {},
): SolveResult {
  const index = buildRecipeIndex(bundle);
  const expansion = expand(index, target, opts);
  const agg = aggregate(bundle, index, expansion, target);

  return {
    target,
    nodes: agg.nodes,
    raw_inputs: agg.raw_inputs,
    byproducts: agg.byproducts,
    total_power_draw: agg.total_power_draw,
    total_footprint: agg.total_footprint,
    cycles: [...expansion.cycles].sort(),
    unproduced: [...expansion.unproduced].sort(),
  };
}
