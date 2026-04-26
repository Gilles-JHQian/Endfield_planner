/** Phase 2 editor page — 4-column shell per design/handoff/reference.html.
 *  Rail (56px) / Library (280px) / Workspace (flex) / Inspector (320px).
 *
 *  This commit wires the data-bundle + project state. Subsequent B7 commits
 *  fill the rail / library / inspector with real content and connect them
 *  to the project store via apply().
 */
import { useMemo, useState } from 'react';
import { useDataBundle } from '@ui/use-data-bundle.ts';
import { createProject } from '@core/domain/project.ts';
import type { Cell } from '@core/domain/types.ts';
import { buildOccupancy, cellBlockedFor, fitsInPlot, footprintCells } from '@core/domain/index.ts';
import type { DataBundle, Device, DeviceCategory } from '@core/data-loader/types.ts';
import { Canvas } from './Canvas.tsx';
import { LayerToggle } from './LayerToggle.tsx';
import { StatusBar } from './StatusBar.tsx';
import { Rail } from './Rail.tsx';
import { Library } from './Library.tsx';
import { Toolbar } from './Toolbar.tsx';
import { DeviceLayer, findDeviceAtCell } from './DeviceLayer.tsx';
import { GhostPreview } from './GhostPreview.tsx';
import { useViewMode } from './use-view-mode.ts';
import { useProject } from './use-project.ts';
import { useTool } from './use-tool.ts';

const DATA_VERSION = '1.2';

export function EditorPage() {
  const { bundle, error, loading } = useDataBundle(DATA_VERSION);

  if (loading) {
    return (
      <div className="grid h-[calc(100vh-44px)] place-items-center font-tech-mono text-fg-soft">
        loading v{DATA_VERSION} …
      </div>
    );
  }
  if (error || !bundle) {
    return (
      <div className="grid h-[calc(100vh-44px)] place-items-center font-tech-mono text-err">
        data load failed: {error?.message ?? 'unknown'}
      </div>
    );
  }
  return <EditorWithBundle bundle={bundle} />;
}

function EditorWithBundle({ bundle }: { bundle: DataBundle }) {
  const lookup = useMemo(() => {
    const byId = new Map(bundle.devices.map((d) => [d.id, d]));
    return (id: string) => byId.get(id);
  }, [bundle]);

  const initialProject = useMemo(() => {
    const region = bundle.regions[0];
    if (!region) {
      throw new Error(`Bundle v${bundle.version} has no regions.`);
    }
    return createProject({ region, data_version: bundle.version });
  }, [bundle]);

  const store = useProject(initialProject, lookup);

  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useViewMode();
  const [category, setCategory] = useState<DeviceCategory>('basic_production');
  const [pickedDevice, setPickedDevice] = useState<Device | null>(null);
  const toolApi = useTool();

  // Picking a library card auto-switches to place tool. Clearing the pick
  // (re-click on the same card) reverts to select.
  function handlePick(d: Device | null): void {
    setPickedDevice(d);
    if (d) toolApi.setPlace(d);
    else toolApi.setSelect();
  }

  // Ghost preview for the place tool — derived inline. Recomputes on every
  // render but each call is O(footprint cells), well under the 16ms budget.
  // The React 19 compiler memoizes Konva re-renders to the overlay layer.
  const ghost = computeGhost(toolApi.tool, cursor, store.project, lookup);

  function handleCellClick(cell: Cell): void {
    if (toolApi.tool.kind === 'place') {
      const result = store.apply({
        type: 'place_device',
        device: toolApi.tool.device,
        position: cell,
        rotation: toolApi.tool.rotation,
      });
      if (!result.ok) {
        // For now silent — visual ghost color already told the user it's invalid.
        // TODO B8: surface as DRC issue / toast.
        return;
      }
    } else if (toolApi.tool.kind === 'delete') {
      const hit = findDeviceAtCell(store.project.devices, lookup, cell);
      if (hit) store.apply({ type: 'delete_device', instance_id: hit.instance_id });
    }
    // belt / pipe / select land in B7 commit 5+.
  }

  return (
    <div
      className="grid h-[calc(100vh-44px)] overflow-hidden"
      style={{
        gridTemplateColumns: 'var(--rail-w) var(--library-w) 1fr var(--inspector-w)',
      }}
    >
      <aside aria-label="category rail" className="border-r border-line bg-surface-1">
        <Rail
          active={category}
          onChange={(c) => {
            setCategory(c);
            setPickedDevice(null);
          }}
        />
      </aside>
      <aside
        aria-label="device library"
        className="flex flex-col border-r border-line bg-surface-1"
      >
        <Library
          devices={bundle.devices}
          category={category}
          selectedDeviceId={pickedDevice?.id ?? null}
          onPick={handlePick}
        />
      </aside>
      <main aria-label="workspace" className="relative bg-canvas">
        <Canvas
          plot={store.project.plot}
          content={<DeviceLayer devices={store.project.devices} lookup={lookup} />}
          overlay={ghost ? <GhostPreview {...ghost} /> : null}
          onCellClick={handleCellClick}
          onCursorChange={setCursor}
          onCameraChange={(s) => setZoom(s.zoom)}
        />
        <Toolbar api={toolApi} />
        <LayerToggle active={viewMode} onChange={setViewMode} />
        <StatusBar
          cursor={cursor}
          zoom={zoom}
          plot={store.project.plot}
          deviceCount={store.project.devices.length}
          viewMode={viewMode}
        />
      </main>
      <aside aria-label="inspector" className="flex flex-col border-l border-line bg-surface-1">
        <div className="flex flex-col p-4">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[1.5px] text-fg-soft">
            INSPECTOR
          </span>
          <span className="font-cn text-[12px] text-fg-faint">检视器 — B7 后续</span>
          {pickedDevice && (
            <span className="mt-3 font-tech-mono text-[11px] text-amber">
              picked: {pickedDevice.id}
            </span>
          )}
        </div>
      </aside>
    </div>
  );
}

interface GhostState {
  device: Device;
  cell: Cell;
  rotation: 0 | 90 | 180 | 270;
  status: 'valid' | 'collision' | 'warn';
}

function computeGhost(
  tool: ReturnType<typeof useTool>['tool'],
  cursor: Cell | null,
  project: ReturnType<typeof useProject>['project'],
  lookup: (id: string) => Device | undefined,
): GhostState | null {
  if (tool.kind !== 'place' || !cursor) return null;
  const { device, rotation } = tool;
  const placed = { position: cursor, rotation };

  if (!fitsInPlot(device, placed, project.plot)) {
    return { device, cell: cursor, rotation, status: 'collision' };
  }
  const occ = buildOccupancy(project, lookup);
  for (const c of footprintCells(device, placed)) {
    if (cellBlockedFor(c, 'solid', occ) || cellBlockedFor(c, 'fluid', occ)) {
      return { device, cell: cursor, rotation, status: 'collision' };
    }
  }
  return { device, cell: cursor, rotation, status: 'valid' };
}
