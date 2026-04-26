/** BELT_CROSS_001 — two solid belts share a cell without a bridge device.
 *  PIPE_CROSS_001 — same for fluid pipes.
 *
 *  Same-layer crossing requires a bridge device at the crossing cell. The
 *  bridge id comes from crossing_rules.same_layer_crossing.{solid|fluid}
 *  .crossing_component_id; the rule is gated until that id maps to an actual
 *  device in bundle.devices.
 *
 *  Note: addLink already rejects same-layer same-cell collisions during the
 *  edit, so this rule mostly catches imported / legacy projects where the
 *  occupancy invariants weren't enforced.
 */
import { footprintCells } from '@core/domain/geometry.ts';
import type { Cell, Layer, Project } from '@core/domain/types.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext, RuleId } from '../types.ts';

const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;

function makeRule(opts: {
  id: RuleId;
  layer: Layer;
  prereq: DataPrereq;
  componentIdFor: (b: DataBundle) => string;
}): Rule {
  return {
    id: opts.id,
    severity: 'error',
    requires_data: (bundle: DataBundle): DataPrereq[] => {
      const ids = new Set(bundle.devices.map((d) => d.id));
      return ids.has(opts.componentIdFor(bundle)) ? [] : [opts.prereq];
    },
    run(ctx: RuleContext): Issue[] {
      return findCrossingIssues({
        ctx,
        layer: opts.layer,
        bridgeId: opts.componentIdFor(ctx.bundle),
        ruleId: opts.id,
      });
    },
  };
}

function findCrossingIssues(args: {
  ctx: RuleContext;
  layer: Layer;
  bridgeId: string;
  ruleId: RuleId;
}): Issue[] {
  const { ctx, layer, bridgeId, ruleId } = args;
  const links = layer === 'solid' ? ctx.project.solid_links : ctx.project.fluid_links;
  // Compute the set of cells covered by a bridge device of the right id.
  const bridgeCells = bridgeFootprintCells(ctx.project, ctx.lookup, bridgeId);

  // Tally which cells are covered by 2+ links of this layer.
  const counts = new Map<string, number>();
  for (const link of links) {
    for (const c of link.path) {
      const k = cellKey(c);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const issues: Issue[] = [];
  for (const [k, n] of counts) {
    if (n < 2) continue;
    if (bridgeCells.has(k)) continue;
    const [x, y] = k.split(',').map((p) => Number.parseInt(p, 10));
    issues.push({
      rule_id: ruleId,
      severity: 'error',
      message_zh_hans: `${layer === 'solid' ? '物流带' : '流体管'} 在 (${(x ?? 0).toString()},${(y ?? 0).toString()}) 同层交叉但未放置桥接`,
      message_en: `Same-layer ${layer} crossing at (${(x ?? 0).toString()},${(y ?? 0).toString()}) without a bridge device`,
      cells: [{ x: x ?? 0, y: y ?? 0 }],
    });
  }
  return issues;
}

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

export const beltCross001: Rule = makeRule({
  id: 'BELT_CROSS_001',
  layer: 'solid',
  prereq: 'bridge_devices_solid',
  componentIdFor: (b) => b.crossing_rules.same_layer_crossing.solid.crossing_component_id,
});

export const pipeCross001: Rule = makeRule({
  id: 'PIPE_CROSS_001',
  layer: 'fluid',
  prereq: 'bridge_devices_fluid',
  componentIdFor: (b) => b.crossing_rules.same_layer_crossing.fluid.crossing_component_id,
});
