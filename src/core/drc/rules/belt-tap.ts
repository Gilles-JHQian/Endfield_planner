/** BELT_TAP_001 — a solid link's endpoint sits on a non-endpoint cell of
 *  another solid link (a "mid-belt tap"), unless the endpoint cell coincides
 *  with a logistics bridge's port cell (merger / splitter / cross-bridge).
 *
 *  Mid-belt taps without a bridge device are illegal in-game; the bridge
 *  introduces a real input/output port that the joining belt can attach to.
 */
import { footprintCells } from '@core/domain/geometry.ts';
import type { Cell } from '@core/domain/types.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';
import { SOLID_BRIDGE_IDS } from '../bridges.ts';

const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;

export const beltTap001: Rule = {
  id: 'BELT_TAP_001',
  severity: 'error',
  requires_data: (bundle: DataBundle): DataPrereq[] =>
    bundle.transport_tiers.solid_belts.length > 0 ? [] : ['transport_tiers'],
  run({ project, lookup }: RuleContext): Issue[] {
    const links = project.solid_links;
    if (links.length < 2) return [];

    // Collect placed bridge cells (footprint cells of any device whose id is
    // in SOLID_BRIDGE_IDS). For 1×1 bridges the footprint IS the port cell.
    const bridgeCells = new Set<string>();
    for (const placed of project.devices) {
      if (!SOLID_BRIDGE_IDS.has(placed.device_id)) continue;
      const dev = lookup(placed.device_id);
      if (!dev) continue;
      for (const c of footprintCells(dev, placed)) bridgeCells.add(cellKey(c));
    }

    // For each link, build its set of interior cells (strictly between path[0]
    // and path[N-1]). Then for each other link's endpoints, see if any falls
    // on this set.
    const interiors = new Map<string, Set<string>>(); // link.id → cellKey set
    for (const link of links) {
      const set = new Set<string>();
      for (let i = 1; i < link.path.length - 1; i++) {
        set.add(cellKey(link.path[i]!));
      }
      interiors.set(link.id, set);
    }

    const issues: Issue[] = [];
    const reported = new Set<string>(); // dedupe by linkId+cellKey
    for (const link of links) {
      const endpoints: Cell[] = [];
      if (link.path.length > 0) endpoints.push(link.path[0]!);
      if (link.path.length > 1) endpoints.push(link.path[link.path.length - 1]!);
      for (const ep of endpoints) {
        const k = cellKey(ep);
        if (bridgeCells.has(k)) continue; // legal tap via bridge
        for (const other of links) {
          if (other.id === link.id) continue;
          const interior = interiors.get(other.id)!;
          if (!interior.has(k)) continue;
          const reportKey = `${link.id}@${k}`;
          if (reported.has(reportKey)) continue;
          reported.add(reportKey);
          issues.push({
            rule_id: 'BELT_TAP_001',
            severity: 'error',
            message_zh_hans: `物流带端点在 (${ep.x.toString()},${ep.y.toString()}) 接到另一条带的中段，需要桥接设备`,
            message_en: `Solid belt endpoint at (${ep.x.toString()},${ep.y.toString()}) taps mid-belt without a bridge device`,
            cells: [ep],
            link_id: link.id,
          });
          break;
        }
      }
    }
    return issues;
  },
};
