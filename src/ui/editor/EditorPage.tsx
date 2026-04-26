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
import { PowerOverlay } from './PowerOverlay.tsx';
import { ProjectMenu } from './ProjectMenu.tsx';
import {
  buildRouteContext,
  crossBridgeId,
  defaultTierId,
  findOutputPortAtCell,
  planSegments,
  type ProjectRouteContext,
} from './belt-router.ts';
import { portsInWorldFrame } from '@core/domain/geometry.ts';
import { computePowerCoverage } from '@core/domain/power-coverage.ts';
import type { Layer } from '@core/domain/types.ts';
import type { Issue } from '@core/drc/index.ts';
import {
  buildPayload,
  clearCurrent,
  copyToClipboard,
  exportProject,
  flushSave,
  importProject,
  loadCurrent,
  readClipboard,
  scheduleSave,
} from '@core/persistence/index.ts';
import { useDrc } from './use-drc.ts';
import { useViewMode } from './use-view-mode.ts';
import { useProject, type ProjectAction } from './use-project.ts';
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
  // Box-select multi-selection. Distinct from selectedInstanceId (which the
  // Inspector single-select uses); both can be live at once. Box-select adds
  // and removes by click/Shift-click, and is cleared on tool change.
  const [boxSelected, setBoxSelected] = useState<ReadonlySet<string>>(new Set());
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
    if (toolApi.tool.kind !== 'box-select' && boxSelected.size > 0) {
      setBoxSelected(new Set());
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

  // Box-select group operations. F = batch-delete; Ctrl+C = copy current
  // selection to the clipboard; Ctrl+V = paste at cursor (offset preserved).
  useEffect(() => {
    if (toolApi.tool.kind !== 'box-select') return;
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && (e.key === 'c' || e.key === 'C')) {
        if (boxSelected.size === 0) return;
        e.preventDefault();
        const devices = store.project.devices.filter((d) => boxSelected.has(d.instance_id));
        const payload = buildPayload(devices);
        if (payload) copyToClipboard(payload);
        return;
      }
      if (meta && (e.key === 'v' || e.key === 'V')) {
        if (!cursor) return;
        const payload = readClipboard();
        if (!payload) return;
        e.preventDefault();
        const placeActions: ProjectAction[] = [];
        for (const item of payload.items) {
          const dev = lookup(item.device_id);
          if (!dev) continue;
          placeActions.push({
            type: 'place_device',
            device: dev,
            position: { x: cursor.x + item.rel_position.x, y: cursor.y + item.rel_position.y },
            rotation: item.rotation,
          });
        }
        if (placeActions.length === 0) return;
        const result = store.applyMany(placeActions);
        if (result.ok) {
          setBoxSelected(new Set(result.value.placed.map((p) => p.instance_id)));
        }
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        if (boxSelected.size === 0) return;
        e.preventDefault();
        const actions = Array.from(boxSelected).map((instance_id) => ({
          type: 'delete_device' as const,
          instance_id,
        }));
        store.applyMany(actions);
        setBoxSelected(new Set());
        if (selectedInstanceId && boxSelected.has(selectedInstanceId)) {
          setSelectedInstanceId(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boxSelected, store, toolApi.tool, selectedInstanceId, cursor, lookup]);

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

  function handleCellClick(cell: Cell, evt: MouseEvent): void {
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
    } else if (toolApi.tool.kind === 'select') {
      const hit = findDeviceAtCell(store.project.devices, lookup, cell);
      setSelectedInstanceId(hit?.instance_id ?? null);
    } else if (toolApi.tool.kind === 'box-select') {
      const hit = findDeviceAtCell(store.project.devices, lookup, cell);
      if (!hit) {
        // Click on empty cell clears the box selection.
        if (boxSelected.size > 0) setBoxSelected(new Set());
        return;
      }
      setBoxSelected((prev) => {
        const next = new Set(prev);
        if (evt.shiftKey) {
          // Shift-click: toggle membership.
          if (next.has(hit.instance_id)) next.delete(hit.instance_id);
          else next.add(hit.instance_id);
        } else if (next.has(hit.instance_id) && next.size === 1) {
          // Click on the lone selected device clears the selection.
          next.clear();
        } else {
          // Click on an unselected device: replace the selection (single click semantics).
          next.clear();
          next.add(hit.instance_id);
        }
        return next;
      });
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

    // P4 v5: clicking the same cell as the last waypoint FORCE-COMMITS the
    // path as drawn (lets the owner end a belt at an empty cell).
    if (last.x === cell.x && last.y === cell.y) {
      if (linkDraft.waypoints.length >= 2) {
        commitLink(linkDraft.waypoints, layer, null);
      }
      setLinkDraft(null);
      return;
    }

    // Validate the candidate next segment via the same planner the ghost uses.
    // If it has collisions, reject the click — the ghost's red color already
    // told the user it's illegal.
    const ctx = buildRouteContext(store.project, layer, lookup);
    const firstStep =
      linkDraft.waypoints.length === 1
        ? (findOutputPortAtCell(start, layer, store.project, lookup)?.face_direction ?? undefined)
        : undefined;
    const initialHeading = headingAtEnd(linkDraft.waypoints, ctx, firstStep);
    const candidate = planSegments(
      [last, cell],
      ctx,
      initialHeading,
      // First-step direction only applies if last is itself the first waypoint
      // (single-waypoint draft); otherwise the heading carries forward.
      linkDraft.waypoints.length === 1 ? firstStep : undefined,
    );
    if (candidate.collisions.length > 0) return;

    // Commit conditions.
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
    const ctx = buildRouteContext(store.project, layer, lookup);
    const firstStep =
      findOutputPortAtCell(waypoints[0]!, layer, store.project, lookup)?.face_direction ??
      undefined;
    const planned = planSegments(waypoints, ctx, null, firstStep);
    if (planned.collisions.length > 0) return; // shouldn't happen — ghost gates clicks

    const actions: ProjectAction[] = [];
    const seenBridge = new Set<string>();
    const bridgeDev = lookup(crossBridgeId(layer));
    if (bridgeDev) {
      for (const c of planned.bridgesToAutoPlace) {
        const k = `${c.x.toString()},${c.y.toString()}`;
        if (seenBridge.has(k)) continue;
        seenBridge.add(k);
        actions.push({
          type: 'place_device',
          device: bridgeDev,
          position: c,
          rotation: 0,
        });
      }
    }
    actions.push({
      type: 'add_link',
      layer,
      tier_id: defaultTierId(bundle, layer),
      path: planned.path,
      ...(portHit ? { dst: portHit } : {}),
    });
    store.applyMany(actions);
  }

  /** Compute the heading at the end of a partially-routed waypoint sequence
   *  by re-running the planner on the committed segments. */
  function headingAtEnd(
    waypoints: readonly Cell[],
    ctx: ProjectRouteContext,
    firstStep: { dx: number; dy: number } | undefined,
  ): { dx: number; dy: number } | null {
    if (waypoints.length < 2) return null;
    const prefix = planSegments(waypoints, ctx, null, firstStep);
    return prefix.endHeading;
  }

  return (
    <div
      className="grid h-[calc(100vh-44px)] overflow-hidden"
      style={{
        gridTemplateColumns: 'var(--rail-w) var(--library-w) 1fr var(--inspector-w)',
      }}
    >
      <aside
        aria-label="category rail"
        className="flex h-full min-h-0 flex-col overflow-hidden border-r border-line bg-surface-1"
      >
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
        className="flex h-full min-h-0 flex-col overflow-hidden border-r border-line bg-surface-1"
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
                boxSelectedIds={boxSelected}
                coveredInstanceIds={powerCoverage.coveredInstanceIds}
              />
              {viewMode === 'power' && (
                <PowerOverlay devices={store.project.devices} lookup={lookup} />
              )}
            </>
          }
          overlay={
            <>
              {ghost && (
                <GhostPreview {...ghost} existingDevices={store.project.devices} lookup={lookup} />
              )}
              {draftPath && (
                <DraftPath
                  path={draftPath.path}
                  status={draftPath.status}
                  autoBridges={draftPath.autoBridges}
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
  /** Cells where commit will auto-place a cross-bridge — the DraftPath
   *  renderer can highlight them so the owner sees what's about to land. */
  autoBridges: Cell[];
}

function computeDraftPath(
  draft: { waypoints: Cell[]; layer: Layer } | null,
  cursor: Cell | null,
  project: ReturnType<typeof useProject>['project'],
  lookup: (id: string) => Device | undefined,
): DraftPathState | null {
  if (!draft || draft.waypoints.length === 0) return null;
  const ctx = buildRouteContext(project, draft.layer, lookup);

  // First-step direction: only set when waypoint[0] is itself the very first
  // cell (no committed segments yet) — once we've passed at least one waypoint
  // the heading carries through and overrides any port lock.
  const firstStep =
    findOutputPortAtCell(draft.waypoints[0]!, draft.layer, project, lookup)?.face_direction ??
    undefined;

  // Build the cell list to plan: waypoints + the live cursor cell if it
  // differs from the last waypoint (otherwise the cursor sits on the last
  // waypoint and there's no live segment to draw).
  const pts: Cell[] = [...draft.waypoints];
  if (cursor) {
    const last = pts[pts.length - 1]!;
    if (cursor.x !== last.x || cursor.y !== last.y) pts.push(cursor);
  }

  if (pts.length < 2) {
    // Single-cell preview — just the start.
    return { path: [pts[0]!], layer: draft.layer, status: 'valid', autoBridges: [] };
  }

  const planned = planSegments(pts, ctx, null, firstStep);
  const status: 'valid' | 'collision' = planned.collisions.length > 0 ? 'collision' : 'valid';
  return {
    path: planned.path as Cell[],
    layer: draft.layer,
    status,
    autoBridges: planned.bridgesToAutoPlace as Cell[],
  };
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
