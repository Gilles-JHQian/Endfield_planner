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
import { BeltCursor, DraftPath } from './DraftPath.tsx';
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
  findInputPortAtCell,
  findOutputPortAtCell,
  planSegments,
  type ProjectRouteContext,
} from './belt-router.ts';
import { computePowerCoverage } from '@core/domain/power-coverage.ts';
import { generateInstanceId } from '@core/domain/project.ts';
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
  // Inspector pin: the device shown in the right-column inspector panel.
  // P4 v6: ONLY left-click on a device in the select tool drives this; right-
  // click is now pure "highlight" (boxSelected / selectedLinkIds) and does
  // NOT change Inspector content (per owner clarification).
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  // P4 v6 highlight set: drives the visual selection brackets and the F/R/
  // Ctrl-C/V keyboard shortcuts. Built up by right-click (single) and right-
  // mouse drag (multi). Distinct from `selectedInstanceId`.
  const [boxSelected, setBoxSelected] = useState<ReadonlySet<string>>(new Set());
  // P4 v6: link-side highlight set — symmetric with `boxSelected` but for
  // belts/pipes. Right-click on a link cell adds {id}; right-mouse drag
  // includes any link whose path is fully inside the rectangle.
  const [selectedLinkIds, setSelectedLinkIds] = useState<ReadonlySet<string>>(new Set());
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
  // P4 v5: boxSelected persists across tool switches now (right-mouse drag
  // is the universal box-select; tool changes don't invalidate it).
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

  // Selection-aware global keybindings (P4 v5 — no longer tool-bound):
  // - F / Delete: batch-delete the box selection, OR delete the selected
  //   single belt, OR delete the selected single device.
  // - Ctrl+C / Ctrl+V: copy/paste the box selection (devices only).
  useEffect(() => {
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
      if (e.key === 'f' || e.key === 'F' || e.key === 'Delete') {
        if (boxSelected.size > 0 || selectedLinkIds.size > 0) {
          e.preventDefault();
          const actions: ProjectAction[] = [
            ...Array.from(boxSelected).map(
              (instance_id) =>
                ({
                  type: 'delete_device',
                  instance_id,
                }) as const,
            ),
            ...Array.from(selectedLinkIds).map(
              (link_id) =>
                ({
                  type: 'delete_link',
                  link_id,
                }) as const,
            ),
          ];
          store.applyMany(actions);
          setBoxSelected(new Set());
          setSelectedLinkIds(new Set());
          if (selectedInstanceId && boxSelected.has(selectedInstanceId)) {
            setSelectedInstanceId(null);
          }
          return;
        }
        // Single-device deletion via Delete key (selected via V-tool left-
        // click) is handled by the existing selection-aware listener below.
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boxSelected, store, selectedInstanceId, selectedLinkIds, cursor, lookup]);

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
  // P4 v6 READY-state cursor preview: belt/pipe tool active, no draft yet,
  // cursor in plot. Enlarges and tints if the cursor sits on an output port.
  const beltCursorState =
    (toolApi.tool.kind === 'belt' || toolApi.tool.kind === 'pipe') && !linkDraft && cursor
      ? {
          cell: cursor,
          layer: (toolApi.tool.kind === 'belt' ? 'solid' : 'fluid') as Layer,
          onPort:
            findOutputPortAtCell(
              cursor,
              toolApi.tool.kind === 'belt' ? 'solid' : 'fluid',
              store.project,
              lookup,
            ) !== null,
        }
      : null;

  /** P4 v6 right-click: device or belt under cell goes into the highlight set
   *  (`boxSelected` for devices, `selectedLinkIds` for belts). Does NOT touch
   *  `selectedInstanceId` — the Inspector pin only changes via left-click in
   *  the select tool. Empty cell clears the highlight only.
   *
   *  In PLACING state (linkDraft active), right-click cancels the draft
   *  back to READY instead — owners can abort a mis-started path without
   *  reaching for Esc. */
  function handleCellRightClick(cell: Cell): void {
    if (linkDraft) {
      setLinkDraft(null);
      return;
    }
    const hitDevice = findDeviceAtCell(store.project.devices, lookup, cell);
    if (hitDevice) {
      setBoxSelected(new Set([hitDevice.instance_id]));
      setSelectedLinkIds(new Set());
      return;
    }
    const hitLink = findLinkAtCell(store.project, cell);
    if (hitLink) {
      setSelectedLinkIds(new Set([hitLink.id]));
      setBoxSelected(new Set());
      return;
    }
    // Empty cell — clear highlight (devices + links). Inspector pin stays.
    setBoxSelected(new Set());
    setSelectedLinkIds(new Set());
  }

  /** P4 v6 right-mouse drag: highlight every device AND link fully inside
   *  the rectangle. Same "every cell inside" predicate for both.
   *
   *  In PLACING state, treat any right-mouse release (drag or click) as a
   *  draft cancel — same as handleCellRightClick. Avoids accidentally
   *  starting a box-select while the user is trying to abort. */
  function handleBoxSelect(rect: { from: Cell; to: Cell }): void {
    if (linkDraft) {
      setLinkDraft(null);
      return;
    }
    const inside = (c: Cell): boolean =>
      c.x >= rect.from.x && c.x <= rect.to.x && c.y >= rect.from.y && c.y <= rect.to.y;
    const ids = new Set<string>();
    for (const placed of store.project.devices) {
      const dev = lookup(placed.device_id);
      if (!dev) continue;
      const cells = footprintCells(dev, placed);
      if (cells.every(inside)) ids.add(placed.instance_id);
    }
    const linkIds = new Set<string>();
    for (const link of store.project.solid_links) {
      if (link.path.every(inside)) linkIds.add(link.id);
    }
    for (const link of store.project.fluid_links) {
      if (link.path.every(inside)) linkIds.add(link.id);
    }
    setBoxSelected(ids);
    setSelectedLinkIds(linkIds);
  }

  function handleCellClick(cell: Cell, _evt: MouseEvent): void {
    if (toolApi.tool.kind === 'place') {
      const result = store.apply({
        type: 'place_device',
        device: toolApi.tool.device,
        position: cell,
        rotation: toolApi.tool.rotation,
      });
      if (!result.ok) {
        // For now silent — visual ghost color already told the user it's invalid.
        return;
      }
    } else if (toolApi.tool.kind === 'select') {
      // Inspector pin: drives the right-column panel content. Only left-click
      // in the select tool sets it (P4 v6 — was also right-click in v5).
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
    // P4 v6: detect input-port at the click cell first (without arrival-direction
    // filter) so we can pass its required arrival_direction into the planner.
    // The planner enforces the match and returns a collision if mismatched.
    const portAtClick = findInputPortAtCell(cell, layer, store.project, lookup);
    const initialHeading = headingAtEnd(linkDraft.waypoints, ctx, firstStep);
    const candidate = planSegments(
      [last, cell],
      ctx,
      initialHeading,
      // First-step direction only applies if last is itself the first waypoint
      // (single-waypoint draft); otherwise the heading carries forward.
      linkDraft.waypoints.length === 1 ? firstStep : undefined,
      portAtClick?.arrival_direction,
    );
    if (candidate.collisions.length > 0) return;

    // Commit conditions.
    const closesLoop = cell.x === start.x && cell.y === start.y && linkDraft.waypoints.length >= 2;
    if (closesLoop || portAtClick) {
      const finalWaypoints = closesLoop ? linkDraft.waypoints : [...linkDraft.waypoints, cell];
      commitLink(finalWaypoints, layer, portAtClick);
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
    const startPort = findOutputPortAtCell(waypoints[0]!, layer, store.project, lookup);
    const lastInput = portHit
      ? findInputPortAtCell(waypoints[waypoints.length - 1]!, layer, store.project, lookup)
      : null;
    const planned = planSegments(
      waypoints,
      ctx,
      null,
      startPort?.face_direction,
      lastInput?.arrival_direction,
    );
    if (planned.collisions.length > 0) return; // shouldn't happen — ghost gates clicks

    const tier_id = defaultTierId(bundle, layer);
    const srcRef = startPort
      ? { device_instance_id: startPort.device_instance_id, port_index: startPort.port_index }
      : undefined;
    const dstRef = portHit
      ? { device_instance_id: portHit.device_instance_id, port_index: portHit.port_index }
      : undefined;

    // P4 v6 auto-bridge truncation. For each cross-bridge the planner wants
    // to auto-place:
    //  1. Pre-generate the bridge's instance_id so split actions can forward-
    //     reference it inside the same applyMany batch.
    //  2. Emit place_device with the pinned id.
    //  3. Split the existing same-layer link covering the bridge cell — the
    //     two halves connect to the bridge's port on the side they enter /
    //     exit. The bridge cell is dropped from both halves (the bridge
    //     occupies it now).
    //  4. The NEW link is broken into segments at every bridge cell; each
    //     segment becomes a separate add_link with src/dst pointing at the
    //     adjacent bridge's port (or the original endpoints at the outer
    //     ends).
    const bridgeDev = lookup(crossBridgeId(layer));
    const bridgeIdByCell = new Map<string, string>();
    if (bridgeDev) {
      for (const c of planned.bridgesToAutoPlace) {
        const k = `${c.x.toString()},${c.y.toString()}`;
        if (bridgeIdByCell.has(k)) continue;
        bridgeIdByCell.set(k, generateInstanceId('d'));
      }
    }

    const actions: ProjectAction[] = [];
    // Step 2: place each bridge.
    if (bridgeDev) {
      for (const [k, instance_id] of bridgeIdByCell) {
        const [sx, sy] = k.split(',');
        actions.push({
          type: 'place_device',
          device: bridgeDev,
          position: { x: Number.parseInt(sx!, 10), y: Number.parseInt(sy!, 10) },
          rotation: 0,
          instance_id,
        });
      }
    }

    // Step 3: split existing links covered by each new bridge.
    for (const [k, bridgeId] of bridgeIdByCell) {
      const [sx, sy] = k.split(',');
      const cell = { x: Number.parseInt(sx!, 10), y: Number.parseInt(sy!, 10) };
      const existing = findLayerLinkAtCell(store.project, layer, cell);
      if (!existing) continue;
      const idx = existing.path.findIndex((c) => c.x === cell.x && c.y === cell.y);
      if (idx <= 0 || idx >= existing.path.length - 1) continue; // can't split at endpoints
      const inDir = signDir(existing.path[idx]!, existing.path[idx - 1]!);
      const outDir = signDir(existing.path[idx + 1]!, existing.path[idx]!);
      actions.push({
        type: 'split_link',
        link_id: existing.id,
        at_cell: cell,
        left_dst: { device_instance_id: bridgeId, port_index: portIndexForArrival(inDir) },
        right_src: { device_instance_id: bridgeId, port_index: portIndexForExit(outDir) },
      });
    }

    // Step 4: emit the new link as one or more segments split at bridge cells.
    const segments = splitPathAtBridges(planned.path, bridgeIdByCell);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const isFirst = i === 0;
      const isLast = i === segments.length - 1;
      const segSrc = isFirst
        ? srcRef
        : (() => {
            const prevBridgeKey = seg.entryFromBridgeKey!;
            const id = bridgeIdByCell.get(prevBridgeKey)!;
            const [bx, by] = prevBridgeKey.split(',');
            const bridgeCell = { x: Number.parseInt(bx!, 10), y: Number.parseInt(by!, 10) };
            const exitDir = signDir(seg.path[0]!, bridgeCell);
            return { device_instance_id: id, port_index: portIndexForExit(exitDir) };
          })();
      const segDst = isLast
        ? dstRef
        : (() => {
            const nextBridgeKey = seg.exitToBridgeKey!;
            const id = bridgeIdByCell.get(nextBridgeKey)!;
            const [bx, by] = nextBridgeKey.split(',');
            const bridgeCell = { x: Number.parseInt(bx!, 10), y: Number.parseInt(by!, 10) };
            const arriveDir = signDir(bridgeCell, seg.path[seg.path.length - 1]!);
            return { device_instance_id: id, port_index: portIndexForArrival(arriveDir) };
          })();
      actions.push({
        type: 'add_link',
        layer,
        tier_id,
        path: seg.path,
        ...(segSrc ? { src: segSrc } : {}),
        ...(segDst ? { dst: segDst } : {}),
      });
    }
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
              <LinkLayer
                project={store.project}
                viewMode={viewMode}
                selectedLinkIds={selectedLinkIds}
              />
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
              {beltCursorState && (
                <BeltCursor
                  cell={beltCursorState.cell}
                  layer={beltCursorState.layer}
                  onPort={beltCursorState.onPort}
                />
              )}
              {highlight && (
                <IssueHighlight cells={highlight.cells} severity={highlight.severity} />
              )}
            </>
          }
          onCellClick={handleCellClick}
          onCellRightClick={handleCellRightClick}
          onBoxSelect={handleBoxSelect}
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

  // P4 v6: if the cursor sits on an input port, lock the last segment's
  // arrival direction. Mismatch → planSegments reports a collision → ghost
  // goes red and the click is rejected.
  const lastCell = pts[pts.length - 1]!;
  const lastInput = findInputPortAtCell(lastCell, draft.layer, project, lookup);
  const planned = planSegments(pts, ctx, null, firstStep, lastInput?.arrival_direction);
  const status: 'valid' | 'collision' = planned.collisions.length > 0 ? 'collision' : 'valid';
  return {
    path: planned.path as Cell[],
    layer: draft.layer,
    status,
    autoBridges: planned.bridgesToAutoPlace as Cell[],
  };
}

/** Find any link (solid or fluid) whose path includes `cell`. Used by P4 v5
 *  right-click → single-belt selection. Devices already shadow the cell at
 *  their footprint cells, so the caller checks for a device hit first. */
function findLinkAtCell(
  project: ReturnType<typeof useProject>['project'],
  cell: Cell,
): { id: string; layer: Layer } | null {
  for (const link of project.solid_links) {
    for (const c of link.path) {
      if (c.x === cell.x && c.y === cell.y) return { id: link.id, layer: 'solid' };
    }
  }
  for (const link of project.fluid_links) {
    for (const c of link.path) {
      if (c.x === cell.x && c.y === cell.y) return { id: link.id, layer: 'fluid' };
    }
  }
  return null;
}

/** Same as findLinkAtCell but restricted to one layer. Returns the full Link
 *  so the caller can read its path (for the auto-bridge truncation flow). */
function findLayerLinkAtCell(
  project: ReturnType<typeof useProject>['project'],
  layer: Layer,
  cell: Cell,
): { id: string; path: readonly Cell[] } | null {
  const links = layer === 'solid' ? project.solid_links : project.fluid_links;
  for (const link of links) {
    for (const c of link.path) {
      if (c.x === cell.x && c.y === cell.y) return { id: link.id, path: link.path };
    }
  }
  return null;
}

/** Direction from `from` to `to` as a unit cardinal vector. Both cells are
 *  assumed adjacent (differ by exactly 1 in one axis). */
function signDir(to: Cell, from: Cell): { dx: number; dy: number } {
  return { dx: Math.sign(to.x - from.x), dy: Math.sign(to.y - from.y) };
}

/** Belt port indices on cross-bridge devices (1×1, ports declared in N,E,S,W
 *  order in the catalog devices file → indices 0,1,2,3). Bridge rotation is
 *  always 0 in the auto-place flow, so unrotated == world side. */
const PORT_INDEX_BY_SIDE: Record<'N' | 'E' | 'S' | 'W', number> = { N: 0, E: 1, S: 2, W: 3 };

/** Belt moving in `dir` enters a cell through the side opposite to `dir`. */
function portIndexForArrival(dir: { dx: number; dy: number }): number {
  if (dir.dx > 0) return PORT_INDEX_BY_SIDE.W;
  if (dir.dx < 0) return PORT_INDEX_BY_SIDE.E;
  if (dir.dy > 0) return PORT_INDEX_BY_SIDE.N;
  return PORT_INDEX_BY_SIDE.S;
}

/** Belt moving in `dir` exits a cell through the side aligned with `dir`. */
function portIndexForExit(dir: { dx: number; dy: number }): number {
  if (dir.dx > 0) return PORT_INDEX_BY_SIDE.E;
  if (dir.dx < 0) return PORT_INDEX_BY_SIDE.W;
  if (dir.dy > 0) return PORT_INDEX_BY_SIDE.S;
  return PORT_INDEX_BY_SIDE.N;
}

/** Split `path` at every cell whose key is in `bridgeKeys`. The bridge cells
 *  themselves are dropped from the segments (the bridge device occupies them
 *  now). Each returned segment notes which bridge it borders on each side
 *  (or undefined for the outer ends). */
interface PathSegment {
  readonly path: readonly Cell[];
  readonly entryFromBridgeKey?: string;
  readonly exitToBridgeKey?: string;
}
function splitPathAtBridges(
  path: readonly Cell[],
  bridgeKeys: ReadonlyMap<string, string>,
): PathSegment[] {
  const segments: PathSegment[] = [];
  let current: Cell[] = [];
  let entryFrom: string | undefined;
  for (const c of path) {
    const k = `${c.x.toString()},${c.y.toString()}`;
    if (bridgeKeys.has(k)) {
      if (current.length > 0) {
        const seg: PathSegment = {
          path: current,
          ...(entryFrom !== undefined ? { entryFromBridgeKey: entryFrom } : {}),
          exitToBridgeKey: k,
        };
        segments.push(seg);
      }
      current = [];
      entryFrom = k;
      continue;
    }
    current.push(c);
  }
  if (current.length > 0) {
    const seg: PathSegment = {
      path: current,
      ...(entryFrom !== undefined ? { entryFromBridgeKey: entryFrom } : {}),
    };
    segments.push(seg);
  }
  return segments;
}
