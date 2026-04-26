/** BELT_001 — solid belt carrying more items/min than its tier supports.
 *
 *  Per-link evaluation: when a link has a known `src` port reference, we look
 *  up the source device's bound recipe and sum per-item output throughput.
 *  If any single item's items/min exceeds the link's tier_id capacity, flag.
 *
 *  Skipped if `bundle.transport_tiers.solid_belts` is empty (the only data
 *  source for tier capacities). In practice this is always populated from
 *  v1.2 onward (B2 hardcoded 30/60 items/min).
 *
 *  Inputs to a sink device follow the same logic via `dst`.
 */
import type { DataBundle, Recipe } from '@core/data-loader/types.ts';
import type { Link } from '@core/domain/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

export const belt001: Rule = {
  id: 'BELT_001',
  severity: 'error',
  requires_data: (bundle: DataBundle): DataPrereq[] =>
    bundle.transport_tiers.solid_belts.length > 0 ? [] : ['transport_tiers'],
  run({ project, bundle, lookup }: RuleContext): Issue[] {
    const tierCap = new Map(
      bundle.transport_tiers.solid_belts.map((t) => [t.id, t.items_per_minute]),
    );
    const recipeById = new Map(bundle.recipes.map((r) => [r.id, r]));
    return checkLinks({
      links: project.solid_links,
      tierCap,
      recipeById,
      project,
      lookup,
      ruleId: 'BELT_001',
      unit: 'items',
    });
  },
};

interface CheckArgs {
  links: readonly Link[];
  tierCap: Map<string, number>;
  recipeById: Map<string, Recipe>;
  project: RuleContext['project'];
  lookup: RuleContext['lookup'];
  ruleId: 'BELT_001' | 'PIPE_001';
  unit: 'items' | 'units';
}

export function checkLinks(args: CheckArgs): Issue[] {
  const issues: Issue[] = [];
  const placedById = new Map(args.project.devices.map((p) => [p.instance_id, p]));
  for (const link of args.links) {
    const cap = args.tierCap.get(link.tier_id);
    if (cap === undefined) continue;
    const ends = [link.src, link.dst].filter((e) => e !== undefined);
    for (const end of ends) {
      const placed = placedById.get(end.device_instance_id);
      if (!placed?.recipe_id) continue;
      const recipe = args.recipeById.get(placed.recipe_id);
      if (!recipe) continue;
      const flow = pickFlow(recipe, end === link.src ? 'output' : 'input');
      const peak = peakItemRate(recipe, flow);
      if (peak > cap) {
        const dev = args.lookup(placed.device_id);
        const name = dev?.display_name_zh_hans ?? placed.device_id;
        issues.push({
          rule_id: args.ruleId,
          severity: 'error',
          message_zh_hans: `${name} 的链路速率 ${peak.toString()}/分钟 超过 ${link.tier_id} 上限 ${cap.toString()}`,
          message_en: `Link from ${name} carries ${peak.toString()} ${args.unit}/min, exceeds ${link.tier_id} cap ${cap.toString()}`,
          cells: link.path.length > 0 ? [link.path[0]!] : [placed.position],
          link_id: link.id,
          device_instance_id: placed.instance_id,
        });
      }
    }
  }
  return issues;
}

function pickFlow(recipe: Recipe, side: 'input' | 'output'): readonly Recipe['inputs'][number][] {
  return side === 'output' ? recipe.outputs : recipe.inputs;
}

function peakItemRate(recipe: Recipe, ports: readonly Recipe['inputs'][number][]): number {
  let peak = 0;
  for (const p of ports) {
    const rate = (p.qty_per_cycle * 60) / recipe.cycle_seconds;
    if (rate > peak) peak = rate;
  }
  return peak;
}
