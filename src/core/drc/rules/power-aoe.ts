/** POWER_001 — placed device that requires power isn't inside any
 *  device_supply 供电桩's AoE square (REQUIREMENT.md §4.6).
 *
 *  Skipped if no device in the bundle has `power_aoe.purpose === 'device_supply'`.
 *  (中继器 / pole_link AoEs only extend pole-to-pole connectivity, NOT supply.)
 *
 *  AoE math lives in `@core/domain/power-coverage.ts` so the UI badge and
 *  POWER view-mode overlay share one source of truth.
 */
import { computePowerCoverage } from '@core/domain/power-coverage.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

export const power001: Rule = {
  id: 'POWER_001',
  severity: 'error',
  requires_data: (bundle: DataBundle): DataPrereq[] => {
    const hasSupply = bundle.devices.some((d) => d.power_aoe?.purpose === 'device_supply');
    return hasSupply ? [] : ['power_aoe_supply'];
  },
  run({ project, lookup }: RuleContext): Issue[] {
    const coverage = computePowerCoverage(project, lookup);
    const issues: Issue[] = [];
    for (const placed of project.devices) {
      const dev = lookup(placed.device_id);
      if (!dev?.requires_power) continue;
      // Suppliers self-cover (power-coverage logic adds them).
      if (dev.power_aoe?.purpose === 'device_supply') continue;
      if (coverage.coveredInstanceIds.has(placed.instance_id)) continue;
      issues.push({
        rule_id: 'POWER_001',
        severity: 'error',
        message_zh_hans: `设备 ${dev.display_name_zh_hans} 不在任何供电桩的 AoE 内`,
        message_en: `Device ${dev.display_name_en ?? dev.id} is outside every power pole AoE`,
        cells: [placed.position],
        device_instance_id: placed.instance_id,
      });
    }
    return issues;
  },
};
