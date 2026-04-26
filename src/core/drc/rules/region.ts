/** REGION_001 — placed device falls (partly) outside the plot.
 *
 *  This shouldn't happen in practice because placeDevice/moveDevice both
 *  reject out-of-plot placements, but DRC is the long-tail safety net for:
 *  - imported projects with stale data_version where the plot shrank
 *  - projects where resizePlot was forced past the conflict check (future)
 */
import { fitsInPlot } from '@core/domain/geometry.ts';
import type { Issue, Rule, RuleContext } from '../types.ts';

export const region001: Rule = {
  id: 'REGION_001',
  severity: 'error',
  requires_data: () => [],
  run({ project, lookup }: RuleContext): Issue[] {
    const issues: Issue[] = [];
    for (const placed of project.devices) {
      const dev = lookup(placed.device_id);
      if (!dev) continue;
      if (!fitsInPlot(dev, placed, project.plot)) {
        issues.push({
          rule_id: 'REGION_001',
          severity: 'error',
          message_zh_hans: `设备 ${dev.display_name_zh_hans} 部分超出地块边界`,
          message_en: `Device ${dev.display_name_en ?? dev.id} extends outside the plot`,
          cells: [placed.position],
          device_instance_id: placed.instance_id,
        });
      }
    }
    return issues;
  },
};
