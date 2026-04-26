import { describe, expect, it } from 'vitest';
import { manhattanPath } from './path.ts';

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
