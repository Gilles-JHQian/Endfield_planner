/** LAYER_CROSS_001 — pipe-side logistics infrastructure (`pipe-merger` /
 *  `pipe-splitter` / `pipe-cross-bridge` / pipe supports) shares a cell
 *  with a solid belt. Forbidden: those devices physically occupy both
 *  layers and block belts.
 *
 *  LAYER_CROSS_002 — belt-side logistics infrastructure shares a cell with
 *  a fluid pipe. **Asymmetric in P3:** the three solid bridges in
 *  SOLID_BRIDGE_IDS are exempted because they only operate on the solid
 *  layer and let fluid pipes pass underneath. Future solid-side infra
 *  that's *not* a bridge (lifters, supports, etc.) still triggers this rule.
 *
 *  REQUIREMENT.md §4.5.2 (P3 update). Layer discrimination uses
 *  device.has_fluid_interface as the proxy for "operates on fluid layer".
 */
import { footprintCells } from '@core/domain/geometry.ts';
import type { Cell } from '@core/domain/types.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';
import { SOLID_BRIDGE_IDS } from '../bridges.ts';

const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;

interface InfraSets {
  /** Cells covered by fluid-side logistics infra (blocks solid belts). */
  fluidInfra: Set<string>;
  /** Cells covered by solid-side logistics infra excluding the bridge family
   *  (blocks fluid pipes). */
  solidInfra: Set<string>;
}

function partitionLogisticsCells(ctx: RuleContext): InfraSets {
  const fluidInfra = new Set<string>();
  const solidInfra = new Set<string>();
  for (const placed of ctx.project.devices) {
    const dev = ctx.lookup(placed.device_id);
    if (dev?.category !== 'logistics') continue;
    const cells = footprintCells(dev, placed).map(cellKey);
    if (dev.has_fluid_interface) {
      for (const k of cells) fluidInfra.add(k);
    } else {
      // Solid bridges are exempt from LAYER_CROSS_002 (asymmetric narrowing).
      if (SOLID_BRIDGE_IDS.has(dev.id)) continue;
      for (const k of cells) solidInfra.add(k);
    }
  }
  return { fluidInfra, solidInfra };
}

const requiresLogistics = (bundle: DataBundle): DataPrereq[] =>
  bundle.devices.some((d) => d.category === 'logistics') ? [] : ['logistics_category'];

export const layerCross001: Rule = {
  id: 'LAYER_CROSS_001',
  severity: 'error',
  requires_data: requiresLogistics,
  run(ctx: RuleContext): Issue[] {
    const { fluidInfra } = partitionLogisticsCells(ctx);
    const issues: Issue[] = [];
    for (const link of ctx.project.solid_links) {
      for (const c of link.path) {
        if (fluidInfra.has(cellKey(c))) {
          issues.push({
            rule_id: 'LAYER_CROSS_001',
            severity: 'error',
            message_zh_hans: `物流带在 (${c.x.toString()},${c.y.toString()}) 经过流体基础设施`,
            message_en: `Solid belt passes through fluid logistics infrastructure at (${c.x.toString()},${c.y.toString()})`,
            cells: [c],
            link_id: link.id,
          });
          break;
        }
      }
    }
    return issues;
  },
};

export const layerCross002: Rule = {
  id: 'LAYER_CROSS_002',
  severity: 'error',
  requires_data: requiresLogistics,
  run(ctx: RuleContext): Issue[] {
    const { solidInfra } = partitionLogisticsCells(ctx);
    const issues: Issue[] = [];
    for (const link of ctx.project.fluid_links) {
      for (const c of link.path) {
        if (solidInfra.has(cellKey(c))) {
          issues.push({
            rule_id: 'LAYER_CROSS_002',
            severity: 'error',
            message_zh_hans: `流体管在 (${c.x.toString()},${c.y.toString()}) 经过物流基础设施（非桥）`,
            message_en: `Fluid pipe passes through non-bridge solid logistics infrastructure at (${c.x.toString()},${c.y.toString()})`,
            cells: [c],
            link_id: link.id,
          });
          break;
        }
      }
    }
    return issues;
  },
};
