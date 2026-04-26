/** Konva canvas — the pannable / zoomable workspace.
 *
 *  Three Konva layers, listening flags tuned for performance:
 *  1. grid layer (listening=false): grid lines, plot rect, never receives events
 *  2. content layer (listening=true): devices + links (later commits)
 *  3. overlay layer (listening=false): selection + ghost preview (later commits)
 */
import { useEffect, useRef, useState } from 'react';
import { Layer, Stage } from 'react-konva';
import type Konva from 'konva';
import { CELL_PX, useCamera } from './use-camera.ts';
import { Grid } from './Grid.tsx';
import { PlotRect } from './PlotRect.tsx';

interface Props {
  plot: { width: number; height: number };
  /** Optional: report cursor position to parent (for status bar). */
  onCursorChange?: (cell: { x: number; y: number } | null) => void;
  /** Optional: report camera state. */
  onCameraChange?: (state: { zoom: number }) => void;
}

export function Canvas({ plot, onCursorChange, onCameraChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const camera = useCamera();
  const isPanning = useRef(false);
  const lastPan = useRef<{ x: number; y: number } | null>(null);

  // Track container size via ResizeObserver.
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

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>): void {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    camera.zoomAt(pointer.x, pointer.y, e.evt.deltaY < 0 ? 1 : -1);
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    // Middle-mouse pan, or left-button on empty area (later: tool-aware).
    if (e.evt.button === 1) {
      isPanning.current = true;
      lastPan.current = { x: e.evt.clientX, y: e.evt.clientY };
      e.evt.preventDefault();
    }
  }

  function handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (isPanning.current && lastPan.current) {
      const dx = e.evt.clientX - lastPan.current.x;
      const dy = e.evt.clientY - lastPan.current.y;
      camera.pan(dx, dy);
      lastPan.current = { x: e.evt.clientX, y: e.evt.clientY };
    }
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (pointer && onCursorChange) {
      const w = camera.toWorld(pointer.x, pointer.y);
      onCursorChange({ x: Math.floor(w.x), y: Math.floor(w.y) });
    }
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
          <Layer listening>{/* devices + links land in B7 */}</Layer>
          <Layer listening={false}>{/* selection + ghost preview land in B7 */}</Layer>
        </Stage>
      )}
    </div>
  );
}
