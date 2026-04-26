/** PIPE_001 — fluid pipe carrying more units/min than its tier supports.
 *  Mirror of BELT_001 against bundle.transport_tiers.fluid_pipes.
 */
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';
import { checkLinks } from './belt-bandwidth.ts';

export const pipe001: Rule = {
  id: 'PIPE_001',
  severity: 'error',
  requires_data: (bundle: DataBundle): DataPrereq[] =>
    bundle.transport_tiers.fluid_pipes.length > 0 ? [] : ['transport_tiers'],
  run({ project, bundle, lookup }: RuleContext): Issue[] {
    const tierCap = new Map(
      bundle.transport_tiers.fluid_pipes.map((t) => [t.id, t.units_per_minute]),
    );
    const recipeById = new Map(bundle.recipes.map((r) => [r.id, r]));
    return checkLinks({
      links: project.fluid_links,
      tierCap,
      recipeById,
      project,
      lookup,
      ruleId: 'PIPE_001',
      unit: 'units',
    });
  },
};
