/** Phase 2 editor page — 4-column shell per design/handoff/reference.html.
 *  Rail (56px) / Library (280px) / Workspace (flex) / Inspector (320px).
 *  Workspace mounts the Konva canvas; rail / library / inspector are
 *  placeholders this commit (filled in B7).
 */
import { useState } from 'react';
import { Canvas } from './Canvas.tsx';

const DEFAULT_PLOT = { width: 50, height: 50 };

export function EditorPage() {
  // B10 will load these from project state; for now they're scratch state in
  // this component so the canvas has something to render.
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  return (
    <div
      className="grid h-[calc(100vh-44px)] overflow-hidden"
      style={{
        gridTemplateColumns: 'var(--rail-w) var(--library-w) 1fr var(--inspector-w)',
      }}
    >
      <aside aria-label="category rail" className="border-r border-line bg-surface-1 py-2" />
      <aside
        aria-label="device library"
        className="flex flex-col border-r border-line bg-surface-1"
      >
        <PlaceholderPanel title="LIBRARY" cn="设备库" />
      </aside>
      <main aria-label="workspace" className="relative bg-canvas">
        <Canvas
          plot={DEFAULT_PLOT}
          onCursorChange={setCursor}
          onCameraChange={(s) => setZoom(s.zoom)}
        />
        {/* Bottom status bar overlay — moves to its own component in commit 4. */}
        <div className="absolute bottom-0 left-0 right-0 z-10 flex h-[24px] items-center gap-4 border-t border-line bg-surface-1 px-3 font-tech-mono text-[10px] text-fg-soft">
          <span>
            <span className="uppercase tracking-[1px] text-fg-faint">CURSOR</span>{' '}
            <span className="text-fg">
              {cursor ? `${cursor.x.toString()}, ${cursor.y.toString()}` : '—'}
            </span>
          </span>
          <span>
            <span className="uppercase tracking-[1px] text-fg-faint">ZOOM</span>{' '}
            <span className="text-fg">{Math.round(zoom * 100).toString()}%</span>
          </span>
          <span>
            <span className="uppercase tracking-[1px] text-fg-faint">PLOT</span>{' '}
            <span className="text-fg">
              {DEFAULT_PLOT.width.toString()}×{DEFAULT_PLOT.height.toString()}
            </span>
          </span>
        </div>
      </main>
      <aside aria-label="inspector" className="flex flex-col border-l border-line bg-surface-1">
        <PlaceholderPanel title="INSPECTOR" cn="检视器" />
      </aside>
    </div>
  );
}

function PlaceholderPanel({ title, cn }: { title: string; cn: string }) {
  return (
    <div className="flex flex-col p-4">
      <span className="font-display text-[11px] font-semibold uppercase tracking-[1.5px] text-fg-soft">
        {title}
      </span>
      <span className="font-cn text-[12px] text-fg-faint">{cn}</span>
    </div>
  );
}
