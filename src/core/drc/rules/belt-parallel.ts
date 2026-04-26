/** BELT_PARALLEL_001 / PIPE_PARALLEL_001 — two same-layer links share a cell
 *  and the local directions through that cell are parallel (both running
 *  horizontally, or both vertically). No bridge resolves this case — a
 *  cross-bridge only handles perpendicular crossings.
 *
 *  Per REQUIREMENT.md §5.5 (P3 update). Implemented as a single helper
 *  parameterized by Layer; both rules ship via this module.
 */
import type { Cell, Layer, Link } from '@core/domain/types.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext, RuleId } from '../types.ts';

const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;

type Orient = 'h' | 'v';

/** All orientations a link passes through at cell c (empty = c not on link).
 *  Straight cells return one element; corner cells return two ['h','v']. */
function orientationsAtCell(link: Link, cell: Cell): Orient[] {
  const path = link.path;
  const orients: Orient[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    if (p.x !== cell.x || p.y !== cell.y) continue;
    const prev = i > 0 ? path[i - 1] : null;
    const next = i < path.length - 1 ? path[i + 1] : null;
    if (prev) {
      orients.push(prev.x === p.x ? 'v' : 'h');
    }
    if (next) {
      orients.push(next.x === p.x ? 'v' : 'h');
    }
  }
  // De-dupe: a straight cell logged the same orientation twice (prev and next).
  return Array.from(new Set(orients));
}

function pickLinks(project: RuleContext['project'], layer: Layer): readonly Link[] {
  return layer === 'solid' ? project.solid_links : project.fluid_links;
}

function makeRule(args: {
  id: RuleId;
  layer: Layer;
  messageZh: (cell: Cell) => string;
  messageEn: (cell: Cell) => string;
}): Rule {
  return {
    id: args.id,
    severity: 'error',
    requires_data: (bundle: DataBundle): DataPrereq[] =>
      (args.layer === 'solid'
        ? bundle.transport_tiers.solid_belts.length
        : bundle.transport_tiers.fluid_pipes.length) > 0
        ? []
        : ['transport_tiers'],
    run({ project }: RuleContext): Issue[] {
      const links = pickLinks(project, args.layer);

      // Index cells → list of (link, its orientations at that cell).
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
      const reported = new Set<string>();
      for (const [k, occupants] of byCell) {
        if (occupants.length < 2) continue;
        if (reported.has(k)) continue;
        // Skip cells where any occupant has both orientations (corner) — that's
        // BELT_CORNER_001's job.
        const anyCorner = occupants.some((o) => o.orients.length >= 2);
        if (anyCorner) continue;
        // Parallel = at least two occupants share the same orientation.
        const counts = { h: 0, v: 0 };
        for (const o of occupants) {
          const dir = o.orients[0]!;
          counts[dir]++;
        }
        if (counts.h < 2 && counts.v < 2) continue;
        const [sx, sy] = k.split(',');
        const cell = { x: Number.parseInt(sx!, 10), y: Number.parseInt(sy!, 10) };
        issues.push({
          rule_id: args.id,
          severity: 'error',
          message_zh_hans: args.messageZh(cell),
          message_en: args.messageEn(cell),
          cells: [cell],
          link_id: occupants[0]!.link.id,
        });
        reported.add(k);
      }
      return issues;
    },
  };
}

export const beltParallel001: Rule = makeRule({
  id: 'BELT_PARALLEL_001',
  layer: 'solid',
  messageZh: (c) => `两条物流带在 (${c.x.toString()},${c.y.toString()}) 平行重叠`,
  messageEn: (c) =>
    `Two solid belts overlap with parallel direction at (${c.x.toString()},${c.y.toString()})`,
});
