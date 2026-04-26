import { describe, expect, it } from 'vitest';
import { manhattanPath, routeAroundDevices } from './path.ts';

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
