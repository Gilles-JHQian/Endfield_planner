/** Pan/zoom camera state for the Konva editor.
 *
 *  Internal model: `pos` is the pixel offset of world (0,0) from the Stage's
 *  visual origin; `zoom` is the linear scale factor. World→screen is
 *  `screen = world * CELL_PX * zoom + pos`. Konva consumes both directly via
 *  `<Stage scaleX={zoom} scaleY={zoom} x={pos.x} y={pos.y}>`.
 *
 *  Pan: middle-mouse-button drag, or hold Space + left-drag. The component
 *  wires its own mouse handlers and calls `pan(dx, dy)` here.
 *
 *  Zoom: wheel-to-cursor — keeps the world cell under the cursor pinned while
 *  scaling. `zoomAt(stageX, stageY, factor)`.
 */
import { useCallback, useState } from 'react';

export const CELL_PX = 20;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.1;

export interface CameraState {
  pos: { x: number; y: number };
  zoom: number;
}

export interface CameraApi extends CameraState {
  pan: (dx: number, dy: number) => void;
  zoomAt: (stageX: number, stageY: number, dir: 1 | -1) => void;
  reset: () => void;
  /** Convert a Stage-local pixel coord to world cell coords (fractional). */
  toWorld: (stageX: number, stageY: number) => { x: number; y: number };
  /** The visible world-cell bounds of the viewport given the container size. */
  visibleBounds: (
    containerWidth: number,
    containerHeight: number,
  ) => {
    minCellX: number;
    minCellY: number;
    maxCellX: number;
    maxCellY: number;
  };
}

const DEFAULT: CameraState = { pos: { x: 24, y: 24 }, zoom: 1 };

export function useCamera(initial: CameraState = DEFAULT): CameraApi {
  const [state, setState] = useState<CameraState>(initial);

  const pan = useCallback((dx: number, dy: number): void => {
    setState((s) => ({ ...s, pos: { x: s.pos.x + dx, y: s.pos.y + dy } }));
  }, []);

  const zoomAt = useCallback((stageX: number, stageY: number, dir: 1 | -1): void => {
    setState((s) => {
      const factor = dir === 1 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, s.zoom * factor));
      if (newZoom === s.zoom) return s;
      // Keep the world point under (stageX, stageY) fixed during the scale.
      // worldX = (stageX - pos.x) / (CELL_PX * zoom)
      // After zoom: stageX = worldX * CELL_PX * newZoom + newPos.x
      // → newPos.x = stageX - worldX * CELL_PX * newZoom
      const worldX = (stageX - s.pos.x) / (CELL_PX * s.zoom);
      const worldY = (stageY - s.pos.y) / (CELL_PX * s.zoom);
      return {
        pos: {
          x: stageX - worldX * CELL_PX * newZoom,
          y: stageY - worldY * CELL_PX * newZoom,
        },
        zoom: newZoom,
      };
    });
  }, []);

  const reset = useCallback((): void => setState(DEFAULT), []);

  const toWorld = useCallback(
    (stageX: number, stageY: number) => ({
      x: (stageX - state.pos.x) / (CELL_PX * state.zoom),
      y: (stageY - state.pos.y) / (CELL_PX * state.zoom),
    }),
    [state.pos.x, state.pos.y, state.zoom],
  );

  const visibleBounds = useCallback(
    (w: number, h: number) => {
      const minCellX = Math.floor(-state.pos.x / (CELL_PX * state.zoom));
      const minCellY = Math.floor(-state.pos.y / (CELL_PX * state.zoom));
      const maxCellX = Math.ceil((w - state.pos.x) / (CELL_PX * state.zoom));
      const maxCellY = Math.ceil((h - state.pos.y) / (CELL_PX * state.zoom));
      return { minCellX, minCellY, maxCellX, maxCellY };
    },
    [state.pos.x, state.pos.y, state.zoom],
  );

  return { ...state, pan, zoomAt, reset, toWorld, visibleBounds };
}
