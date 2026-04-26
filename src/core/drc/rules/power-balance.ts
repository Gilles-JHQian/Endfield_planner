/** POWER_002 — total power_draw exceeds total power_supply across the project.
 *
 *  Sums every placed device's `power_draw` and subtracts the sum of placed
 *  generators' `power_supply`. If demand > supply, raises an error pointing
 *  at the project as a whole (no specific cell).
 *
 *  Skipped if no device in the bundle declares `power_supply` (the heat pool
 *  data isn't loaded yet). Owners can manually add power_supply to the
 *  appropriate generators in devices.json once measured in-game; until then
 *  this rule is dormant.
 */
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

export const power002: Rule = {
  id: 'POWER_002',
  severity: 'error',
  requires_data: (bundle: DataBundle): DataPrereq[] => {
    const hasSupply = bundle.devices.some((d) => (d.power_supply ?? 0) > 0);
    return hasSupply ? [] : ['power_supply'];
  },
  run({ project, lookup }: RuleContext): Issue[] {
    let demand = 0;
    let supply = 0;
    for (const placed of project.devices) {
      const dev = lookup(placed.device_id);
      if (!dev) continue;
      demand += dev.power_draw;
      supply += dev.power_supply ?? 0;
    }
    if (demand <= supply) return [];
    return [
      {
        rule_id: 'POWER_002',
        severity: 'error',
        message_zh_hans: `总功耗 ${demand.toString()} 超出供给 ${supply.toString()}`,
        message_en: `Total power draw ${demand.toString()} exceeds supply ${supply.toString()}`,
        cells: [],
      },
    ];
  },
};
