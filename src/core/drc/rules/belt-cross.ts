/** BELT_CROSS_001 — two solid belts share a cell with **perpendicular**
 *  directions but no cross-bridge is placed at that cell.
 *  PIPE_CROSS_001 — same for fluid pipes.
 *
 *  Scope narrowed in P3: parallel-direction overlap is BELT_PARALLEL_001's
 *  job, corner cells are BELT_CORNER_001's. This rule only flags the
 *  perpendicular case (the only one a cross-bridge can resolve).
 *
 *  The bridge id comes from crossing_rules.same_layer_crossing.{solid|fluid}
 *  .crossing_component_id; the rule is gated until that id maps to an actual
 *  device in bundle.devices.
 */
import { footprintCells } from '@core/domain/geometry.ts';
import type { Cell, Layer, Link, Project } from '@core/domain/types.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext, RuleId } from '../types.ts';

const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;

type Orient = 'h' | 'v';

/** All orientations a link runs through cell c — empty if c not on path,
 *  one element for straight cells, ['h','v'] for corner cells. */
function orientationsAtCell(link: Link, cell: Cell): Orient[] {
  const path = link.path;
  const orients = new Set<Orient>();
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    if (p.x !== cell.x || p.y !== cell.y) continue;
    if (i > 0) {
      const prev = path[i - 1]!;
      orients.add(prev.x === p.x ? 'v' : 'h');
    }
    if (i < path.length - 1) {
      const next = path[i + 1]!;
      orients.add(next.x === p.x ? 'v' : 'h');
    }
  }
  return Array.from(orients);
}

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

  // Index cells → list of {link, its orientations at that cell}.
  const byCell = new Map<string, { link: Link; orients: Orient[] }[]>();
  for (const link of links) {
    const seen = new Set<string>();
    for (const c of link.path) {
      const k = cellKey(c);
      if (seen.has(k)) continue;
      seen.add(k);
      const orients = orientationsAtCell(link, c);
      if (orients.length === 0) continue;
      const arr = byCell.get(k) ?? [];
      arr.push({ link, orients });
      byCell.set(k, arr);
    }
  }

  const issues: Issue[] = [];
  for (const [k, occupants] of byCell) {
    if (occupants.length < 2) continue;
    if (bridgeCells.has(k)) continue;
    // Skip parallel/corner cases (handled by BELT_PARALLEL_001 / BELT_CORNER_001).
    const anyCorner = occupants.some((o) => o.orients.length >= 2);
    if (anyCorner) continue;
    let hasH = false;
    let hasV = false;
    for (const o of occupants) {
      if (o.orients[0] === 'h') hasH = true;
      else hasV = true;
    }
    if (!(hasH && hasV)) continue; // pure parallel — let BELT_PARALLEL handle it
    const [x, y] = k.split(',').map((p) => Number.parseInt(p, 10));
    issues.push({
      rule_id: ruleId,
      severity: 'error',
      message_zh_hans: `${layer === 'solid' ? '物流带' : '流体管'} 在 (${(x ?? 0).toString()},${(y ?? 0).toString()}) 垂直交叉但未放置交叉桥`,
      message_en: `Perpendicular ${layer} crossing at (${(x ?? 0).toString()},${(y ?? 0).toString()}) without a cross-bridge device`,
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
