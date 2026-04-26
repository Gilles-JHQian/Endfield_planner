/** LAYER_CROSS_003 — link path enters a device's footprint at a non-port cell.
 *
 *  Devices block both layers (REQUIREMENT.md §4.5) so the only way a link can
 *  legitimately overlap a device's cells is if it enters/exits exactly at one
 *  of the device's port cells. Any other cell-overlap is illegal.
 *
 *  This complements LAYER_CROSS_001/002 (which check infrastructure category
 *  conflicts) and runs only when at least one bundle device declares io_ports
 *  — without that data we can't tell port cells from non-port cells.
 */
import { footprintCells, portsInWorldFrame } from '@core/domain/geometry.ts';
import type { Cell } from '@core/domain/types.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;

export const layerCross003: Rule = {
  id: 'LAYER_CROSS_003',
  severity: 'error',
  requires_data: (bundle: DataBundle): DataPrereq[] =>
    bundle.devices.some((d) => d.io_ports.length > 0) ? [] : ['io_ports'],
  run({ project, lookup }: RuleContext): Issue[] {
    // Per device: the cells we MAY enter (port cells) and the cells we may NOT (rest of footprint).
    interface DeviceMask {
      instance_id: string;
      portCells: Set<string>;
      bodyCells: Set<string>;
    }
    const masks: DeviceMask[] = [];
    for (const placed of project.devices) {
      const dev = lookup(placed.device_id);
      if (!dev || dev.io_ports.length === 0) continue;
      const body = new Set(footprintCells(dev, placed).map(cellKey));
      const portCells = new Set(portsInWorldFrame(dev, placed).map((p) => cellKey(p.cell)));
      // Strip port cells from body so portCells / bodyCells are disjoint.
      for (const k of portCells) body.delete(k);
      masks.push({ instance_id: placed.instance_id, portCells, bodyCells: body });
    }

    const issues: Issue[] = [];
    const allLinks = [...project.solid_links, ...project.fluid_links];
    for (const link of allLinks) {
      for (const c of link.path) {
        const k = cellKey(c);
        for (const mask of masks) {
          if (mask.bodyCells.has(k)) {
            issues.push({
              rule_id: 'LAYER_CROSS_003',
              severity: 'error',
              message_zh_hans: `链路在非端口位置穿过设备 (${c.x.toString()},${c.y.toString()})`,
              message_en: `Link enters a device through a non-port cell at (${c.x.toString()},${c.y.toString()})`,
              cells: [c],
              link_id: link.id,
              device_instance_id: mask.instance_id,
            });
            break; // one issue per link cell is enough
          }
        }
      }
    }
    return issues;
  },
};
