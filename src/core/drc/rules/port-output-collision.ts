/** PORT_002 — two output ports feeding the same downstream cell without a
 *  merger device in between. Endfield mergers ("汇流器") are the only way two
 *  belt outputs can converge legally; otherwise the belts arrive at the same
 *  cell and the game treats it as a collision.
 *
 *  Without merger device IDs declared in the data we can't reliably tell a
 *  legal merger placement from a hot junction. For MVP we emit a warning when
 *  two output-attached links share their first non-source cell, gated on
 *  io_ports being available so we can identify "output" link ends.
 */
import type { DataBundle } from '@core/data-loader/types.ts';
import type { Cell, PortRef } from '@core/domain/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;

export const port002: Rule = {
  id: 'PORT_002',
  severity: 'warning',
  requires_data: (bundle: DataBundle): DataPrereq[] =>
    bundle.devices.some((d) => d.io_ports.length > 0) ? [] : ['io_ports'],
  run({ project, lookup }: RuleContext): Issue[] {
    const placedById = new Map(project.devices.map((p) => [p.instance_id, p]));
    const isOutputPort = (ref: PortRef | undefined): boolean => {
      if (!ref) return false;
      const placed = placedById.get(ref.device_instance_id);
      if (!placed) return false;
      const dev = lookup(placed.device_id);
      return dev?.io_ports[ref.port_index]?.direction_constraint === 'output';
    };

    // For each link whose src is an output port, record the path's last cell
    // (the candidate downstream cell). If two such links land on the same cell,
    // they're attempting to merge without a merger.
    const downstream = new Map<string, string[]>(); // cellKey → link ids
    for (const link of [...project.solid_links, ...project.fluid_links]) {
      if (!isOutputPort(link.src)) continue;
      const last = link.path[link.path.length - 1];
      if (!last) continue;
      const k = cellKey(last);
      const arr = downstream.get(k) ?? [];
      arr.push(link.id);
      downstream.set(k, arr);
    }
    const issues: Issue[] = [];
    for (const [k, ids] of downstream) {
      if (ids.length < 2) continue;
      const [x, y] = k.split(',').map((n) => Number.parseInt(n, 10));
      issues.push({
        rule_id: 'PORT_002',
        severity: 'warning',
        message_zh_hans: `两条输出链路在 (${(x ?? 0).toString()},${(y ?? 0).toString()}) 直接合流，缺少汇流器`,
        message_en: `Two output links converge at (${(x ?? 0).toString()},${(y ?? 0).toString()}) without a merger device`,
        cells: [{ x: x ?? 0, y: y ?? 0 }],
        link_id: ids[0]!,
      });
    }
    return issues;
  },
};
