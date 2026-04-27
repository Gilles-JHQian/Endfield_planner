/** Path planners for belt/pipe drafts.
 *
 *  Two planners coexist:
 *  - `manhattanPath`: walks horizontal then vertical, ignores everything.
 *    Used as a fallback when no detour exists and by tests.
 *  - `routeForBelt` (P4 v5): the production planner used by the editor.
 *    Plain Manhattan with an L-shape choice biased by the previous segment's
 *    heading + cursor angle. Does NOT detour around obstacles — instead it
 *    walks the candidate path straight and reports collisions / auto-bridge
 *    requirements per cell. The caller (EditorPage) reads these to color the
 *    ghost and to decide whether to allow the next click.
 *
 *  `routeAroundDevices` (the P3 BFS-detour planner) remains for callers and
 *  tests that don't need crossing detection — slated for removal once the
 *  editor fully migrates.
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

// ----------------------------------------------------------------------------
// routeForBelt — P4 v5 production planner
// ----------------------------------------------------------------------------

export type LinkOrient = 'h' | 'v' | 'corner';

export interface BeltRouteOpts {
  /** Cells occupied by placed devices that block belts. The endpoints `from`
   *  / `to` are exempted — they're typically port cells on devices. */
  readonly deviceWalls: ReadonlySet<string>;
  /** Cells covered by existing same-layer links + their orientation(s) at
   *  that cell ('h' = horizontal segment, 'v' = vertical, 'corner' = both). */
  readonly sameLayerLinks: ReadonlyMap<string, ReadonlySet<LinkOrient>>;
  /** Cells already occupied by an existing cross-bridge of the matching layer. */
  readonly existingBridges: ReadonlySet<string>;
  readonly bounds: RouteBounds;
  /** Direction of motion (unit cardinal vector) that arrived at `from`. null
   *  means this is the very first segment of the draft — no heading bias. */
  readonly prevHeading: { dx: number; dy: number } | null;
  /** When `from` sits on a placed device's port, the unit vector pointing
   *  OUT of the device through that port's face. The first step must match
   *  this direction or the planner reports a collision at `from`. */
  readonly firstStepDirection?: { dx: number; dy: number };
  /** When `to` sits on a placed device's INPUT port, the unit vector pointing
   *  IN to the device through that port's face (i.e. the direction the link
   *  must arrive in). The last step (path[N-1] - path[N-2]) must match this
   *  vector or the planner reports a collision at `to`. (P4 v6 §5.1 F3.) */
  readonly lastStepDirection?: { dx: number; dy: number };
  /** P4 v7.4 — true when the auto-placed cross-bridge for THIS layer would
   *  also block the OTHER layer (pipe-cross-bridge does; belt-cross-bridge
   *  does not — REQUIREMENT.md §4.5.2). When true and a candidate auto-
   *  bridge cell is in `otherLayerOccupants`, the planner reports a
   *  collision instead of allowing the bridge — owners shouldn't be able
   *  to ghost-place a fluid pipe through a solid belt. */
  readonly crossBridgeBlocksOtherLayer?: boolean;
  /** P4 v7.4 — cells occupied on the OTHER layer (devices that block the
   *  other layer + that layer's link path cells). Consulted only when
   *  `crossBridgeBlocksOtherLayer` is true. */
  readonly otherLayerOccupants?: ReadonlySet<string>;
}

export interface BeltRouteResult {
  /** Inclusive cell list of the candidate path. Always includes `from` and
   *  `to`; intermediate cells are filled by Manhattan walk in the chosen
   *  L-shape order. */
  readonly path: readonly Cell[];
  /** Cells where a fresh cross-bridge needs to be inserted on commit
   *  (perpendicular crossing of an existing link, no bridge yet). */
  readonly bridgesToAutoPlace: readonly Cell[];
  /** Cells where the candidate path is illegal (parallel overlap, corner
   *  overlap, device wall, port-direction mismatch, out of bounds).
   *  Non-empty → ghost should color red and reject the next click. */
  readonly collisions: readonly Cell[];
}

export function routeForBelt(from: Cell, to: Cell, opts: BeltRouteOpts): BeltRouteResult {
  // Single-cell case (from === to). Treated as "click was on the live cursor =
  // last waypoint" — caller handles this as a force-commit signal, not a
  // routing call. Defensive return.
  if (from.x === to.x && from.y === to.y) {
    return { path: [{ x: from.x, y: from.y }], bridgesToAutoPlace: [], collisions: [] };
  }

  // Reverse-direction check: cursor exactly behind us. The interior angle at
  // `from` between the previous segment and the new segment is 0° → U-turn
  // forbidden per REQUIREMENT.md §5.1 F3 (P4 v5).
  //
  // Math: vec D = to - from (direction to cursor). vec B = prevHeading
  // (direction OF motion arriving at `from`). The interior angle at `from`
  // between the two segments equals the angle between (-B) and D, so
  // cos(interior) = -B · D / |D|. interior == 0° ⟺ cos == 1 ⟺ -B·D / |D|
  // == 1 ⟺ D points opposite to B (cursor sits "behind" us along the
  // heading axis).
  if (opts.prevHeading) {
    const candidateDx = to.x - from.x;
    const candidateDy = to.y - from.y;
    const dot = opts.prevHeading.dx * candidateDx + opts.prevHeading.dy * candidateDy;
    const mag = Math.hypot(candidateDx, candidateDy);
    if (mag > 0 && -dot / mag >= 0.999) {
      return {
        path: [{ x: from.x, y: from.y }],
        bridgesToAutoPlace: [],
        collisions: [{ x: from.x, y: from.y }],
      };
    }
  }

  // Decide L-shape order: forward-first vs perpendicular-first.
  // - Forward-first: step in the heading axis until aligned, then perpendicular.
  // - Perpendicular-first: step in the perpendicular axis first, then forward.
  const headingAxis = opts.prevHeading ? (opts.prevHeading.dx !== 0 ? 'h' : 'v') : null;
  // Forward bucket = interior angle in [135°, 180°] = cos(angle between A,B)
  // ≤ -√2/2 ≈ -0.707, where A = from→cursor and B = prevHeading.
  let preferForward = false;
  if (opts.prevHeading) {
    const ax = to.x - from.x;
    const ay = to.y - from.y;
    const aMag = Math.hypot(ax, ay) || 1;
    // A ⋅ -B (interior angle): the interior angle's cosine equals A ⋅ -B / (|A||B|).
    // -B has magnitude 1, so cos = (ax * -B.dx + ay * -B.dy) / aMag.
    const cosInterior = (ax * -opts.prevHeading.dx + ay * -opts.prevHeading.dy) / aMag;
    preferForward = cosInterior <= -0.707; // angle ≥ 135° (closer to 180°)
  }

  const startWithH =
    headingAxis === null
      ? // No heading (very first segment, no port lock): pick L-bend order by
        // larger displacement axis. Larger axis goes first → matches the
        // owner's diagonal-quadrant mental model (REQUIREMENT.md §5.1 F3 v6).
        Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
      : headingAxis === 'h' && preferForward
        ? true
        : headingAxis === 'v' && preferForward
          ? false
          : headingAxis === 'h'
            ? false // perpendicular to horizontal heading = vertical-first
            : true; // perpendicular to vertical heading = horizontal-first

  // Walk the L-shape.
  const path = startWithH ? walkHV(from, to) : walkVH(from, to);

  // Port-direction enforcement: first step from `from` must match
  // firstStepDirection if provided.
  if (opts.firstStepDirection && path.length >= 2) {
    const stepDx = path[1]!.x - from.x;
    const stepDy = path[1]!.y - from.y;
    if (stepDx !== opts.firstStepDirection.dx || stepDy !== opts.firstStepDirection.dy) {
      return {
        path,
        bridgesToAutoPlace: [],
        collisions: [{ x: from.x, y: from.y }],
      };
    }
  }

  // Port-direction enforcement at destination (P4 v6): last step into `to`
  // must match `lastStepDirection` (the direction the input port faces from).
  if (opts.lastStepDirection && path.length >= 2) {
    const lastStepDx = path[path.length - 1]!.x - path[path.length - 2]!.x;
    const lastStepDy = path[path.length - 1]!.y - path[path.length - 2]!.y;
    if (lastStepDx !== opts.lastStepDirection.dx || lastStepDy !== opts.lastStepDirection.dy) {
      return {
        path,
        bridgesToAutoPlace: [],
        collisions: [{ x: to.x, y: to.y }],
      };
    }
  }

  // Classify each cell: collision / auto-bridge / clean.
  const collisions: Cell[] = [];
  const bridgesToAutoPlace: Cell[] = [];
  const fromKey = cellKey(from.x, from.y);
  const toKey = cellKey(to.x, to.y);
  for (let i = 0; i < path.length; i++) {
    const c = path[i]!;
    const k = cellKey(c.x, c.y);
    // Out of bounds → collision.
    if (c.x < 0 || c.y < 0 || c.x >= opts.bounds.width || c.y >= opts.bounds.height) {
      collisions.push(c);
      continue;
    }
    // Device wall (excluding endpoints, which may be port cells) → collision.
    if (k !== fromKey && k !== toKey && opts.deviceWalls.has(k)) {
      collisions.push(c);
      continue;
    }
    // P4 v7.1: device-interior grace area. At the FROM/TO cells (the new
    // belt's endpoints), if the cell sits inside a device footprint, skip
    // same-layer overlap checks entirely — the device's port system is
    // responsible for connectivity at this cell, and multiple belts may
    // legitimately converge there (e.g. 3 inputs on a merger).
    if ((k === fromKey || k === toKey) && opts.deviceWalls.has(k)) continue;
    // Same-layer link overlap analysis.
    const existingOrients = opts.sameLayerLinks.get(k);
    if (!existingOrients || existingOrients.size === 0) continue;
    // Compute candidate orientation at this cell.
    const candidateOrient = orientAt(path, i);
    // 'corner' candidate or any existing 'corner' → corner overlap, illegal.
    if (
      candidateOrient === 'corner' ||
      existingOrients.has('corner') ||
      // parallel overlap: existing has the same axis as candidate
      (candidateOrient !== null && existingOrients.has(candidateOrient))
    ) {
      collisions.push(c);
      continue;
    }
    // Otherwise it's a perpendicular crossing. Allowed iff there's already a
    // cross-bridge here, or we'll auto-place one.
    if (!opts.existingBridges.has(k)) {
      // P4 v7.4: if the auto-placed bridge would also block the OTHER layer
      // (pipe-cross-bridge does; belt-cross-bridge does not) and that other
      // layer is occupied at this cell, the bridge can't legally be placed
      // → collision instead of auto-bridge. Catches "pipe over solid belt"
      // at the ghost stage before commit.
      if (opts.crossBridgeBlocksOtherLayer && opts.otherLayerOccupants?.has(k)) {
        collisions.push(c);
      } else {
        bridgesToAutoPlace.push(c);
      }
    }
  }

  return { path, bridgesToAutoPlace, collisions };
}

function walkHV(from: Cell, to: Cell): Cell[] {
  const out: Cell[] = [{ x: from.x, y: from.y }];
  let x = from.x;
  let y = from.y;
  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    out.push({ x, y });
  }
  while (y !== to.y) {
    y += y < to.y ? 1 : -1;
    out.push({ x, y });
  }
  return out;
}

function walkVH(from: Cell, to: Cell): Cell[] {
  const out: Cell[] = [{ x: from.x, y: from.y }];
  let x = from.x;
  let y = from.y;
  while (y !== to.y) {
    y += y < to.y ? 1 : -1;
    out.push({ x, y });
  }
  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    out.push({ x, y });
  }
  return out;
}

/** The orientation a path occupies at cell index `i`: 'h' (horizontal),
 *  'v' (vertical), 'corner' (incoming + outgoing on different axes), or
 *  null for degenerate single-cell paths. */
function orientAt(path: readonly Cell[], i: number): LinkOrient | null {
  const cell = path[i]!;
  if (path.length < 2) return null;
  const prev = i > 0 ? path[i - 1]! : null;
  const next = i < path.length - 1 ? path[i + 1]! : null;
  const orients = new Set<'h' | 'v'>();
  if (prev) orients.add(prev.x === cell.x ? 'v' : 'h');
  if (next) orients.add(next.x === cell.x ? 'v' : 'h');
  if (orients.size === 2) return 'corner';
  return orients.values().next().value ?? null;
}

/** Build the sameLayerLinks map for routeForBelt from a project's existing
 *  links of one layer. Each cell maps to the set of orientations links pass
 *  through it with (multiple links overlapping a cell merge their orient sets).
 */
export function buildLinkOrientations(
  links: readonly { path: readonly Cell[] }[],
): Map<string, Set<LinkOrient>> {
  const out = new Map<string, Set<LinkOrient>>();
  for (const link of links) {
    for (let i = 0; i < link.path.length; i++) {
      const c = link.path[i]!;
      const k = cellKey(c.x, c.y);
      const orient = orientAt(link.path, i);
      if (!orient) continue;
      let set = out.get(k);
      if (!set) {
        set = new Set();
        out.set(k, set);
      }
      set.add(orient);
    }
  }
  return out;
}
