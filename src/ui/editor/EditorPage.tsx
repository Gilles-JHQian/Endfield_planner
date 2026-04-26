/** Phase 2 editor page — 4-column shell per design/handoff/reference.html.
 *  Rail (56px) / Library (280px) / Workspace (flex) / Inspector (320px).
 *  Workspace mounts the Konva canvas + layer toggle + status bar; rail /
 *  library / inspector are placeholders this commit (filled in B7).
 */
import { useState } from 'react';
import { Canvas } from './Canvas.tsx';
import { LayerToggle } from './LayerToggle.tsx';
import { StatusBar } from './StatusBar.tsx';
import { useViewMode } from './use-view-mode.ts';

const DEFAULT_PLOT = { width: 50, height: 50 };

export function EditorPage() {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useViewMode();

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
        <LayerToggle active={viewMode} onChange={setViewMode} />
        <StatusBar
          cursor={cursor}
          zoom={zoom}
          plot={DEFAULT_PLOT}
          deviceCount={0}
          viewMode={viewMode}
        />
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
