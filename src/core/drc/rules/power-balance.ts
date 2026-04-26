/** POWER_002 — total power_draw of POWERED devices exceeds total power_supply.
 *
 *  P3 update: demand counts only devices currently inside a supply pole's
 *  AoE (`computePowerCoverage`). Uncovered devices are flagged separately
 *  by POWER_001 and aren't running, so charging them against the grid would
 *  double-count. Suppliers' own power_draw is included if they require power
 *  themselves (uncommon but legal in the data).
 *
 *  Skipped if no device in the bundle declares `power_supply` (the heat pool
 *  data isn't loaded yet).
 */
import { computePowerCoverage } from '@core/domain/power-coverage.ts';
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
    const coverage = computePowerCoverage(project, lookup);
    let demand = 0;
    let supply = 0;
    for (const placed of project.devices) {
      const dev = lookup(placed.device_id);
      if (!dev) continue;
      supply += dev.power_supply ?? 0;
      if (dev.requires_power && coverage.coveredInstanceIds.has(placed.instance_id)) {
        demand += dev.power_draw;
      }
    }
    if (demand <= supply) return [];
    return [
      {
        rule_id: 'POWER_002',
        severity: 'error',
        message_zh_hans: `已通电设备总功耗 ${demand.toString()} 超出供给 ${supply.toString()}`,
        message_en: `Total power draw of covered devices ${demand.toString()} exceeds supply ${supply.toString()}`,
        cells: [],
      },
    ];
  },
};
