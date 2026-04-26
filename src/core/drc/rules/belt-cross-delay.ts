/** BELT_CROSS_DELAY_001 — warning when a single solid belt path traverses
 *  more than `at_least` bridge cells per the latency_penalty thresholds in
 *  crossing_rules.same_layer_crossing.solid.
 *
 *  Stays a warning (not an error) per REQUIREMENT.md §5.5: bridges work, but
 *  each one drops effective throughput per the latency model. The first
 *  threshold to trigger raises the most-severe warning (highest threshold
 *  always wins because the array is sorted ascending in our test bundle).
 *
 *  Skipped if the bridge device id isn't in the bundle, OR if the latency
 *  model has no thresholds.
 */
import { footprintCells } from '@core/domain/geometry.ts';
import type { Cell, Project } from '@core/domain/types.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;

export const beltCrossDelay001: Rule = {
  id: 'BELT_CROSS_DELAY_001',
  severity: 'warning',
  requires_data: (bundle: DataBundle): DataPrereq[] => {
    const ids = new Set(bundle.devices.map((d) => d.id));
    const bid = bundle.crossing_rules.same_layer_crossing.solid.crossing_component_id;
    const hasModel =
      !!bundle.crossing_rules.same_layer_crossing.solid.latency_penalty?.thresholds.length;
    if (!ids.has(bid) || !hasModel) return ['bridge_devices_solid'];
    return [];
  },
  run({ project, bundle, lookup }: RuleContext): Issue[] {
    const bridgeId = bundle.crossing_rules.same_layer_crossing.solid.crossing_component_id;
    const penalty = bundle.crossing_rules.same_layer_crossing.solid.latency_penalty;
    if (!penalty) return [];
    const bridgeCells = bridgeFootprintCells(project, lookup, bridgeId);
    const issues: Issue[] = [];
    for (const link of project.solid_links) {
      const crossings = link.path.filter((c) => bridgeCells.has(cellKey(c))).length;
      // Find the highest threshold the crossings count meets.
      let triggered: { at_least: number; throughput_multiplier: number } | null = null;
      for (const t of penalty.thresholds) {
        if (crossings >= t.at_least) triggered = t;
      }
      if (triggered) {
        issues.push({
          rule_id: 'BELT_CROSS_DELAY_001',
          severity: 'warning',
          message_zh_hans: `链路跨过 ${crossings.toString()} 座桥，吞吐降至 ${(triggered.throughput_multiplier * 100).toFixed(0)}%`,
          message_en: `Link crosses ${crossings.toString()} bridges; throughput reduced to ${(triggered.throughput_multiplier * 100).toFixed(0)}%`,
          cells: link.path.length > 0 ? [link.path[0]!] : [],
          link_id: link.id,
        });
      }
    }
    return issues;
  },
};

function bridgeFootprintCells(
  project: Project,
  lookup: RuleContext['lookup'],
  bridgeId: string,
): Set<string> {
  const out = new Set<string>();
  for (const placed of project.devices) {
    if (placed.device_id !== bridgeId) continue;
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    for (const c of footprintCells(dev, placed)) out.add(cellKey(c));
  }
  return out;
}
