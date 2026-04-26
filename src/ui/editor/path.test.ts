import { describe, expect, it } from 'vitest';
import {
  buildLinkOrientations,
  manhattanPath,
  routeAroundDevices,
  routeForBelt,
  type LinkOrient,
} from './path.ts';

describe('manhattanPath', () => {
  it('emits a single cell when from === to', () => {
    expect(manhattanPath({ x: 4, y: 7 }, { x: 4, y: 7 })).toEqual([{ x: 4, y: 7 }]);
  });

  it('walks horizontal then vertical, inclusive of both endpoints', () => {
    expect(manhattanPath({ x: 0, y: 0 }, { x: 2, y: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ]);
  });

  it('handles negative-direction motion', () => {
    expect(manhattanPath({ x: 3, y: 3 }, { x: 1, y: 1 })).toEqual([
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 1, y: 3 },
      { x: 1, y: 2 },
      { x: 1, y: 1 },
    ]);
  });

  it('emits no diagonal jumps', () => {
    const path = manhattanPath({ x: 0, y: 0 }, { x: 5, y: 5 });
    for (let i = 1; i < path.length; i++) {
      const dx = Math.abs(path[i]!.x - path[i - 1]!.x);
      const dy = Math.abs(path[i]!.y - path[i - 1]!.y);
      expect(dx + dy).toBe(1);
    }
  });
});

const NO_WALLS = new Set<string>();
const BOUNDS = { width: 20, height: 20 };

describe('routeAroundDevices', () => {
  it('returns single cell when from equals to', () => {
    expect(
      routeAroundDevices({ x: 5, y: 5 }, { x: 5, y: 5 }, { walls: NO_WALLS, bounds: BOUNDS }),
    ).toEqual([{ x: 5, y: 5 }]);
  });

  it('walks straight when no walls in the way', () => {
    const path = routeAroundDevices(
      { x: 0, y: 0 },
      { x: 0, y: 3 },
      { walls: NO_WALLS, bounds: BOUNDS },
    );
    expect(path).toHaveLength(4);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[3]).toEqual({ x: 0, y: 3 });
  });

  it('detours around a single-cell wall', () => {
    // Direct path 0,0 → 2,0 would step on (1,0). Wall blocks; expect detour.
    const walls = new Set(['1,0']);
    const path = routeAroundDevices({ x: 0, y: 0 }, { x: 2, y: 0 }, { walls, bounds: BOUNDS });
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 2, y: 0 });
    expect(path).not.toContainEqual({ x: 1, y: 0 });
    // Valid 4-neighbour steps only.
    for (let i = 1; i < path.length; i++) {
      expect(Math.abs(path[i]!.x - path[i - 1]!.x) + Math.abs(path[i]!.y - path[i - 1]!.y)).toBe(1);
    }
  });

  it('exempts endpoints from the wall check (port cells are legal targets)', () => {
    // The destination cell is itself a wall (a device port cell). Should still route to it.
    const walls = new Set(['3,3']);
    const path = routeAroundDevices({ x: 0, y: 0 }, { x: 3, y: 3 }, { walls, bounds: BOUNDS });
    expect(path[path.length - 1]).toEqual({ x: 3, y: 3 });
  });

  it('falls back to manhattanPath when wall-bounded with no detour', () => {
    // Surround the target so it's unreachable.
    const walls = new Set(['4,5', '6,5', '5,4', '5,6']);
    const path = routeAroundDevices({ x: 0, y: 0 }, { x: 5, y: 5 }, { walls, bounds: BOUNDS });
    // Fallback gives a manhattan path that *does* pass through walls; the
    // EditorPage scores the result against walls and colors it red.
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 5, y: 5 });
  });

  it('treats out-of-bounds endpoints by falling back to manhattan', () => {
    const path = routeAroundDevices(
      { x: -1, y: 0 },
      { x: 2, y: 0 },
      { walls: NO_WALLS, bounds: BOUNDS },
    );
    expect(path[0]).toEqual({ x: -1, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 2, y: 0 });
  });
});

const NO_DEVICE_WALLS = new Set<string>();
const NO_LINKS = new Map<string, ReadonlySet<LinkOrient>>();
const NO_BRIDGES = new Set<string>();
const ROUTE_BOUNDS = { width: 50, height: 50 };

function emptyOpts() {
  return {
    deviceWalls: NO_DEVICE_WALLS,
    sameLayerLinks: NO_LINKS,
    existingBridges: NO_BRIDGES,
    bounds: ROUTE_BOUNDS,
    prevHeading: null,
  };
}

describe('routeForBelt', () => {
  it('walks straight when no obstacles', () => {
    const r = routeForBelt({ x: 0, y: 0 }, { x: 3, y: 0 }, emptyOpts());
    expect(r.collisions).toEqual([]);
    expect(r.bridgesToAutoPlace).toEqual([]);
    expect(r.path).toHaveLength(4);
    expect(r.path[3]).toEqual({ x: 3, y: 0 });
  });

  it('reports U-turn (interior angle 0°) as a collision at `from`', () => {
    // Heading east; cursor is west → U-turn forbidden.
    const r = routeForBelt(
      { x: 5, y: 5 },
      { x: 2, y: 5 },
      { ...emptyOpts(), prevHeading: { dx: 1, dy: 0 } },
    );
    expect(r.collisions).toEqual([{ x: 5, y: 5 }]);
  });

  it('forward-first L-shape when cursor is mostly forward of the heading', () => {
    // Heading east, cursor at (10, 2): mostly forward → step east first, then north.
    const r = routeForBelt(
      { x: 5, y: 5 },
      { x: 10, y: 2 },
      { ...emptyOpts(), prevHeading: { dx: 1, dy: 0 } },
    );
    expect(r.collisions).toEqual([]);
    // After (5,5), the next cell should be (6,5) — east first.
    expect(r.path[1]).toEqual({ x: 6, y: 5 });
  });

  it('perpendicular-first L-shape when cursor is to the side', () => {
    // Heading east, cursor at (5, 2): pure perpendicular → step north first.
    const r = routeForBelt(
      { x: 5, y: 5 },
      { x: 5, y: 2 },
      { ...emptyOpts(), prevHeading: { dx: 1, dy: 0 } },
    );
    expect(r.collisions).toEqual([]);
    // First step north because perpendicular preference flips the heading axis.
    expect(r.path[1]).toEqual({ x: 5, y: 4 });
  });

  it('flags device walls (excluding endpoints) as collisions', () => {
    const walls = new Set(['2,0']);
    const r = routeForBelt({ x: 0, y: 0 }, { x: 4, y: 0 }, { ...emptyOpts(), deviceWalls: walls });
    expect(r.collisions).toContainEqual({ x: 2, y: 0 });
  });

  it('exempts endpoints from device-wall checks (port cells are legal)', () => {
    const walls = new Set(['4,0']);
    const r = routeForBelt({ x: 0, y: 0 }, { x: 4, y: 0 }, { ...emptyOpts(), deviceWalls: walls });
    expect(r.collisions.find((c) => c.x === 4 && c.y === 0)).toBeUndefined();
  });

  it('detects perpendicular crossing of an existing belt → auto-bridge needed', () => {
    // Existing horizontal belt going through (3, 5) horizontally.
    const links = new Map<string, ReadonlySet<LinkOrient>>([['3,5', new Set(['h'])]]);
    // New segment crosses (3, 5) vertically (north→south through it).
    const r = routeForBelt(
      { x: 3, y: 0 },
      { x: 3, y: 10 },
      { ...emptyOpts(), sameLayerLinks: links },
    );
    expect(r.collisions).toEqual([]);
    expect(r.bridgesToAutoPlace).toContainEqual({ x: 3, y: 5 });
  });

  it('skips auto-bridge when one is already placed at the crossing', () => {
    const links = new Map<string, ReadonlySet<LinkOrient>>([['3,5', new Set(['h'])]]);
    const bridges = new Set(['3,5']);
    const r = routeForBelt(
      { x: 3, y: 0 },
      { x: 3, y: 10 },
      { ...emptyOpts(), sameLayerLinks: links, existingBridges: bridges },
    );
    expect(r.collisions).toEqual([]);
    expect(r.bridgesToAutoPlace).toEqual([]);
  });

  it('flags parallel overlap (same axis as existing) as collision', () => {
    // Existing horizontal belt at (3, 0). New segment also runs horizontally through it.
    const links = new Map<string, ReadonlySet<LinkOrient>>([['3,0', new Set(['h'])]]);
    const r = routeForBelt(
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { ...emptyOpts(), sameLayerLinks: links },
    );
    expect(r.collisions).toContainEqual({ x: 3, y: 0 });
    expect(r.bridgesToAutoPlace).toEqual([]);
  });

  it('rejects firstStepDirection mismatch with collision at `from`', () => {
    // Port faces east (firstStepDirection = (1, 0)); cursor is north → first
    // step is north, mismatch.
    const r = routeForBelt(
      { x: 0, y: 5 },
      { x: 0, y: 2 },
      { ...emptyOpts(), firstStepDirection: { dx: 1, dy: 0 } },
    );
    expect(r.collisions).toContainEqual({ x: 0, y: 5 });
  });

  it('accepts firstStepDirection match', () => {
    const r = routeForBelt(
      { x: 0, y: 5 },
      { x: 4, y: 2 },
      { ...emptyOpts(), firstStepDirection: { dx: 1, dy: 0 } },
    );
    // First step must be east; (1, 5) is correct.
    expect(r.path[1]).toEqual({ x: 1, y: 5 });
    expect(r.collisions).toEqual([]);
  });

  // P4 v6 — first-segment quadrant routing. With no prevHeading and no
  // firstStepDirection, the L-bend's leading axis follows the larger of
  // |dx| and |dy| (matches the diagonal-quadrant mental model).
  describe('first-segment quadrant routing (P4 v6)', () => {
    it('mostly-east cursor → step east first', () => {
      const r = routeForBelt({ x: 5, y: 5 }, { x: 10, y: 6 }, emptyOpts());
      expect(r.path[1]).toEqual({ x: 6, y: 5 }); // horizontal first
    });
    it('mostly-north cursor → step north first', () => {
      const r = routeForBelt({ x: 5, y: 5 }, { x: 6, y: 0 }, emptyOpts());
      expect(r.path[1]).toEqual({ x: 5, y: 4 }); // vertical first
    });
    it('mostly-south cursor → step south first', () => {
      const r = routeForBelt({ x: 5, y: 5 }, { x: 6, y: 10 }, emptyOpts());
      expect(r.path[1]).toEqual({ x: 5, y: 6 });
    });
    it('mostly-west cursor → step west first', () => {
      const r = routeForBelt({ x: 5, y: 5 }, { x: 0, y: 6 }, emptyOpts());
      expect(r.path[1]).toEqual({ x: 4, y: 5 });
    });
    it('equal |dx|=|dy| → horizontal first (>= tiebreak)', () => {
      const r = routeForBelt({ x: 5, y: 5 }, { x: 10, y: 10 }, emptyOpts());
      expect(r.path[1]).toEqual({ x: 6, y: 5 });
    });
  });

  // P4 v6 — input port arrival validation. The last step into `to` must
  // match `lastStepDirection` (the direction the input port faces from).
  describe('lastStepDirection arrival check (P4 v6)', () => {
    it('rejects when arrival axis differs', () => {
      // Belt going from (5,5) to (5,2): last step is (5,3)→(5,2), direction (0,-1).
      // Required arrival is east (1,0). Mismatch → collision at to.
      const r = routeForBelt(
        { x: 5, y: 5 },
        { x: 5, y: 2 },
        { ...emptyOpts(), lastStepDirection: { dx: 1, dy: 0 } },
      );
      expect(r.collisions).toContainEqual({ x: 5, y: 2 });
    });
    it('accepts when arrival axis matches', () => {
      // Belt going from (0,5) to (4,5): last step is (3,5)→(4,5), direction (1,0).
      const r = routeForBelt(
        { x: 0, y: 5 },
        { x: 4, y: 5 },
        { ...emptyOpts(), lastStepDirection: { dx: 1, dy: 0 } },
      );
      expect(r.collisions).toEqual([]);
    });
    it('port lock at start still wins over quadrant', () => {
      // firstStepDirection south + cursor mostly east → quadrant would pick
      // east first, but the lock forces south, which then mismatches → fail.
      const r = routeForBelt(
        { x: 5, y: 5 },
        { x: 10, y: 6 },
        { ...emptyOpts(), firstStepDirection: { dx: 0, dy: 1 } },
      );
      expect(r.collisions).toContainEqual({ x: 5, y: 5 });
    });
  });
});

describe('buildLinkOrientations', () => {
  it('classifies a straight horizontal link as h at all interior + endpoints', () => {
    const links = [
      {
        path: [
          { x: 0, y: 5 },
          { x: 1, y: 5 },
          { x: 2, y: 5 },
        ],
      },
    ];
    const map = buildLinkOrientations(links);
    expect(map.get('0,5')?.has('h')).toBe(true);
    expect(map.get('1,5')?.has('h')).toBe(true);
    expect(map.get('2,5')?.has('h')).toBe(true);
  });

  it('marks corner cells with both axes', () => {
    const links = [
      {
        path: [
          { x: 0, y: 5 },
          { x: 1, y: 5 },
          { x: 1, y: 4 },
        ],
      },
    ];
    const map = buildLinkOrientations(links);
    expect(map.get('1,5')?.has('corner')).toBe(true);
  });
});
