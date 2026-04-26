/** PORT_004 — bridge devices have a paired_opposite port constraint
 *  (REQUIREMENT.md §4.5.2) — both ports must connect on opposite sides of
 *  the bridge. If two links attach to the same bridge but on the same side
 *  (or perpendicular instead of opposite), the bridge is invalid.
 *
 *  Identifies bridge devices via crossing_rules.same_layer_crossing.{solid|fluid}
 *  .crossing_component_id. Skipped if either bridge id isn't in bundle.devices —
 *  that's the case for current 1.2 prod data which doesn't ship bridge devices.
 */
import type { DataBundle } from '@core/data-loader/types.ts';
import type { PortRef } from '@core/domain/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

export const port004: Rule = {
  id: 'PORT_004',
  severity: 'error',
  requires_data: (bundle: DataBundle): DataPrereq[] => {
    const ids = new Set(bundle.devices.map((d) => d.id));
    const missing: DataPrereq[] = [];
    if (!ids.has(bundle.crossing_rules.same_layer_crossing.solid.crossing_component_id))
      missing.push('bridge_devices_solid');
    if (!ids.has(bundle.crossing_rules.same_layer_crossing.fluid.crossing_component_id))
      missing.push('bridge_devices_fluid');
    return missing;
  },
  run({ project, bundle, lookup }: RuleContext): Issue[] {
    const bridgeIds = new Set([
      bundle.crossing_rules.same_layer_crossing.solid.crossing_component_id,
      bundle.crossing_rules.same_layer_crossing.fluid.crossing_component_id,
    ]);
    const issues: Issue[] = [];
    for (const placed of project.devices) {
      if (!bridgeIds.has(placed.device_id)) continue;
      const dev = lookup(placed.device_id);
      if (!dev) continue;
      // For each pair (src, dst) of links attached to this bridge, check that
      // the two attached port indices are paired_opposite (sides differ by 180°).
      const refs: PortRef[] = [];
      for (const l of [...project.solid_links, ...project.fluid_links]) {
        if (l.src?.device_instance_id === placed.instance_id) refs.push(l.src);
        if (l.dst?.device_instance_id === placed.instance_id) refs.push(l.dst);
      }
      const sides = refs
        .map((r) => dev.io_ports[r.port_index]?.side)
        .filter((s) => s !== undefined);
      if (sides.length === 2 && !areOpposite(sides[0]!, sides[1]!)) {
        issues.push({
          rule_id: 'PORT_004',
          severity: 'error',
          message_zh_hans: `桥接设备 ${dev.display_name_zh_hans} 的两端必须接在相对的两个方向`,
          message_en: `Bridge ${dev.display_name_en ?? dev.id} requires both ports connected on opposite sides`,
          cells: [placed.position],
          device_instance_id: placed.instance_id,
        });
      }
    }
    return issues;
  },
};

function areOpposite(a: string, b: string): boolean {
  return (
    (a === 'N' && b === 'S') ||
    (a === 'S' && b === 'N') ||
    (a === 'E' && b === 'W') ||
    (a === 'W' && b === 'E')
  );
}
