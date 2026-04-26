import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { CELL_PX, useCamera } from './use-camera.ts';

describe('useCamera', () => {
  it('starts at the default pos + zoom=1', () => {
    const { result } = renderHook(() => useCamera());
    expect(result.current.zoom).toBe(1);
    expect(result.current.pos).toEqual({ x: 24, y: 24 });
  });

  it('pan adds to pos', () => {
    const { result } = renderHook(() => useCamera());
    act(() => result.current.pan(10, -5));
    expect(result.current.pos).toEqual({ x: 34, y: 19 });
  });

  it('zoomAt keeps the world point under the cursor pinned', () => {
    const { result } = renderHook(() => useCamera({ pos: { x: 0, y: 0 }, zoom: 1 }));
    // World (5, 5) → screen (5*20, 5*20) = (100, 100). Zoom in around (100, 100).
    act(() => result.current.zoomAt(100, 100, 1));
    // After zoom, the world point under (100, 100) should still be (5, 5).
    const w = result.current.toWorld(100, 100);
    expect(w.x).toBeCloseTo(5);
    expect(w.y).toBeCloseTo(5);
  });

  it('clamps zoom to [0.25, 4]', () => {
    const { result } = renderHook(() => useCamera({ pos: { x: 0, y: 0 }, zoom: 1 }));
    // Zoom in many times, then assert ceiling.
    act(() => {
      for (let i = 0; i < 50; i++) result.current.zoomAt(0, 0, 1);
    });
    expect(result.current.zoom).toBeLessThanOrEqual(4);
    expect(result.current.zoom).toBeCloseTo(4, 5);

    act(() => {
      for (let i = 0; i < 50; i++) result.current.zoomAt(0, 0, -1);
    });
    expect(result.current.zoom).toBeGreaterThanOrEqual(0.25);
    expect(result.current.zoom).toBeCloseTo(0.25, 5);
  });

  it('toWorld inverts the camera transform', () => {
    const { result } = renderHook(() => useCamera({ pos: { x: 100, y: 50 }, zoom: 2 }));
    // Screen pixel (100, 50) is exactly the camera origin → world (0, 0).
    expect(result.current.toWorld(100, 50)).toEqual({ x: 0, y: 0 });
    // 1 cell at zoom=2 = 40px right of origin.
    expect(result.current.toWorld(140, 50)).toEqual({ x: 1, y: 0 });
  });

  it('visibleBounds returns the cell range covering [0,0] → (w,h)', () => {
    const { result } = renderHook(() => useCamera({ pos: { x: 0, y: 0 }, zoom: 1 }));
    const b = result.current.visibleBounds(200, 100);
    // pos = 0, zoom = 1, CELL_PX = 20. Visible x ∈ [0, 200/20] = [0, 10].
    // toEqual treats -0 and 0 as equal; toBe (Object.is) does not. Math.floor(-0/20)
    // returns -0, so use toEqual on the floor side.
    expect(b.minCellX).toEqual(0);
    expect(b.minCellY).toEqual(0);
    expect(b.maxCellX).toBe(200 / CELL_PX);
    expect(b.maxCellY).toBe(100 / CELL_PX);
  });

  it('reset returns to defaults', () => {
    const { result } = renderHook(() => useCamera());
    act(() => {
      result.current.pan(100, 100);
      result.current.zoomAt(0, 0, 1);
    });
    act(() => result.current.reset());
    expect(result.current.zoom).toBe(1);
    expect(result.current.pos).toEqual({ x: 24, y: 24 });
  });
});
