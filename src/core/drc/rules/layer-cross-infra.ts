/** LAYER_CROSS_001 / LAYER_CROSS_002 — pipe infrastructure (splitter / merger
 *  / bridge) cannot share a cell with a belt and vice versa.
 *
 *  REQUIREMENT.md §4.5.2: belts and pipes can occupy the same cell, but
 *  category=logistics infrastructure devices block both layers, so a belt
 *  passing under a pipe-bridge (or a pipe under a belt-bridge) is illegal.
 *
 *  We approximate "infrastructure" by category=='logistics'. Skipped if no
 *  bundle device has that category — owner needs the B3-style import to give
 *  us logistics device categorization, which the current 1.2 prod data lacks.
 */
import { footprintCells } from '@core/domain/geometry.ts';
import type { Cell, Layer } from '@core/domain/types.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext, RuleId } from '../types.ts';

const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;

/** Cells covered by every placed logistics device. */
function logisticsCells(ctx: RuleContext): Set<string> {
  const out = new Set<string>();
  for (const placed of ctx.project.devices) {
    const dev = ctx.lookup(placed.device_id);
    if (dev?.category !== 'logistics') continue;
    for (const c of footprintCells(dev, placed)) out.add(cellKey(c));
  }
  return out;
}

function makeLayerCrossRule(args: {
  id: RuleId;
  conflictLayer: Layer;
  messageZh: (cell: Cell) => string;
  messageEn: (cell: Cell) => string;
}): Rule {
  return {
    id: args.id,
    severity: 'error',
    requires_data: (bundle: DataBundle): DataPrereq[] =>
      bundle.devices.some((d) => d.category === 'logistics') ? [] : ['logistics_category'],
    run(ctx: RuleContext): Issue[] {
      const blocked = logisticsCells(ctx);
      const links =
        args.conflictLayer === 'solid' ? ctx.project.solid_links : ctx.project.fluid_links;
      const issues: Issue[] = [];
      for (const link of links) {
        for (const c of link.path) {
          if (blocked.has(cellKey(c))) {
            issues.push({
              rule_id: args.id,
              severity: 'error',
              message_zh_hans: args.messageZh(c),
              message_en: args.messageEn(c),
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
}

export const layerCross001: Rule = makeLayerCrossRule({
  id: 'LAYER_CROSS_001',
  conflictLayer: 'solid',
  messageZh: (c) => `物流带在 (${c.x.toString()},${c.y.toString()}) 经过流体基础设施`,
  messageEn: (c) =>
    `Solid belt passes through fluid logistics infrastructure at (${c.x.toString()},${c.y.toString()})`,
});

export const layerCross002: Rule = makeLayerCrossRule({
  id: 'LAYER_CROSS_002',
  conflictLayer: 'fluid',
  messageZh: (c) => `流体管在 (${c.x.toString()},${c.y.toString()}) 经过物流基础设施`,
  messageEn: (c) =>
    `Fluid pipe passes through solid logistics infrastructure at (${c.x.toString()},${c.y.toString()})`,
});
