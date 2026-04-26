/** PORT_003 — link layer doesn't match the kind of port it's attached to.
 *
 *  - solid_link with src/dst pointing at a fluid port → error
 *  - fluid_link with src/dst pointing at a solid port → error
 *  - any link with src/dst pointing at a power port → error (power doesn't route)
 *
 *  Skipped if no device in the bundle declares io_ports.
 */
import type { DataBundle } from '@core/data-loader/types.ts';
import type { Layer, Link, PortRef } from '@core/domain/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

export const port003: Rule = {
  id: 'PORT_003',
  severity: 'error',
  requires_data: (bundle: DataBundle): DataPrereq[] =>
    bundle.devices.some((d) => d.io_ports.length > 0) ? [] : ['io_ports'],
  run({ project, lookup }: RuleContext): Issue[] {
    const placedById = new Map(project.devices.map((p) => [p.instance_id, p]));
    const issues: Issue[] = [];
    const consider = (link: Link, end: PortRef | undefined): void => {
      if (!end) return;
      const placed = placedById.get(end.device_instance_id);
      if (!placed) return;
      const dev = lookup(placed.device_id);
      if (!dev) return;
      const port = dev.io_ports[end.port_index];
      if (!port) return;
      if (port.kind === 'power') {
        issues.push({
          rule_id: 'PORT_003',
          severity: 'error',
          message_zh_hans: `${dev.display_name_zh_hans} 端口 #${end.port_index.toString()} 是电力端口，不能接入物流`,
          message_en: `${dev.display_name_en ?? dev.id} port #${end.port_index.toString()} is a power port and cannot carry transport links`,
          cells: link.path.length > 0 ? [link.path[0]!] : [placed.position],
          link_id: link.id,
          device_instance_id: placed.instance_id,
        });
        return;
      }
      const expected: Layer = port.kind === 'solid' ? 'solid' : 'fluid';
      if (link.layer !== expected) {
        issues.push({
          rule_id: 'PORT_003',
          severity: 'error',
          message_zh_hans: `${link.layer === 'solid' ? '物流带' : '流体管'} 接入了 ${dev.display_name_zh_hans} 的 ${port.kind === 'solid' ? '物流' : '流体'} 端口`,
          message_en: `${link.layer} link attached to ${port.kind} port on ${dev.display_name_en ?? dev.id}`,
          cells: link.path.length > 0 ? [link.path[0]!] : [placed.position],
          link_id: link.id,
          device_instance_id: placed.instance_id,
        });
      }
    };
    for (const l of project.solid_links) {
      consider(l, l.src);
      consider(l, l.dst);
    }
    for (const l of project.fluid_links) {
      consider(l, l.src);
      consider(l, l.dst);
    }
    return issues;
  },
};
