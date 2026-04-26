/** Grid renderer — minor lines every cell, major lines every 5 cells.
 *  Single Konva.Shape with a sceneFunc that batches all visible lines into
 *  one path per stroke style. Cheaper than thousands of <Line> nodes.
 *
 *  Always rendered in world coordinates (the parent Stage applies the
 *  pan/zoom transform). The component recomputes the visible cell range
 *  from the current camera and only emits lines inside that window.
 */
import { Shape } from 'react-konva';
import type Konva from 'konva';
import { CELL_PX } from './use-camera.ts';

const MAJOR_EVERY = 5;

interface Props {
  /** Visible window in world cells, inclusive. */
  minCellX: number;
  minCellY: number;
  maxCellX: number;
  maxCellY: number;
}

export function Grid({ minCellX, minCellY, maxCellX, maxCellY }: Props) {
  return (
    <Shape
      sceneFunc={(ctx, shape) => {
        const x0 = minCellX * CELL_PX;
        const y0 = minCellY * CELL_PX;
        const x1 = maxCellX * CELL_PX;
        const y1 = maxCellY * CELL_PX;

        // Minor lines (skipping multiples of MAJOR_EVERY which the major pass draws).
        drawAxisLines(ctx, x0, y0, x1, y1, minCellX, maxCellX, minCellY, maxCellY, false);
        // Stroke minor.
        ctx.setAttr('strokeStyle', resolveCss('--color-line-faint', '#1d242c'));
        ctx.setAttr('lineWidth', 1);
        ctx.stroke();

        // Major lines.
        ctx.beginPath();
        drawAxisLines(ctx, x0, y0, x1, y1, minCellX, maxCellX, minCellY, maxCellY, true);
        ctx.setAttr('strokeStyle', resolveCss('--color-line', '#2a323b'));
        ctx.setAttr('lineWidth', 1);
        ctx.stroke();

        // Konva expects fillStrokeShape to register the bounding rect for hit-testing,
        // but we listen=false the layer so this is a no-op.
        ctx.fillStrokeShape(shape);
      }}
      listening={false}
    />
  );
}

function drawAxisLines(
  ctx: Konva.Context,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  minCellX: number,
  maxCellX: number,
  minCellY: number,
  maxCellY: number,
  major: boolean,
): void {
  if (!major) ctx.beginPath();
  // Vertical lines: at every cell-x boundary in [minCellX, maxCellX].
  for (let cx = minCellX; cx <= maxCellX; cx++) {
    const isMajor = cx % MAJOR_EVERY === 0;
    if (isMajor !== major) continue;
    const px = cx * CELL_PX + 0.5; // half-pixel align for crisp 1px lines
    ctx.moveTo(px, y0);
    ctx.lineTo(px, y1);
  }
  // Horizontal lines.
  for (let cy = minCellY; cy <= maxCellY; cy++) {
    const isMajor = cy % MAJOR_EVERY === 0;
    if (isMajor !== major) continue;
    const py = cy * CELL_PX + 0.5;
    ctx.moveTo(x0, py);
    ctx.lineTo(x1, py);
  }
}

function resolveCss(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}
