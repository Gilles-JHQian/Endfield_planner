/** BELT_CORNER_001 — a cell where one solid link turns (the cell sits between
 *  two non-collinear segments) is also visited by a second solid link. Even
 *  with a cross-bridge present this is illegal: cross-bridges only support
 *  straight-through perpendicular crossings, not corner sharing.
 */
import type { Cell, Link } from '@core/domain/types.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;

/** Returns true if `link` has a corner at the given cell — i.e., it visits
 *  the cell as an interior point and the incoming + outgoing directions are
 *  not collinear. */
function isCornerAt(link: Link, cell: Cell): boolean {
  const path = link.path;
  for (let i = 1; i < path.length - 1; i++) {
    const p = path[i]!;
    if (p.x !== cell.x || p.y !== cell.y) continue;
    const prev = path[i - 1]!;
    const next = path[i + 1]!;
    // Collinear iff prev + next axis matches: prev.x === next.x (vertical) or
    // prev.y === next.y (horizontal). Otherwise it's a corner.
    return !(prev.x === next.x || prev.y === next.y);
  }
  return false;
}

export const beltCorner001: Rule = {
  id: 'BELT_CORNER_001',
  severity: 'error',
  requires_data: (bundle: DataBundle): DataPrereq[] =>
    bundle.transport_tiers.solid_belts.length > 0 ? [] : ['transport_tiers'],
  run({ project }: RuleContext): Issue[] {
    const links = project.solid_links;
    if (links.length < 2) return [];

    // For each link, collect its corner cells.
    const cornerCells = new Map<string, string>(); // cellKey → link.id of the corner owner
    for (const link of links) {
      const path = link.path;
      for (let i = 1; i < path.length - 1; i++) {
        const p = path[i]!;
        if (isCornerAt(link, p)) {
          cornerCells.set(cellKey(p), link.id);
        }
      }
    }

    const issues: Issue[] = [];
    const reported = new Set<string>();
    for (const link of links) {
      for (const c of link.path) {
        const k = cellKey(c);
        const ownerId = cornerCells.get(k);
        if (!ownerId) continue;
        if (ownerId === link.id) continue; // same link's own corner doesn't count
        if (reported.has(k)) continue;
        reported.add(k);
        issues.push({
          rule_id: 'BELT_CORNER_001',
          severity: 'error',
          message_zh_hans: `物流带在 (${c.x.toString()},${c.y.toString()}) 拐角处与另一条带重叠`,
          message_en: `Solid belt overlaps another belt at corner cell (${c.x.toString()},${c.y.toString()})`,
          cells: [c],
          link_id: link.id,
        });
      }
    }
    return issues;
  },
};
