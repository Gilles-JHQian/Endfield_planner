/** PORT_001 — placed device has a required input port with no link attached.
 *
 *  "Required" = direction_constraint === 'input'. Bidirectional ports don't
 *  participate (they may legitimately be unwired). For each input port we
 *  scan all links of the matching layer (solid for solid kind, fluid for
 *  fluid) and check whether any of them lists `dst.device_instance_id` ==
 *  this placed device + port_index match.
 *
 *  Skipped if no device in the bundle declares io_ports — without port
 *  geometry the rule has nothing to evaluate.
 */
import type { DataBundle } from '@core/data-loader/types.ts';
import type { Link } from '@core/domain/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

export const port001: Rule = {
  id: 'PORT_001',
  severity: 'error',
  requires_data: (bundle: DataBundle): DataPrereq[] =>
    bundle.devices.some((d) => d.io_ports.length > 0) ? [] : ['io_ports'],
  run({ project, lookup }: RuleContext): Issue[] {
    const allLinks: readonly Link[] = [...project.solid_links, ...project.fluid_links];
    const issues: Issue[] = [];
    for (const placed of project.devices) {
      const dev = lookup(placed.device_id);
      if (!dev || dev.io_ports.length === 0) continue;
      dev.io_ports.forEach((port, port_index) => {
        if (port.direction_constraint !== 'input') return;
        if (port.kind === 'power') return; // power doesn't route via links
        const wantedLayer = port.kind === 'solid' ? 'solid' : 'fluid';
        const isAttached = allLinks.some(
          (l) =>
            l.layer === wantedLayer &&
            l.dst?.device_instance_id === placed.instance_id &&
            l.dst.port_index === port_index,
        );
        if (!isAttached) {
          issues.push({
            rule_id: 'PORT_001',
            severity: 'error',
            message_zh_hans: `${dev.display_name_zh_hans} 的输入端口 #${port_index.toString()} (${port.side}) 未接入`,
            message_en: `${dev.display_name_en ?? dev.id} input port #${port_index.toString()} (${port.side}) is not connected`,
            cells: [placed.position],
            device_instance_id: placed.instance_id,
          });
        }
      });
    }
    return issues;
  },
};
