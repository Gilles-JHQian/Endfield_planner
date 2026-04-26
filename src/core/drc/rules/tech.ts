/** TECH_001 — placed device requires a tech that isn't unlocked yet.
 *
 *  Data dependencies:
 *  - bundle.tech_tree (currently NOT present — DataBundle has no tech_tree
 *    field as of 1.2; B3 import-endfield-calc would have provided it but was
 *    skipped). The rule reports the gap so the lint panel surfaces it.
 *  - project.unlocked_techs would be the per-project unlock set; not modeled
 *    yet either.
 *
 *  Until owner provides tech_tree.json, this rule is dormant. The skeleton
 *  here documents the intended check so the rule will light up once data and
 *  the project unlock model land.
 */
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

export const tech001: Rule = {
  id: 'TECH_001',
  severity: 'warning',
  // No tech_tree field on DataBundle today, so we always report the data gap.
  // When DataBundle gains `tech_tree` and Project gains `unlocked_techs`,
  // this becomes `bundle.tech_tree?.nodes.length ? [] : ['tech_tree']`.
  requires_data: (_bundle: DataBundle): DataPrereq[] => ['tech_tree'],
  run(_ctx: RuleContext): Issue[] {
    return [];
  },
};
