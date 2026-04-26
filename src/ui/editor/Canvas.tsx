/** Konva canvas — the pannable / zoomable workspace.
 *
 *  Three Konva layers, listening flags tuned for performance:
 *  1. grid layer (listening=false): grid lines, plot rect
 *  2. content layer (listening=true): devices (+ links B7.5)
 *  3. overlay layer (listening=false): ghost preview, selection brackets
 *
 *  Click handler converts pointer pixels → world cell and forwards to
 *  EditorPage so the active tool can act on it (place / select / delete /
 *  belt-anchor).
 */
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Layer, Stage } from 'react-konva';
import type Konva from 'konva';
import type { Cell } from '@core/domain/types.ts';
import { CELL_PX, useCamera } from './use-camera.ts';
import { Grid } from './Grid.tsx';
import { PlotRect } from './PlotRect.tsx';

interface Props {
  plot: { width: number; height: number };
  /** Render-content for the device/links layer (devices, link paths). */
  content?: ReactNode;
  /** Render-content for the overlay layer (ghost preview, hover highlights). */
  overlay?: ReactNode;
  /** Click on a world cell — forwarded to active tool by parent. */
  onCellClick?: (cell: Cell, evt: MouseEvent) => void;
  onCursorChange?: (cell: Cell | null) => void;
  onCameraChange?: (state: { zoom: number }) => void;
  /** When this changes (and is non-null), pan camera so the cell lands at center.
   *  Use a fresh Date.now() bump in `nonce` to re-pan to the same cell. */
  panTarget?: { cell: Cell; nonce: number } | null;
}

export function Canvas({
  plot,
  content,
  overlay,
  onCellClick,
  onCursorChange,
  onCameraChange,
  panTarget,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const camera = useCamera();
  const isPanning = useRef(false);
  const lastPan = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const resize = (): void => {
      const r = el.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    onCameraChange?.({ zoom: camera.zoom });
  }, [camera.zoom, onCameraChange]);

  useEffect(() => {
    if (!panTarget || size.width === 0) return;
    camera.centerOn(panTarget.cell, size.width, size.height);
    // We intentionally don't list `camera` / `size` — re-pan only when target nonce changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panTarget?.cell.x, panTarget?.cell.y, panTarget?.nonce]);

  function pointerCell(e: Konva.KonvaEventObject<MouseEvent | WheelEvent>): Cell | null {
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return null;
    const w = camera.toWorld(pointer.x, pointer.y);
    return { x: Math.floor(w.x), y: Math.floor(w.y) };
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>): void {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    camera.zoomAt(pointer.x, pointer.y, e.evt.deltaY < 0 ? 1 : -1);
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (e.evt.button === 1) {
      isPanning.current = true;
      lastPan.current = { x: e.evt.clientX, y: e.evt.clientY };
      e.evt.preventDefault();
    }
  }

  function handleClick(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (e.evt.button !== 0) return; // primary button only
    const cell = pointerCell(e);
    if (cell) onCellClick?.(cell, e.evt);
  }

  function handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (isPanning.current && lastPan.current) {
      const dx = e.evt.clientX - lastPan.current.x;
      const dy = e.evt.clientY - lastPan.current.y;
      camera.pan(dx, dy);
      lastPan.current = { x: e.evt.clientX, y: e.evt.clientY };
    }
    onCursorChange?.(pointerCell(e));
  }

  function handleMouseUp(): void {
    isPanning.current = false;
    lastPan.current = null;
  }

  function handleMouseLeave(): void {
    isPanning.current = false;
    lastPan.current = null;
    onCursorChange?.(null);
  }

  const visible = camera.visibleBounds(size.width, size.height);

  return (
    <div ref={containerRef} className="absolute inset-0 cursor-default">
      {size.width > 0 && (
        <Stage
          width={size.width}
          height={size.height}
          x={camera.pos.x}
          y={camera.pos.y}
          scaleX={camera.zoom}
          scaleY={camera.zoom}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <Layer listening={false}>
            <Grid
              minCellX={visible.minCellX}
              minCellY={visible.minCellY}
              maxCellX={visible.maxCellX}
              maxCellY={visible.maxCellY}
            />
            <PlotRect plot={plot} cellPx={CELL_PX} />
          </Layer>
          <Layer listening>{content}</Layer>
          <Layer listening={false}>{overlay}</Layer>
        </Stage>
      )}
    </div>
  );
}
