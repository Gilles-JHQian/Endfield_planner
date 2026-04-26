/** Phase 2 editor page — 4-column shell per design/handoff/reference.html.
 *  Rail (56px) / Library (280px) / Workspace (flex) / Inspector (320px).
 *
 *  This commit wires the data-bundle + project state. Subsequent B7 commits
 *  fill the rail / library / inspector with real content and connect them
 *  to the project store via apply().
 */
import { useEffect, useMemo, useState } from 'react';
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
import { DraftPath } from './DraftPath.tsx';
import { DrcPanel } from './DrcPanel.tsx';
import { GhostPreview } from './GhostPreview.tsx';
import { HistoryControls } from './HistoryControls.tsx';
import { Inspector } from './Inspector.tsx';
import { IssueHighlight } from './IssueHighlight.tsx';
import { LinkLayer } from './LinkLayer.tsx';
import { ProjectMenu } from './ProjectMenu.tsx';
import { routeAroundDevices } from './path.ts';
import { portsInWorldFrame } from '@core/domain/geometry.ts';
import { computePowerCoverage } from '@core/domain/power-coverage.ts';
import type { Layer } from '@core/domain/types.ts';
import type { Issue } from '@core/drc/index.ts';
import {
  clearCurrent,
  exportProject,
  flushSave,
  importProject,
  loadCurrent,
  scheduleSave,
} from '@core/persistence/index.ts';
import { useDrc } from './use-drc.ts';
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
    // Restore from localStorage if compatible with the current bundle version;
    // otherwise drop the saved project (mismatched data_version risks dangling
    // device_id / recipe_id refs).
    const restored = loadCurrent();
    if (restored?.data_version === bundle.version) return restored;
    return createProject({ region, data_version: bundle.version });
  }, [bundle]);

  const store = useProject(initialProject, lookup);

  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useViewMode();
  const [category, setCategory] = useState<DeviceCategory>('basic_production');
  const [pickedDevice, setPickedDevice] = useState<Device | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  // Multi-segment belt/pipe draft. Each click adds a waypoint; the segment
  // between consecutive waypoints is BFS-routed around devices. Drafting
  // commits when the user clicks an input port of the matching layer or
  // closes back on the start cell. Esc cancels; Backspace pops the last
  // waypoint.
  const [linkDraft, setLinkDraft] = useState<{
    waypoints: Cell[];
    layer: Layer;
  } | null>(null);
  const [highlight, setHighlight] = useState<{
    cells: readonly Cell[];
    severity: 'error' | 'warning' | 'info';
  } | null>(null);
  const [panTarget, setPanTarget] = useState<{ cell: Cell; nonce: number } | null>(null);
  const toolApi = useTool();
  const drcReport = useDrc(store.project, bundle, lookup);
  const powerCoverage = useMemo(
    () => computePowerCoverage(store.project, lookup),
    [store.project, lookup],
  );

  // Auto-save: throttle 1s on every project change. flushSave on unmount /
  // beforeunload so an abrupt navigation doesn't lose the latest edit.
  // ProjectMenu polls getLastSavedAt() on its own ticker for the indicator.
  useEffect(() => {
    scheduleSave(store.project);
  }, [store.project]);
  useEffect(() => {
    const onBeforeUnload = (): void => flushSave();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      flushSave();
    };
  }, []);

  function handleNew(): void {
    clearCurrent();
    const region = bundle.regions[0];
    if (!region) return;
    store.reset(createProject({ region, data_version: bundle.version }));
    setSelectedInstanceId(null);
  }
  function handleImport(json: string): void {
    const result = importProject(json);
    if (!result.ok) {
      window.alert(`Import failed: ${result.error.message}`);
      return;
    }
    if (result.value.data_version !== bundle.version) {
      const proceed = window.confirm(
        `Project was saved against data v${result.value.data_version}; current bundle is v${bundle.version}. Some device/recipe ids may not match. Continue?`,
      );
      if (!proceed) return;
    }
    store.reset(result.value);
    setSelectedInstanceId(null);
  }
  function handleExport(): void {
    const blob = new Blob([exportProject(store.project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${store.project.name || 'project'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Cancel an in-progress belt/pipe draft when the tool changes away from
  // belt/pipe (e.g. user pressed Esc/V). React 19 "adjusting state during
  // render" pattern — prevTool is mirror-state used only for change detection.
  const [prevTool, setPrevTool] = useState(toolApi.tool.kind);
  if (prevTool !== toolApi.tool.kind) {
    setPrevTool(toolApi.tool.kind);
    if (toolApi.tool.kind !== 'belt' && toolApi.tool.kind !== 'pipe') {
      setLinkDraft(null);
    }
  }

  // Global undo/redo shortcuts. Ctrl+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo.
  // Ignored when typing in inputs so the inspector's recipe selector etc.
  // can use the OS-native undo for text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        store.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  // Selection-aware keyboard shortcuts (R rotates selected device, Delete
  // deletes it). useTool's R already handles ghost rotation; this only fires
  // when a placed device is selected and we're in the select tool.
  useEffect(() => {
    if (!selectedInstanceId) return;
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (toolApi.tool.kind !== 'select') return;
      if (e.key === 'r' || e.key === 'R') {
        store.apply({ type: 'rotate_device', instance_id: selectedInstanceId });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        store.apply({ type: 'delete_device', instance_id: selectedInstanceId });
        setSelectedInstanceId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedInstanceId, store, toolApi.tool]);

  // Belt/pipe draft keybindings. Esc cancels the whole draft; Backspace pops
  // the last waypoint (so owners can correct a mis-click without restarting).
  useEffect(() => {
    if (!linkDraft) return;
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        setLinkDraft(null);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setLinkDraft((d) => {
          if (!d) return d;
          if (d.waypoints.length <= 1) return null;
          return { ...d, waypoints: d.waypoints.slice(0, -1) };
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linkDraft]);

  // Clear the issue highlight a couple seconds after it's set so it doesn't
  // stick around forever after a click-to-pan.
  useEffect(() => {
    if (!highlight) return;
    const id = window.setTimeout(() => setHighlight(null), 2500);
    return () => window.clearTimeout(id);
  }, [highlight]);

  function handleIssueClick(issue: Issue): void {
    if (issue.cells.length === 0) return;
    const target = issue.cells[0]!;
    setPanTarget({ cell: target, nonce: Date.now() });
    setHighlight({ cells: issue.cells, severity: issue.severity });
    if (issue.device_instance_id) setSelectedInstanceId(issue.device_instance_id);
  }

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
  const draftPath = computeDraftPath(linkDraft, cursor, store.project, lookup);

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
      if (hit) {
        store.apply({ type: 'delete_device', instance_id: hit.instance_id });
        if (selectedInstanceId === hit.instance_id) setSelectedInstanceId(null);
      }
    } else if (toolApi.tool.kind === 'select') {
      const hit = findDeviceAtCell(store.project.devices, lookup, cell);
      setSelectedInstanceId(hit?.instance_id ?? null);
    } else if (toolApi.tool.kind === 'belt' || toolApi.tool.kind === 'pipe') {
      handleLinkClick(cell, toolApi.tool.kind === 'belt' ? 'solid' : 'fluid');
    }
  }

  function handleLinkClick(cell: Cell, layer: Layer): void {
    // No draft yet (or layer changed mid-flight) → first click sets the start cell.
    if (linkDraft?.layer !== layer) {
      setLinkDraft({ waypoints: [cell], layer });
      return;
    }
    const start = linkDraft.waypoints[0]!;
    const last = linkDraft.waypoints[linkDraft.waypoints.length - 1]!;

    // Same cell as last waypoint → no-op (avoid degenerate zero-length segment).
    if (last.x === cell.x && last.y === cell.y) return;

    // Detect commit conditions.
    const closesLoop = cell.x === start.x && cell.y === start.y && linkDraft.waypoints.length >= 2;
    const portHit = findInputPortAtCell(cell, layer, store.project, lookup);

    if (closesLoop || portHit) {
      const finalWaypoints = closesLoop ? linkDraft.waypoints : [...linkDraft.waypoints, cell];
      commitLink(finalWaypoints, layer, portHit);
      setLinkDraft(null);
      return;
    }

    // Otherwise extend the draft with this cell as a new waypoint.
    setLinkDraft({ ...linkDraft, waypoints: [...linkDraft.waypoints, cell] });
  }

  function commitLink(
    waypoints: readonly Cell[],
    layer: Layer,
    portHit: { device_instance_id: string; port_index: number } | null,
  ): void {
    const occ = buildOccupancy(store.project, lookup);
    const walls = wallSetFor(layer, occ);
    const path: Cell[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const seg = routeAroundDevices(waypoints[i]!, waypoints[i + 1]!, {
        walls,
        bounds: store.project.plot,
      });
      // Drop the leading cell on every segment after the first to avoid duplicating the joint.
      path.push(...(i === 0 ? seg : seg.slice(1)));
    }
    const tier_id =
      layer === 'solid'
        ? (bundle.transport_tiers.solid_belts[0]?.id ?? 'belt-1')
        : (bundle.transport_tiers.fluid_pipes[0]?.id ?? 'pipe-wuling');
    store.apply({
      type: 'add_link',
      layer,
      tier_id,
      path,
      ...(portHit ? { dst: portHit } : {}),
    });
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
          content={
            <>
              <LinkLayer project={store.project} viewMode={viewMode} />
              <DeviceLayer
                devices={store.project.devices}
                lookup={lookup}
                selectedInstanceId={selectedInstanceId}
                coveredInstanceIds={powerCoverage.coveredInstanceIds}
              />
            </>
          }
          overlay={
            <>
              {ghost && <GhostPreview {...ghost} />}
              {draftPath && (
                <DraftPath
                  path={draftPath.path}
                  status={draftPath.status}
                  {...(linkDraft ? { waypoints: linkDraft.waypoints } : {})}
                />
              )}
              {highlight && (
                <IssueHighlight cells={highlight.cells} severity={highlight.severity} />
              )}
            </>
          }
          onCellClick={handleCellClick}
          onCursorChange={setCursor}
          onCameraChange={(s) => setZoom(s.zoom)}
          panTarget={panTarget}
        />
        <Toolbar api={toolApi} />
        <LayerToggle active={viewMode} onChange={setViewMode} />
        <HistoryControls
          canUndo={store.canUndo}
          canRedo={store.canRedo}
          onUndo={store.undo}
          onRedo={store.redo}
        />
        <ProjectMenu onNew={handleNew} onImport={handleImport} onExport={handleExport} />
        <DrcPanel report={drcReport} onIssueClick={handleIssueClick} />
        <StatusBar
          cursor={cursor}
          zoom={zoom}
          plot={store.project.plot}
          deviceCount={store.project.devices.length}
          viewMode={viewMode}
        />
      </main>
      <aside aria-label="inspector" className="flex flex-col border-l border-line bg-surface-1">
        <Inspector
          project={store.project}
          selectedInstanceId={selectedInstanceId}
          lookup={lookup}
          recipes={bundle.recipes}
          onRecipeChange={(instance_id, recipe_id) =>
            store.apply({ type: 'set_recipe', instance_id, recipe_id })
          }
        />
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

interface DraftPathState {
  path: Cell[];
  layer: Layer;
  status: 'valid' | 'collision' | 'warn';
}

function computeDraftPath(
  draft: { waypoints: Cell[]; layer: Layer } | null,
  cursor: Cell | null,
  project: ReturnType<typeof useProject>['project'],
  lookup: (id: string) => Device | undefined,
): DraftPathState | null {
  if (!draft || draft.waypoints.length === 0) return null;
  const occ = buildOccupancy(project, lookup);
  const walls = wallSetFor(draft.layer, occ);
  const route = (a: Cell, b: Cell): Cell[] =>
    routeAroundDevices(a, b, { walls, bounds: project.plot });

  // Build path by joining BFS segments between consecutive waypoints, then
  // tacking on the live cursor segment (if cursor differs from the last waypoint).
  const pts: Cell[] = [...draft.waypoints];
  if (cursor) {
    const last = pts[pts.length - 1]!;
    if (cursor.x !== last.x || cursor.y !== last.y) pts.push(cursor);
  }
  const path: Cell[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = route(pts[i]!, pts[i + 1]!);
    path.push(...(i === 0 ? seg : seg.slice(1)));
  }
  if (path.length === 0) path.push(pts[0]!);

  // Status: collision if any path interior cell crosses a device or the
  // path leaves the plot. Endpoints (start cell + cursor) are exempt because
  // the start may sit on a port and the cursor may hover anywhere.
  const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;
  const startKey = cellKey(draft.waypoints[0]!);
  for (const c of path) {
    if (c.x < 0 || c.y < 0 || c.x >= project.plot.width || c.y >= project.plot.height) {
      return { path, layer: draft.layer, status: 'collision' };
    }
    if (cellKey(c) === startKey) continue;
    if (cellBlockedFor(c, draft.layer, occ) === 'device') {
      return { path, layer: draft.layer, status: 'collision' };
    }
  }
  return { path, layer: draft.layer, status: 'valid' };
}

/** Walls for BFS routing on a given layer: device cells (block both layers) +
 *  same-layer existing link cells (can't share without a bridge). */
function wallSetFor(layer: Layer, occ: ReturnType<typeof buildOccupancy>): Set<string> {
  const walls = new Set<string>(occ.device);
  if (layer === 'solid') for (const k of occ.solid) walls.add(k);
  else for (const k of occ.fluid) walls.add(k);
  return walls;
}

/** Find an input port (matching layer) at world cell `cell`, if any. Returns
 *  the {device_instance_id, port_index} ref the link's `dst` should point to. */
function findInputPortAtCell(
  cell: Cell,
  layer: Layer,
  project: ReturnType<typeof useProject>['project'],
  lookup: (id: string) => Device | undefined,
): { device_instance_id: string; port_index: number } | null {
  for (const placed of project.devices) {
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    const ports = portsInWorldFrame(dev, placed);
    for (const p of ports) {
      if (p.cell.x !== cell.x || p.cell.y !== cell.y) continue;
      if (p.direction_constraint !== 'input') continue;
      const matches =
        (layer === 'solid' && p.kind === 'solid') || (layer === 'fluid' && p.kind === 'fluid');
      if (matches) return { device_instance_id: placed.instance_id, port_index: p.port_index };
    }
  }
  return null;
}
