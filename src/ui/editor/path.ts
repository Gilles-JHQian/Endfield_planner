/** Path planners for belt/pipe drafts.
 *
 *  - `manhattanPath`: walks horizontal then vertical, ignores everything.
 *    Used as a fallback when no detour exists, or when the caller doesn't
 *    care about device avoidance.
 *  - `routeAroundDevices`: 4-neighbour BFS that detours around a wall set
 *    (typically device cells + same-layer link cells + plot exterior). When
 *    no path exists, falls back to `manhattanPath` so the caller still has
 *    something to render — the EditorPage marks the ghost red in that case.
 *
 *  Status checks (path leaves the plot, hits a device) live in EditorPage
 *  so the ghost color reflects the same occupancy map placement uses.
 */
import type { Cell } from '@core/domain/types.ts';

export function manhattanPath(from: Cell, to: Cell): Cell[] {
  const cells: Cell[] = [{ x: from.x, y: from.y }];
  let x = from.x;
  let y = from.y;
  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    cells.push({ x, y });
  }
  while (y !== to.y) {
    y += y < to.y ? 1 : -1;
    cells.push({ x, y });
  }
  return cells;
}

const cellKey = (x: number, y: number): string => `${x.toString()},${y.toString()}`;

export interface RouteBounds {
  /** Inclusive plot bounds. Cells outside [0, width) × [0, height) are walls. */
  readonly width: number;
  readonly height: number;
}

export interface RouteOptions {
  /** Cells the path must avoid (devices + same-layer existing links). The
   *  endpoints `from` / `to` are exempted automatically — placing the link's
   *  end on a port cell or the start cell is legal. */
  readonly walls: ReadonlySet<string>;
  /** Plot bounds; cells outside the rectangle count as walls. */
  readonly bounds: RouteBounds;
}

/** 4-neighbour BFS from `from` to `to`. Returns the inclusive cell list of the
 *  shortest path that avoids `walls`. If unreachable, returns `manhattanPath`
 *  as a degenerate fallback so the caller still has cells to render — callers
 *  should check the result against `walls` themselves to decide red/green. */
export function routeAroundDevices(from: Cell, to: Cell, opts: RouteOptions): Cell[] {
  if (from.x === to.x && from.y === to.y) return [{ x: from.x, y: from.y }];

  const { walls, bounds } = opts;
  const inBounds = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < bounds.width && y < bounds.height;
  const startKey = cellKey(from.x, from.y);
  const goalKey = cellKey(to.x, to.y);

  // Allow stepping onto from/to even if they're in walls (port cells, etc.).
  const isWall = (x: number, y: number): boolean => {
    const k = cellKey(x, y);
    if (k === startKey || k === goalKey) return false;
    return walls.has(k);
  };

  if (!inBounds(from.x, from.y) || !inBounds(to.x, to.y)) {
    return manhattanPath(from, to);
  }

  const queue: { x: number; y: number }[] = [{ x: from.x, y: from.y }];
  const visited = new Set<string>([startKey]);
  // parent[childKey] = parentKey, used to reconstruct the path.
  const parent = new Map<string, string>();
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  let found = false;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.x === to.x && cur.y === to.y) {
      found = true;
      break;
    }
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const nk = cellKey(nx, ny);
      if (visited.has(nk)) continue;
      if (!inBounds(nx, ny)) continue;
      if (isWall(nx, ny)) continue;
      visited.add(nk);
      parent.set(nk, cellKey(cur.x, cur.y));
      queue.push({ x: nx, y: ny });
    }
  }

  if (!found) return manhattanPath(from, to);

  // Reconstruct path back-to-front then reverse.
  const reverse: Cell[] = [];
  let curKey = goalKey;
  while (curKey !== startKey) {
    const [sx, sy] = curKey.split(',');
    reverse.push({ x: Number.parseInt(sx!, 10), y: Number.parseInt(sy!, 10) });
    const p = parent.get(curKey);
    if (!p) break;
    curKey = p;
  }
  reverse.push({ x: from.x, y: from.y });
  return reverse.reverse();
}
