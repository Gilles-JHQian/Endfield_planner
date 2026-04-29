import { describe, expect, it } from 'vitest';
import {
  bfsRouteWithBend,
  buildLinkOrientations,
  manhattanPath,
  routeAroundDevices,
  routeForBelt,
  routeForBeltWithDetour,
  type LinkOrient,
} from './path.ts';

function countBends(path: readonly { x: number; y: number }[]): number {
  let bends = 0;
  for (let i = 2; i < path.length; i++) {
    const dxA = path[i - 1]!.x - path[i - 2]!.x;
    const dyA = path[i - 1]!.y - path[i - 2]!.y;
    const dxB = path[i]!.x - path[i - 1]!.x;
    const dyB = path[i]!.y - path[i - 1]!.y;
    if (dxA !== dxB || dyA !== dyB) bends += 1;
  }
  return bends;
}

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

  // P4 v7.4 — pipe (fluid) auto-bridge over a solid belt cell should be a
  // collision instead of an auto-bridge, because the pipe-cross-bridge
  // blocks both layers and would conflict with the existing solid belt.
  it('rejects fluid auto-bridge when other layer is occupied (P4 v7.4)', () => {
    // Existing same-layer (fluid) link going horizontally at (3, 5).
    const links = new Map<string, ReadonlySet<LinkOrient>>([['3,5', new Set(['h'])]]);
    // Solid layer is occupied at (3, 5) — there's a solid belt there.
    const otherLayer = new Set(['3,5']);
    const r = routeForBelt(
      { x: 3, y: 0 },
      { x: 3, y: 10 },
      {
        ...emptyOpts(),
        sameLayerLinks: links,
        crossBridgeBlocksOtherLayer: true,
        otherLayerOccupants: otherLayer,
      },
    );
    expect(r.collisions).toContainEqual({ x: 3, y: 5 });
    expect(r.bridgesToAutoPlace).toEqual([]);
  });

  // The reverse — solid auto-bridge over a fluid pipe — should still pass
  // (belt-cross-bridge has layerOccupancy='solid' only, REQUIREMENT.md §4.5.2).
  it('allows solid auto-bridge over a fluid pipe (asymmetric)', () => {
    const links = new Map<string, ReadonlySet<LinkOrient>>([['3,5', new Set(['h'])]]);
    const otherLayer = new Set(['3,5']); // fluid pipe at (3,5)
    const r = routeForBelt(
      { x: 3, y: 0 },
      { x: 3, y: 10 },
      {
        ...emptyOpts(),
        sameLayerLinks: links,
        crossBridgeBlocksOtherLayer: false, // belt-cross-bridge doesn't block other layer
        otherLayerOccupants: otherLayer,
      },
    );
    expect(r.collisions).toEqual([]);
    expect(r.bridgesToAutoPlace).toContainEqual({ x: 3, y: 5 });
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

describe('bfsRouteWithBend', () => {
  it('walks straight when there are no walls', () => {
    const r = bfsRouteWithBend(
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { walls: NO_WALLS, bounds: BOUNDS, maxBends: 3 },
    );
    expect(r).not.toBeNull();
    expect(r!.bends).toBe(0);
    expect(r!.path).toHaveLength(6);
    expect(r!.path[0]).toEqual({ x: 0, y: 0 });
    expect(r!.path[r!.path.length - 1]).toEqual({ x: 5, y: 0 });
  });

  it('takes a single L when the destination is off-axis', () => {
    const r = bfsRouteWithBend(
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { walls: NO_WALLS, bounds: BOUNDS, maxBends: 3 },
    );
    expect(r).not.toBeNull();
    expect(r!.bends).toBe(1);
  });

  it('detours around a single-cell wall within bend budget', () => {
    // Wall on (1,0) blocks the straight horizontal path. Detour requires 2 bends.
    const walls = new Set(['1,0']);
    const r = bfsRouteWithBend(
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { walls, bounds: BOUNDS, maxBends: 3 },
    );
    expect(r).not.toBeNull();
    expect(r!.bends).toBe(2);
    expect(r!.path.find((c) => c.x === 1 && c.y === 0)).toBeUndefined();
    expect(countBends(r!.path)).toBe(r!.bends);
  });

  it('returns null when the only detour exceeds the bend cap', () => {
    // Build a winding wall that forces the detour past 3 bends.
    // Plot 6×6. Walls force a path that needs 4 bends.
    //  (0,0) start      (5,0) goal
    //   . W . . . .
    //   . . . . W .
    //   . . W . . .
    //   . . . . . .
    //   . . . . . .
    const walls = new Set(['1,0', '4,1', '2,2']);
    const bounds = { width: 6, height: 6 };
    // With maxBends=3 a path exists; with maxBends=1 it should not
    // (any detour is at least 2 bends).
    const r3 = bfsRouteWithBend({ x: 0, y: 0 }, { x: 5, y: 0 }, { walls, bounds, maxBends: 3 });
    expect(r3).not.toBeNull();
    const r1 = bfsRouteWithBend({ x: 0, y: 0 }, { x: 5, y: 0 }, { walls, bounds, maxBends: 1 });
    expect(r1).toBeNull();
  });

  it('respects firstStepDirection at the source', () => {
    // Want the path to leave (0,0) going SOUTH even though EAST is more direct.
    const r = bfsRouteWithBend(
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      {
        walls: NO_WALLS,
        bounds: BOUNDS,
        maxBends: 3,
        firstStepDirection: { dx: 0, dy: 1 },
      },
    );
    expect(r).not.toBeNull();
    expect(r!.path[1]).toEqual({ x: 0, y: 1 });
  });

  it('respects lastStepDirection at the destination', () => {
    // Want the path to arrive at (3,0) heading EAST. Cursor sits at (3,0).
    // From (0,0) → (3,0) without constraint is straight east (last step east).
    // Force last step NORTH instead — path must approach from south.
    const r = bfsRouteWithBend(
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      {
        walls: NO_WALLS,
        bounds: BOUNDS,
        maxBends: 3,
        lastStepDirection: { dx: 0, dy: -1 },
      },
    );
    expect(r).not.toBeNull();
    const last = r!.path[r!.path.length - 1]!;
    const prev = r!.path[r!.path.length - 2]!;
    expect(last.x - prev.x).toBe(0);
    expect(last.y - prev.y).toBe(-1);
  });

  it('returns null when the destination port direction is unreachable in the bend budget', () => {
    // A 1×1 plot with the goal adjacent — cannot loop around to approach
    // from the wrong side.
    const r = bfsRouteWithBend(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      {
        walls: NO_WALLS,
        bounds: { width: 2, height: 2 },
        maxBends: 0,
        lastStepDirection: { dx: 0, dy: -1 },
      },
    );
    expect(r).toBeNull();
  });

  it('returns null when from === to', () => {
    expect(
      bfsRouteWithBend(
        { x: 5, y: 5 },
        { x: 5, y: 5 },
        { walls: NO_WALLS, bounds: BOUNDS, maxBends: 3 },
      ),
    ).toBeNull();
  });
});

describe('routeForBeltWithDetour', () => {
  const baseOpts = {
    deviceWalls: NO_WALLS,
    sameLayerLinks: new Map() as ReadonlyMap<string, ReadonlySet<LinkOrient>>,
    existingBridges: NO_WALLS,
    bounds: BOUNDS,
    prevHeading: null,
  };

  it('returns the L-shape unchanged when nothing is in the way', () => {
    const r = routeForBeltWithDetour({ x: 0, y: 0 }, { x: 4, y: 0 }, baseOpts);
    expect(r.collisions).toEqual([]);
    expect(r.path).toHaveLength(5);
  });

  it('falls back to BFS when a device sits on the L-shape', () => {
    // Wall on (2,0) blocks the straight path; BFS detours around it.
    const r = routeForBeltWithDetour(
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { ...baseOpts, deviceWalls: new Set(['2,0']) },
    );
    expect(r.collisions).toEqual([]);
    expect(r.path[0]).toEqual({ x: 0, y: 0 });
    expect(r.path[r.path.length - 1]).toEqual({ x: 4, y: 0 });
    expect(r.path.find((c) => c.x === 2 && c.y === 0)).toBeUndefined();
  });

  it('twists the final segment to match a destination port direction', () => {
    // Cursor at (3,3) is an input port whose face points NORTH — the belt
    // must arrive heading SOUTH (last step dy = +1). The L-shape from (0,0)
    // arrives heading EAST, which the planner would flag red. The detour
    // wrapper finds a path that approaches from above instead.
    const r = routeForBeltWithDetour(
      { x: 0, y: 0 },
      { x: 3, y: 3 },
      { ...baseOpts, lastStepDirection: { dx: 0, dy: 1 } },
    );
    expect(r.collisions).toEqual([]);
    const last = r.path[r.path.length - 1]!;
    const prev = r.path[r.path.length - 2]!;
    expect(last.x - prev.x).toBe(0);
    expect(last.y - prev.y).toBe(1);
  });

  it('keeps the red L-shape when the only detour exceeds the bend cap', () => {
    // Devices form a corridor that needs more than 3 bends. The wrapper
    // returns the original L-shape with collisions intact so the ghost still
    // surfaces the violation rather than silently producing a long detour.
    const walls = new Set(['1,0', '1,1', '1,2', '1,3', '1,4', '1,5', '1,6', '1,7']);
    const bounds = { width: 4, height: 4 };
    const r = routeForBeltWithDetour(
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { ...baseOpts, deviceWalls: walls, bounds },
    );
    expect(r.collisions.length).toBeGreaterThan(0);
  });
});
