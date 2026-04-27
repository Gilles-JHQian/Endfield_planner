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
import {
  buildOccupancy,
  fitsInPlot,
  footprintCells,
  portsInWorldFrame,
  rotatedBoundingBox,
} from '@core/domain/index.ts';
import { layerOccupancyOf } from '@core/drc/bridges.ts';
import type { DataBundle, Device } from '@core/data-loader/types.ts';
import { Canvas } from './Canvas.tsx';
import { LayerToggle } from './LayerToggle.tsx';
import { StatusBar } from './StatusBar.tsx';
import { Rail, type LibraryTab } from './Rail.tsx';
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
import { MoveModeGhost } from './MoveModeGhost.tsx';
import { PowerOverlay } from './PowerOverlay.tsx';
import { ProjectMenu } from './ProjectMenu.tsx';
import {
  buildRouteContext,
  crossBridgeId,
  defaultTierId,
  findInputPortAtCell,
  findOutputPortAtCell,
  hasMultipleOutputPortsAtCell,
  planSegments,
  type ProjectRouteContext,
} from './belt-router.ts';
import { computePowerCoverage } from '@core/domain/power-coverage.ts';
import { generateInstanceId } from '@core/domain/project.ts';
import type { Layer, Link, PlacedDevice } from '@core/domain/types.ts';
import type { Issue } from '@core/drc/index.ts';
import {
  buildPayload,
  clearCurrent,
  copyToClipboard,
  exportProject,
  flushSave,
  importProject,
  loadCurrent,
  promoteToTopOfHistory,
  readClipboard,
  readClipboardHistory,
  scheduleSave,
  type ClipboardPayload,
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
  const [category, setCategory] = useState<LibraryTab>('basic_production');
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
  // P4 v7.3: move mode. Owners press M with ≥1 highlighted device to enter.
  //  - `devices` + `links` is the snapshot of what was removed from the
  //    project on entry, used both for the cursor-following ghost and for
  //    cancel-restore.
  //  - `pivot` is the bbox center of the snapshot devices, fixed for the
  //    duration of move mode (so 4 R-presses always return to original).
  //  - `rotationSteps` counts 90° CW R-presses; the ghost re-renders.
  //  - Cursor position drives the translation; left-click commits at the
  //    current ghost position, right-click / M / Esc cancels and restores.
  const [moveMode, setMoveMode] = useState<{
    devices: readonly PlacedDevice[];
    links: readonly Link[];
    pivot: Cell;
    rotationSteps: 0 | 1 | 2 | 3;
  } | null>(null);
  // P4 v7: when non-null, the next left-click pastes this payload at the
  // cursor (place-mode-style). Set by clicking a slot in the clipboard tab;
  // cleared by right-click / Esc / successful paste.
  const [pasteSource, setPasteSource] = useState<ClipboardPayload | null>(null);
  // Tick that nudges the Library to re-render when clipboard history changes
  // (history is module-level state, not React state).
  const [clipboardTick, setClipboardTick] = useState(0);
  const clipboardHistory = useMemo(
    () => readClipboardHistory(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clipboardTick],
  );
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
        // P4 v7: include all links (both layers) whose endpoints both reference
        // P4 v7.3: include any link in selectedLinkIds PLUS any link whose
        // both endpoints reference a boxSelected device. PortRefs to devices
        // outside the selection are dropped on paste (v7.3 buildPayload).
        const allLinks = [...store.project.solid_links, ...store.project.fluid_links];
        const includedLinks = allLinks.filter((l) => {
          if (selectedLinkIds.has(l.id)) return true;
          if (
            l.src &&
            l.dst &&
            boxSelected.has(l.src.device_instance_id) &&
            boxSelected.has(l.dst.device_instance_id)
          ) {
            return true;
          }
          return false;
        });
        const payload = buildPayload(devices, includedLinks);
        if (payload) {
          copyToClipboard(payload);
          setClipboardTick((n) => n + 1);
        }
        return;
      }
      if (meta && (e.key === 'v' || e.key === 'V')) {
        if (!cursor) return;
        const payload = readClipboard();
        if (!payload) return;
        e.preventDefault();
        pastePayloadAtCursor(payload, cursor);
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
      // P4 v7.3: standalone batch-rotate removed. R only rotates inside
      // move mode (snapshot-relative pivot, no drift). See moveMode handler.
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // pastePayloadAtCursor / toolApi.tool.kind intentionally omitted: the
    // handler reads the latest closure values via the function instance, and
    // these change every render, which would re-attach the listener for no
    // benefit. Same pattern as v5/v6 keyboard effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxSelected, store, selectedInstanceId, selectedLinkIds, cursor, lookup]);

  // P4 v7: Esc cancels paste mode.
  useEffect(() => {
    if (!pasteSource) return;
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') setPasteSource(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pasteSource]);

  // P4 v7.3: M key. Outside move mode + with ≥1 highlighted device → enter
  // move mode (snapshot + remove). Inside move mode → cancel (restore).
  // Also: Esc cancels; R rotates the snapshot 90° CW around its pivot.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta) return;
      // P4 v7.4: M (game default) OR X (more reachable on the keyboard)
      // toggles move mode. Both behave identically.
      if (e.key === 'm' || e.key === 'M' || e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        if (moveMode) {
          cancelMoveMode();
        } else if (boxSelected.size > 0 && toolApi.tool.kind === 'select') {
          enterMoveMode();
        }
        return;
      }
      if (moveMode && e.key === 'Escape') {
        e.preventDefault();
        cancelMoveMode();
        return;
      }
      if (moveMode && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        setMoveMode((m) =>
          m
            ? {
                ...m,
                rotationSteps: ((m.rotationSteps + 1) % 4) as 0 | 1 | 2 | 3,
              }
            : m,
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveMode, boxSelected, toolApi.tool.kind]);

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
      ? (() => {
          const cursorLayer: Layer = toolApi.tool.kind === 'belt' ? 'solid' : 'fluid';
          return {
            cell: cursor,
            layer: cursorLayer,
            onPort: findOutputPortAtCell(cursor, cursorLayer, store.project, lookup) !== null,
          };
        })()
      : null;
  // P4 v7.3: cursor-following ghost for move mode. Re-computed every render
  // (O(snapshot.devices × footprint + project.devices × footprint)).
  const moveGhost =
    moveMode && cursor ? computeMoveGhost(moveMode, cursor, store.project, lookup) : null;
  // P4 v7.7: paste mode renders the same multi-device cluster ghost so the
  // owner can see the placement footprint before clicking. Reuses the move-
  // ghost shape + MoveModeGhost renderer.
  const pasteGhost =
    pasteSource && cursor && !moveMode
      ? computePasteGhost(pasteSource, cursor, store.project, lookup)
      : null;

  /** P4 v6 right-click: device or belt under cell goes into the highlight set
   *  (`boxSelected` for devices, `selectedLinkIds` for belts). Does NOT touch
   *  `selectedInstanceId` — the Inspector pin only changes via left-click in
   *  the select tool. Empty cell clears the highlight only.
   *
   *  In PLACING state (linkDraft active), right-click cancels the draft
   *  back to READY instead — owners can abort a mis-started path without
   *  reaching for Esc. */
  /** P4 v7: paste a clipboard payload at the cursor cell. Pre-generates
   *  instance ids for the new devices so the link `add_link` actions in the
   *  same applyMany batch can forward-reference them via PortRef.
   *
   *  P4 v7.8: cursor anchors the cluster's CENTER (matching the v7.8 ghost). */
  function pastePayloadAtCursor(payload: ClipboardPayload, cursor: Cell): void {
    const anchor = clipboardCenterAnchor(payload, cursor, lookup);
    const itemIds = payload.items.map(() => generateInstanceId('d'));
    const placeActions: ProjectAction[] = [];
    for (let i = 0; i < payload.items.length; i++) {
      const item = payload.items[i]!;
      const dev = lookup(item.device_id);
      if (!dev) continue;
      placeActions.push({
        type: 'place_device',
        device: dev,
        position: { x: anchor.x + item.rel_position.x, y: anchor.y + item.rel_position.y },
        rotation: item.rotation,
        instance_id: itemIds[i]!,
      });
    }
    if (placeActions.length === 0) return;
    const linkActions: ProjectAction[] = payload.links.map((l) => {
      const src =
        l.src_item_index !== undefined && l.src_port_index !== undefined
          ? { device_instance_id: itemIds[l.src_item_index]!, port_index: l.src_port_index }
          : undefined;
      const dst =
        l.dst_item_index !== undefined && l.dst_port_index !== undefined
          ? { device_instance_id: itemIds[l.dst_item_index]!, port_index: l.dst_port_index }
          : undefined;
      return {
        type: 'add_link' as const,
        layer: l.layer,
        tier_id: l.tier_id,
        path: l.rel_path.map((c) => ({ x: anchor.x + c.x, y: anchor.y + c.y })),
        ...(src ? { src } : {}),
        ...(dst ? { dst } : {}),
      };
    });
    const result = store.applyMany([...placeActions, ...linkActions]);
    if (result.ok) {
      setBoxSelected(new Set(result.value.placed.map((p) => p.instance_id)));
    }
  }

  /** P4 v7.3 — collect the snapshot devices + attached links and remove
   *  them from the project. The links included are: any in selectedLinkIds,
   *  PLUS any link whose both endpoints reference a boxSelected device (so
   *  attached belts travel with their devices even when the user only
   *  selected the devices). */
  function enterMoveMode(): void {
    const devices = store.project.devices.filter((d) => boxSelected.has(d.instance_id));
    if (devices.length === 0) return;
    const allLinks = [...store.project.solid_links, ...store.project.fluid_links];
    const links = allLinks.filter((l) => {
      if (selectedLinkIds.has(l.id)) return true;
      if (
        l.src &&
        l.dst &&
        boxSelected.has(l.src.device_instance_id) &&
        boxSelected.has(l.dst.device_instance_id)
      ) {
        return true;
      }
      return false;
    });
    // Pivot: bbox center of all device footprints, floored to an integer
    // cell so 90° rotations land on integer cells (rotation around an
    // integer pivot is integer-clean for cells).
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const d of devices) {
      const dev = lookup(d.device_id);
      if (!dev) continue;
      for (const c of footprintCells(dev, d)) {
        if (c.x < minX) minX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.x > maxX) maxX = c.x;
        if (c.y > maxY) maxY = c.y;
      }
    }
    const pivot: Cell = {
      x: Math.floor((minX + maxX + 1) / 2),
      y: Math.floor((minY + maxY + 1) / 2),
    };
    // Remove snapshot from project (atomic batch).
    const removeActions: ProjectAction[] = [
      ...links.map((l) => ({ type: 'delete_link' as const, link_id: l.id })),
      ...devices.map((d) => ({ type: 'delete_device' as const, instance_id: d.instance_id })),
    ];
    const result = store.applyMany(removeActions);
    if (!result.ok) return;
    setMoveMode({ devices, links, pivot, rotationSteps: 0 });
    // Clear visible selections so the highlight brackets don't linger
    // pointing at instances that no longer exist.
    setBoxSelected(new Set());
    setSelectedLinkIds(new Set());
    setSelectedInstanceId(null);
  }

  /** Restore the snapshot at its original positions (rotation = 0 step) and
   *  exit move mode. Used by Esc / right-click / M-while-in-move-mode. */
  function cancelMoveMode(): void {
    if (!moveMode) return;
    const itemIdMap = new Map<string, string>();
    for (const d of moveMode.devices) {
      itemIdMap.set(d.instance_id, generateInstanceId('d'));
    }
    const actions: ProjectAction[] = [];
    for (const d of moveMode.devices) {
      actions.push({
        type: 'place_device',
        device: lookup(d.device_id)!,
        position: d.position,
        rotation: d.rotation,
        instance_id: itemIdMap.get(d.instance_id)!,
      });
    }
    for (const l of moveMode.links) {
      const src = l.src ? remapPortRef(l.src, itemIdMap) : undefined;
      const dst = l.dst ? remapPortRef(l.dst, itemIdMap) : undefined;
      actions.push({
        type: 'add_link',
        layer: l.layer,
        tier_id: l.tier_id,
        path: l.path,
        ...(src ? { src } : {}),
        ...(dst ? { dst } : {}),
      });
    }
    store.applyMany(actions);
    setMoveMode(null);
  }

  /** Commit the snapshot at the cursor's current position + rotation if no
   *  collisions. No-op (silent) if the ghost is red.
   *
   *  P4 v7.8: `keepMode = true` (Ctrl/Cmd held during the click) leaves the
   *  moveMode state intact so the next click can drop another clone at a
   *  new cursor cell. Symmetric with the place / paste Ctrl+click clone
   *  semantics from v7.7. */
  function commitMoveMode(keepMode: boolean): void {
    if (!moveMode || !cursor) return;
    const ghost = computeMoveGhost(moveMode, cursor, store.project, lookup);
    if (ghost.collides) return;
    const itemIdMap = new Map<string, string>();
    for (const d of moveMode.devices) {
      itemIdMap.set(d.instance_id, generateInstanceId('d'));
    }
    const actions: ProjectAction[] = [];
    for (let i = 0; i < ghost.devices.length; i++) {
      const orig = moveMode.devices[i]!;
      const placed = ghost.devices[i]!;
      actions.push({
        type: 'place_device',
        device: lookup(orig.device_id)!,
        position: placed.position,
        rotation: placed.rotation,
        instance_id: itemIdMap.get(orig.instance_id)!,
      });
    }
    for (let i = 0; i < ghost.links.length; i++) {
      const orig = moveMode.links[i]!;
      const path = ghost.links[i]!.path;
      const src = orig.src ? remapPortRef(orig.src, itemIdMap) : undefined;
      const dst = orig.dst ? remapPortRef(orig.dst, itemIdMap) : undefined;
      actions.push({
        type: 'add_link',
        layer: orig.layer,
        tier_id: orig.tier_id,
        path,
        ...(src ? { src } : {}),
        ...(dst ? { dst } : {}),
      });
    }
    store.applyMany(actions);
    if (!keepMode) setMoveMode(null);
  }

  function handleCellRightClick(cell: Cell): void {
    // P4 v7.3: right-click cancels move mode (restore snapshot).
    if (moveMode) {
      cancelMoveMode();
      return;
    }
    // P4 v7: right-click clears paste mode if active.
    if (pasteSource) {
      setPasteSource(null);
      return;
    }
    // P4 v7.5: right-click in any TOOL mode (place/belt/pipe) returns to
    // select instead of doing the highlight selection. Owners reported the
    // overlap (right-click cancels draft, but right-click in non-drafting
    // belt mode silently highlighted a belt) confused the mental model:
    // right-click in a tool = "exit this tool", period. Box-select is only
    // available in the select tool.
    if (toolApi.tool.kind === 'place') {
      toolApi.setSelect();
      setPickedDevice(null);
      return;
    }
    if (toolApi.tool.kind === 'belt' || toolApi.tool.kind === 'pipe') {
      if (linkDraft) setLinkDraft(null);
      toolApi.setSelect();
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

  /** P4 v6 right-mouse drag (with v7.3 move-mode cancel): highlight every
   *  device AND link fully inside
   *  the rectangle. Same "every cell inside" predicate for both.
   *
   *  In PLACING state, treat any right-mouse release (drag or click) as a
   *  draft cancel — same as handleCellRightClick. Avoids accidentally
   *  starting a box-select while the user is trying to abort. */
  function handleBoxSelect(rect: { from: Cell; to: Cell }): void {
    // P4 v7.3: right-mouse drag in move mode = cancel (same as right-click).
    if (moveMode) {
      cancelMoveMode();
      return;
    }
    // P4 v7.5: right-mouse drag in any TOOL mode = exit to select (no box-
    // select). Symmetric with handleCellRightClick's tool-mode behavior.
    if (toolApi.tool.kind === 'place') {
      toolApi.setSelect();
      setPickedDevice(null);
      return;
    }
    if (toolApi.tool.kind === 'belt' || toolApi.tool.kind === 'pipe') {
      if (linkDraft) setLinkDraft(null);
      toolApi.setSelect();
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

  function handleCellClick(cell: Cell, evt: MouseEvent): void {
    // P4 v7.7: Ctrl/Cmd + left-click in a placement mode = "drop a copy and
    // STAY in the mode" (clone gesture). Plain left-click drops one and
    // exits back to select. P4 v7.8 extends this to move mode too.
    const cloneModifier = evt.ctrlKey || evt.metaKey;
    // P4 v7.3 move mode: left-click commits the snapshot at the cursor's
    // current position + rotation (silent no-op on collision).
    if (moveMode) {
      commitMoveMode(cloneModifier);
      return;
    }
    // P4 v7 paste mode: a clipboard slot was picked from the Library tab.
    if (pasteSource) {
      // P4 v7.7: block paste when the cluster ghost is red.
      const ghost = computePasteGhost(pasteSource, cell, store.project, lookup);
      if (ghost.collides) return;
      pastePayloadAtCursor(pasteSource, cell);
      if (!cloneModifier) setPasteSource(null);
      return;
    }
    if (toolApi.tool.kind === 'place') {
      // P4 v7: cursor anchored to the device's CENTER (not top-left). For a
      // 2×2 device, cursor at (5,5) → footprint (4,4)-(5,5). For 3×3:
      // (4,4)-(6,6). 1×1 stays unchanged. Convert cursor → top-left here so
      // the underlying place_device contract is unchanged.
      const topLeft = cursorToTopLeft(cell, toolApi.tool.device, toolApi.tool.rotation);
      // P4 v7: place-on-belt — when the device's footprint overlaps existing
      // same-layer belts, plan splits at the device's port cells if legal,
      // otherwise reject the click. Bundle bridge id pinning + place_device +
      // split_link into one applyMany so undo wipes the entire interaction.
      const placePlan = planPlaceOnBeltSplits(
        store.project,
        toolApi.tool.device,
        topLeft,
        toolApi.tool.rotation,
      );
      if (placePlan === 'red') return;
      const newDeviceId = generateInstanceId('d');
      const actions: ProjectAction[] = [
        {
          type: 'place_device',
          device: toolApi.tool.device,
          position: topLeft,
          rotation: toolApi.tool.rotation,
          instance_id: newDeviceId,
        },
      ];
      for (const p of placePlan) {
        if (p.kind === 'split') {
          actions.push({
            type: 'split_link',
            link_id: p.link_id,
            at_cell: p.at_cell,
            left_dst: { device_instance_id: newDeviceId, port_index: p.input_port_index },
            right_src: { device_instance_id: newDeviceId, port_index: p.output_port_index },
          });
        } else if (p.kind === 'set_src') {
          actions.push({
            type: 'set_link_endpoint',
            link_id: p.link_id,
            end: 'src',
            ref: { device_instance_id: newDeviceId, port_index: p.output_port_index },
          });
        } else {
          actions.push({
            type: 'set_link_endpoint',
            link_id: p.link_id,
            end: 'dst',
            ref: { device_instance_id: newDeviceId, port_index: p.input_port_index },
          });
        }
      }
      const result = store.applyMany(actions);
      if (!result.ok) return;
      // P4 v7.7: plain click drops one and returns to select; Ctrl/Cmd
      // keeps place mode armed for rapid cloning.
      if (!cloneModifier) {
        toolApi.setSelect();
        setPickedDevice(null);
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
    // P4 v7: when start cell hosts ≥ 2 output ports, leave the lock open and
    // resolve port post-routing. Single-port → keep v6 lock for the L-shape
    // hint to make sense.
    const startMulti =
      linkDraft.waypoints.length === 1 &&
      hasMultipleOutputPortsAtCell(start, layer, store.project, lookup);
    const firstStep =
      linkDraft.waypoints.length === 1 && !startMulti
        ? (findOutputPortAtCell(start, layer, store.project, lookup)?.face_direction ?? undefined)
        : undefined;
    const initialHeading = headingAtEnd(linkDraft.waypoints, ctx, firstStep);
    const candidate = planSegments(
      [last, cell],
      ctx,
      initialHeading,
      linkDraft.waypoints.length === 1 ? firstStep : undefined,
    );
    if (candidate.collisions.length > 0) return;

    // P4 v7: resolve input port from the actual planned arrival direction
    // (handles multi-port-per-cell mergers). Mismatch on a port-bearing cell
    // → reject the click.
    let portAtClick: ReturnType<typeof findInputPortAtCell> = null;
    if (candidate.path.length >= 2) {
      const arrival = signDir(
        candidate.path[candidate.path.length - 1]!,
        candidate.path[candidate.path.length - 2]!,
      );
      portAtClick = findInputPortAtCell(cell, layer, store.project, lookup, arrival);
      const anyInput = portAtClick ?? findInputPortAtCell(cell, layer, store.project, lookup);
      if (anyInput && !portAtClick) return; // wrong-direction approach to a port cell
    }

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
    // P4 v7: when the start cell hosts ≥ 2 output ports, leave firstStepDirection
    // unconstrained (let the user's chosen direction pick the port). The
    // actual src PortRef is then resolved from `planned.path`'s first step
    // post-routing. P4 v7.2: SAME pattern on the dst side — for mergers /
    // splitters with multiple input ports at the same cell, pick the port
    // whose face matches the actual planned arrival direction (was: first
    // matching port, which broke E/S inputs on a merger because the planner's
    // lastStepDirection lock got pinned to the N input's required arrival).
    const startMulti = hasMultipleOutputPortsAtCell(waypoints[0]!, layer, store.project, lookup);
    const startSingle = startMulti
      ? null
      : findOutputPortAtCell(waypoints[0]!, layer, store.project, lookup);

    // First plan WITHOUT the dst-side lock so we can read the actual arrival
    // direction off the resulting path — needed to resolve the right port on
    // multi-input devices.
    const initialPlan = planSegments(waypoints, ctx, null, startSingle?.face_direction);
    if (initialPlan.collisions.length > 0) return;
    const lastArrival =
      initialPlan.path.length >= 2
        ? signDir(
            initialPlan.path[initialPlan.path.length - 1]!,
            initialPlan.path[initialPlan.path.length - 2]!,
          )
        : undefined;
    const lastInput =
      portHit && lastArrival
        ? findInputPortAtCell(
            waypoints[waypoints.length - 1]!,
            layer,
            store.project,
            lookup,
            lastArrival,
          )
        : null;

    // Replan with both locks — for safety; should produce the same path.
    const planned = planSegments(
      waypoints,
      ctx,
      null,
      startSingle?.face_direction,
      lastInput?.arrival_direction,
    );
    if (planned.collisions.length > 0) return; // shouldn't happen — ghost gates clicks

    // Now resolve the actual output port using the planned path's first step.
    const startDeparture =
      planned.path.length >= 2 ? signDir(planned.path[1]!, planned.path[0]!) : undefined;
    const startPort =
      startSingle ??
      findOutputPortAtCell(waypoints[0]!, layer, store.project, lookup, startDeparture);

    const tier_id = defaultTierId(bundle, layer);
    const srcRef = startPort
      ? { device_instance_id: startPort.device_instance_id, port_index: startPort.port_index }
      : undefined;
    // Prefer the direction-resolved port. Fall back to portHit if lookup
    // failed (shouldn't happen in normal flow because handleLinkClick
    // already validated arrival).
    const dstRef = lastInput
      ? { device_instance_id: lastInput.device_instance_id, port_index: lastInput.port_index }
      : portHit
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
    // P4 v7.5: when the SAME existing link is crossed at multiple cells,
    // emit chained splits — each operates on the previous split's right
    // half (forward-referenced via the pinned right_id on split_link).
    // Pre-group cells by existing-link id, sort by path-index order so the
    // chain walks the link from start to end.
    const cellsByExistingLink = new Map<
      string,
      {
        existing: { id: string; path: readonly Cell[] };
        cells: { cell: Cell; bridgeId: string; idx: number }[];
      }
    >();
    for (const [k, bridgeId] of bridgeIdByCell) {
      const [sx, sy] = k.split(',');
      const cell = { x: Number.parseInt(sx!, 10), y: Number.parseInt(sy!, 10) };
      const existing = findLayerLinkAtCell(store.project, layer, cell);
      if (!existing) continue;
      const idx = existing.path.findIndex((c) => c.x === cell.x && c.y === cell.y);
      if (idx <= 0 || idx >= existing.path.length - 1) continue; // can't split at endpoints
      let bucket = cellsByExistingLink.get(existing.id);
      if (!bucket) {
        bucket = { existing, cells: [] };
        cellsByExistingLink.set(existing.id, bucket);
      }
      bucket.cells.push({ cell, bridgeId, idx });
    }
    for (const { existing, cells } of cellsByExistingLink.values()) {
      cells.sort((a, b) => a.idx - b.idx);
      let currentLinkId = existing.id;
      for (let i = 0; i < cells.length; i++) {
        const { cell, bridgeId, idx } = cells[i]!;
        const inDir = signDir(existing.path[idx]!, existing.path[idx - 1]!);
        const outDir = signDir(existing.path[idx + 1]!, existing.path[idx]!);
        const isLast = i === cells.length - 1;
        // For all-but-last splits, pin the right-half's id so the next
        // split in the chain can target it. The last split lets the edit
        // generate a fresh id.
        const rightId = isLast ? undefined : generateInstanceId('lnk');
        actions.push({
          type: 'split_link',
          link_id: currentLinkId,
          at_cell: cell,
          left_dst: { device_instance_id: bridgeId, port_index: portIndexForArrival(inDir) },
          right_src: { device_instance_id: bridgeId, port_index: portIndexForExit(outDir) },
          ...(rightId ? { right_id: rightId } : {}),
        });
        if (rightId) currentLinkId = rightId;
      }
    }

    // Step 4: emit the new link as one or more segments split at bridge cells.
    // P4 v7.1: seg.path[0] / seg.path[N-1] now ARE the bridge cells when the
    // segment borders one — direction must be computed from seg.path[1] (out
    // of the entry bridge) and seg.path[N-2] (into the exit bridge).
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
            // seg.path[0] = bridge cell; seg.path[1] = first non-bridge cell.
            const exitDir = signDir(seg.path[1]!, seg.path[0]!);
            return { device_instance_id: id, port_index: portIndexForExit(exitDir) };
          })();
      const segDst = isLast
        ? dstRef
        : (() => {
            const nextBridgeKey = seg.exitToBridgeKey!;
            const id = bridgeIdByCell.get(nextBridgeKey)!;
            // seg.path[N-1] = bridge cell; seg.path[N-2] = last non-bridge cell.
            const arriveDir = signDir(
              seg.path[seg.path.length - 1]!,
              seg.path[seg.path.length - 2]!,
            );
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
          clipboardHistory={clipboardHistory}
          onPickClipboardSlot={(payload) => {
            promoteToTopOfHistory(payload);
            setClipboardTick((n) => n + 1);
            setPasteSource(payload);
            // Clear other tools so paste-mode is the only active interaction.
            toolApi.setSelect();
            setPickedDevice(null);
          }}
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
                zoom={zoom}
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
              {moveGhost && <MoveModeGhost ghost={moveGhost} lookup={lookup} />}
              {pasteGhost && <MoveModeGhost ghost={pasteGhost} lookup={lookup} />}
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
          // P4 v7.7: only the select tool (no move / paste mode active)
          // gets the right-mouse box-select. Other contexts treat any
          // right-mouse release as a tool-cancel right-click.
          boxSelectEnabled={
            toolApi.tool.kind === 'select' && moveMode === null && pasteSource === null
          }
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
  /** TOP-LEFT of the footprint in world cells. Owner cursor → top-left
   *  conversion (P4 v7 center anchor) lives in `cursorToTopLeft`. */
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
  // P4 v7: cursor is the device's CENTER; convert to top-left for the place
  // edit + collision check.
  const topLeft = cursorToTopLeft(cursor, device, rotation);
  const placed = { position: topLeft, rotation };

  if (!fitsInPlot(device, placed, project.plot)) {
    return { device, cell: topLeft, rotation, status: 'collision' };
  }
  // P4 v7: only check layers the new device actually occupies. A solid
  // bridge ghosted over an existing fluid pipe should NOT collide — the
  // bridge only sits on the solid layer.
  const occ = buildOccupancy(project, lookup);
  const layers = layerOccupancyOf(device);
  const checkSolid = layers === 'solid' || layers === 'both';
  const checkFluid = layers === 'fluid' || layers === 'both';
  for (const c of footprintCells(device, placed)) {
    // Device-vs-device collision (per layer).
    if (checkSolid && occ.deviceSolid.has(`${c.x.toString()},${c.y.toString()}`)) {
      return { device, cell: topLeft, rotation, status: 'collision' };
    }
    if (checkFluid && occ.deviceFluid.has(`${c.x.toString()},${c.y.toString()}`)) {
      return { device, cell: topLeft, rotation, status: 'collision' };
    }
  }
  // P4 v7 place-on-belt: device may overlap existing belts ONLY if every
  // such overlap is split-legal (port at the cell with matching directions).
  // planPlaceOnBeltSplits returns 'red' when not.
  const beltPlan = planPlaceOnBeltSplits(project, device, topLeft, rotation);
  if (beltPlan === 'red') {
    return { device, cell: topLeft, rotation, status: 'collision' };
  }
  return { device, cell: topLeft, rotation, status: 'valid' };
}

/** Convert the cursor cell (visual center anchor in P4 v7) to the device's
 *  top-left footprint cell. For 1×1: identity. For 2×2: subtract 1 from each
 *  axis (cursor sits in the bottom-right cell). For 3×3: subtract 1 from
 *  each axis (cursor at center cell). General rule: top-left = cursor -
 *  floor(bbox/2). */
function cursorToTopLeft(cursor: Cell, device: Device, rotation: 0 | 90 | 180 | 270): Cell {
  const bbox = rotatedBoundingBox(device, rotation);
  return {
    x: cursor.x - Math.floor(bbox.width / 2),
    y: cursor.y - Math.floor(bbox.height / 2),
  };
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
  // P4 v7: skip the lock when the cell hosts ≥ 2 output ports (e.g. a
  // splitter at the start). The user's first move chooses the port; the
  // commit path resolves the actual port from the planned path.
  const startMulti = hasMultipleOutputPortsAtCell(
    draft.waypoints[0]!,
    draft.layer,
    project,
    lookup,
  );
  const firstStep = startMulti
    ? undefined
    : (findOutputPortAtCell(draft.waypoints[0]!, draft.layer, project, lookup)?.face_direction ??
      undefined);

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

  // P4 v7: plan unconstrained first (no last-step lock). Then resolve the
  // input port using the planned path's actual last step — needed for cells
  // hosting multiple input ports (e.g. mergers). If the cell HAS input ports
  // but NONE matches the actual approach, mark the last cell as a collision
  // so the ghost goes red and the click is rejected.
  const lastCell = pts[pts.length - 1]!;
  let planned = planSegments(pts, ctx, null, firstStep);
  if (planned.collisions.length === 0 && planned.path.length >= 2) {
    const arrival = signDir(
      planned.path[planned.path.length - 1]!,
      planned.path[planned.path.length - 2]!,
    );
    const matched = findInputPortAtCell(lastCell, draft.layer, project, lookup, arrival);
    const anyInput = matched ?? findInputPortAtCell(lastCell, draft.layer, project, lookup);
    if (anyInput && !matched) {
      planned = { ...planned, collisions: [lastCell] };
    }
  }
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

/** P4 v7.3 — remap a PortRef's device_instance_id through a fresh-id map.
 *  Used by the move-mode commit and cancel flows when re-adding the
 *  snapshotted devices/links: the new devices have new instance ids, and
 *  any belt's PortRef pointing at one needs to follow.
 *  - If the original device id is in the map → use the new id.
 *  - Else → keep pointing at the original (e.g. for a belt whose other end
 *    references a device outside the snapshot, that device is still in the
 *    project and the PortRef remains valid). */
function remapPortRef(
  ref: { device_instance_id: string; port_index: number },
  idMap: ReadonlyMap<string, string>,
): { device_instance_id: string; port_index: number } {
  const newId = idMap.get(ref.device_instance_id);
  return newId ? { device_instance_id: newId, port_index: ref.port_index } : ref;
}

/** P4 v7.3 — 90° CW rotation of a single cell around an integer pivot.
 *  Derivation: cell-center (x+0.5, y+0.5) maps to
 *  (px + py - y - 0.5, py - px + x + 0.5). Subtract (0.5, 0.5) for the
 *  rotated cell's top-left. */
function rotateCellCW(c: Cell, pivot: Cell): Cell {
  return { x: pivot.x + pivot.y - c.y - 1, y: pivot.y - pivot.x + c.x };
}

/** P4 v7.3 — cursor-following ghost for move mode. Each device's footprint
 *  cells are rotated `rotationSteps` × 90° CW around the snapshot pivot,
 *  then translated by `(cursor - pivot)`. New top-left = min of new
 *  footprint cells; new rotation = original + steps × 90°. Belt paths are
 *  rotated cell-by-cell. Collision check: every ghost device footprint cell
 *  is tested against the live (post-snapshot-removal) project per-layer
 *  occupancy; out-of-plot also collides. */
interface MoveGhost {
  /** Ghost devices at their new positions/rotations. */
  devices: PlacedDevice[];
  /** Ghost links at their new path positions (src/dst PortRefs unchanged). */
  links: {
    layer: Layer;
    tier_id: string;
    path: Cell[];
  }[];
  /** True when at least one ghost cell collides with the live project or
   *  falls outside the plot. The full set is in `collidingCells`. */
  collides: boolean;
  /** "x,y" keys for cells the ghost wants to occupy that are blocked. The
   *  renderer overlays these in red. */
  collidingCells: Set<string>;
}

function computeMoveGhost(
  state: {
    devices: readonly PlacedDevice[];
    links: readonly Link[];
    pivot: Cell;
    rotationSteps: 0 | 1 | 2 | 3;
  },
  cursor: Cell,
  project: { plot: { width: number; height: number } } & Parameters<typeof buildOccupancy>[0],
  lookup: (id: string) => Device | undefined,
): MoveGhost {
  const dx = cursor.x - state.pivot.x;
  const dy = cursor.y - state.pivot.y;
  const rotateAndTranslate = (c: Cell): Cell => {
    let cell = c;
    for (let i = 0; i < state.rotationSteps; i++) {
      cell = rotateCellCW(cell, state.pivot);
    }
    return { x: cell.x + dx, y: cell.y + dy };
  };

  const newDevices: PlacedDevice[] = state.devices.map((d) => {
    const dev = lookup(d.device_id);
    if (!dev) return d;
    const fpCells = footprintCells(dev, { position: d.position, rotation: d.rotation });
    const newFootprint = fpCells.map(rotateAndTranslate);
    let minX = Infinity;
    let minY = Infinity;
    for (const c of newFootprint) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
    }
    const newRotation = ((d.rotation + 90 * state.rotationSteps) % 360) as 0 | 90 | 180 | 270;
    return { ...d, position: { x: minX, y: minY }, rotation: newRotation };
  });

  const newLinks = state.links.map((l) => ({
    layer: l.layer,
    tier_id: l.tier_id,
    path: l.path.map(rotateAndTranslate),
  }));

  const colliding = clusterCollisions(newDevices, newLinks, project, lookup);
  return {
    devices: newDevices,
    links: newLinks,
    collides: colliding.size > 0,
    collidingCells: colliding,
  };
}

/** P4 v7.4 collision check shared by move-mode and paste-mode cluster ghosts.
 *  Treats the project as the "rest" — the move-mode caller has already
 *  removed its snapshot from the project, the paste-mode caller never had
 *  the cluster in the project to begin with, so neither false-positives
 *  against itself. Four classes of collision:
 *    1. Ghost device cells outside the plot.
 *    2. Ghost device cells that overlap an existing device on a layer the
 *       cluster device blocks.
 *    3. Ghost device cells that overlap an existing same-layer link (belt
 *       under device — no auto-split during cluster placement).
 *    4. Ghost link path cells that overlap an existing same-layer link OR
 *       enter an existing device's footprint on the link's layer.
 */
function clusterCollisions(
  devices: readonly PlacedDevice[],
  links: readonly { layer: Layer; path: readonly Cell[] }[],
  project: { plot: { width: number; height: number } } & Parameters<typeof buildOccupancy>[0],
  lookup: (id: string) => Device | undefined,
): Set<string> {
  const occ = buildOccupancy(project, lookup);
  const colliding = new Set<string>();
  for (const d of devices) {
    const dev = lookup(d.device_id);
    if (!dev) continue;
    if (!fitsInPlot(dev, d, project.plot)) {
      for (const c of footprintCells(dev, d)) {
        colliding.add(`${c.x.toString()},${c.y.toString()}`);
      }
      continue;
    }
    const layers = layerOccupancyOf(dev);
    const checkSolid = layers === 'solid' || layers === 'both';
    const checkFluid = layers === 'fluid' || layers === 'both';
    for (const c of footprintCells(dev, d)) {
      const k = `${c.x.toString()},${c.y.toString()}`;
      if (checkSolid && occ.deviceSolid.has(k)) colliding.add(k);
      if (checkFluid && occ.deviceFluid.has(k)) colliding.add(k);
      if (checkSolid && occ.solid.has(k)) colliding.add(k);
      if (checkFluid && occ.fluid.has(k)) colliding.add(k);
    }
  }
  for (const l of links) {
    for (const c of l.path) {
      const k = `${c.x.toString()},${c.y.toString()}`;
      if (l.layer === 'solid' && occ.deviceSolid.has(k)) colliding.add(k);
      if (l.layer === 'fluid' && occ.deviceFluid.has(k)) colliding.add(k);
      if (l.layer === 'solid' && occ.solid.has(k)) colliding.add(k);
      if (l.layer === 'fluid' && occ.fluid.has(k)) colliding.add(k);
    }
  }
  return colliding;
}

/** P4 v7.8: convert a cursor cell to the bbox top-left so the cluster's
 *  geometric center lands roughly on the cursor. The bbox is computed over
 *  device footprints (rotated) + link path cells so a paste with detached
 *  belts still centers correctly. Floor-rounded since cells are integers —
 *  on odd-sized bboxes the cursor sits a half-cell above-left of true center,
 *  acceptable for the grid model.
 *
 *  Both `computePasteGhost` (rendering) and `pastePayloadAtCursor` (commit)
 *  must call this so the ghost preview matches what actually lands. */
function clipboardCenterAnchor(
  payload: ClipboardPayload,
  cursor: Cell,
  lookup: (id: string) => Device | undefined,
): Cell {
  let bboxW = 0;
  let bboxH = 0;
  for (const it of payload.items) {
    const dev = lookup(it.device_id);
    if (!dev) continue;
    const bbox = rotatedBoundingBox(dev, it.rotation);
    bboxW = Math.max(bboxW, it.rel_position.x + bbox.width);
    bboxH = Math.max(bboxH, it.rel_position.y + bbox.height);
  }
  for (const l of payload.links) {
    for (const c of l.rel_path) {
      bboxW = Math.max(bboxW, c.x + 1);
      bboxH = Math.max(bboxH, c.y + 1);
    }
  }
  return {
    x: cursor.x - Math.floor(bboxW / 2),
    y: cursor.y - Math.floor(bboxH / 2),
  };
}

/** P4 v7.7: paste-mode cursor-following ghost. Translates the clipboard
 *  payload's relative cells to absolute (anchor + rel) and reuses the
 *  cluster-collision check. The caller wires the ghost into MoveModeGhost
 *  for rendering and blocks the paste click when `collides`.
 *
 *  P4 v7.8: cursor anchors the cluster's CENTER, not its top-left. */
function computePasteGhost(
  payload: ClipboardPayload,
  cursor: Cell,
  project: { plot: { width: number; height: number } } & Parameters<typeof buildOccupancy>[0],
  lookup: (id: string) => Device | undefined,
): MoveGhost {
  const anchor = clipboardCenterAnchor(payload, cursor, lookup);
  const newDevices: PlacedDevice[] = payload.items.map((it, i) => ({
    instance_id: `paste-ghost-${i.toString()}`,
    device_id: it.device_id,
    position: { x: anchor.x + it.rel_position.x, y: anchor.y + it.rel_position.y },
    rotation: it.rotation,
    recipe_id: it.recipe_id,
  }));
  const newLinks = payload.links.map((l) => ({
    layer: l.layer,
    tier_id: l.tier_id,
    path: l.rel_path.map((c) => ({ x: anchor.x + c.x, y: anchor.y + c.y })),
  }));
  const colliding = clusterCollisions(newDevices, newLinks, project, lookup);
  return {
    devices: newDevices,
    links: newLinks,
    collides: colliding.size > 0,
    collidingCells: colliding,
  };
}

/** P4 v7.1: each affected belt yields ONE of three action descriptors that
 *  the caller bundles with the place_device action. */
type PlaceOnBeltAction =
  | {
      kind: 'split';
      link_id: string;
      at_cell: Cell;
      input_port_index: number;
      output_port_index: number;
    }
  | { kind: 'set_src'; link_id: string; output_port_index: number }
  | { kind: 'set_dst'; link_id: string; input_port_index: number };

/** P4 v7 place-on-belt (revised in v7.1): for each existing same-layer link
 *  whose path covers any cell of the candidate device's footprint, return
 *  the action descriptors needed to integrate the device.
 *
 *  Rules:
 *  - The device's footprint may cover AT MOST ONE cell of any single belt.
 *    ≥ 2 → 'red'.
 *  - For the overlap cell, port matching depends on whether the cell is the
 *    belt's start, end, or interior:
 *      • Interior (both prev + next): need a port that allows BELT ARRIVAL
 *        on the enter side AND a port that allows BELT EXIT on the exit
 *        side. Emit a `split`.
 *      • Start (idx === 0, no prev): need a port that allows EXIT on the
 *        belt's first-step direction. Emit a `set_src`.
 *      • End (idx === N-1, no next): need a port that allows ARRIVAL on
 *        the belt's last-step direction. Emit a `set_dst`.
 *  - Port "allows arrival": face_direction = -arrival AND constraint is one
 *    of {input, paired_opposite, bidirectional}.
 *  - Port "allows exit": face_direction = exit AND constraint is one of
 *    {output, paired_opposite, bidirectional}.
 *  - No matching port → 'red'.
 *
 *  Returns [] when the footprint touches no belts (normal placement). */
function planPlaceOnBeltSplits(
  project: ReturnType<typeof useProject>['project'],
  device: Device,
  topLeft: Cell,
  rotation: 0 | 90 | 180 | 270,
): PlaceOnBeltAction[] | 'red' {
  const placedStub = { position: topLeft, rotation };
  const footprint = footprintCells(device, placedStub);
  const footprintSet = new Set(footprint.map((c) => `${c.x.toString()},${c.y.toString()}`));
  const ports = portsInWorldFrame(device, { position: topLeft, rotation });
  const out: PlaceOnBeltAction[] = [];
  const allLinks = [...project.solid_links, ...project.fluid_links];

  const acceptsArrival = (
    p: (typeof ports)[number],
    arrival: { dx: number; dy: number },
    layer: 'solid' | 'fluid',
  ): boolean => {
    if (layer === 'solid' && p.kind !== 'solid') return false;
    if (layer === 'fluid' && p.kind !== 'fluid') return false;
    if (p.face_direction.dx !== -arrival.dx || p.face_direction.dy !== -arrival.dy) return false;
    return (
      p.direction_constraint === 'input' ||
      p.direction_constraint === 'paired_opposite' ||
      p.direction_constraint === 'bidirectional'
    );
  };
  const acceptsExit = (
    p: (typeof ports)[number],
    exit: { dx: number; dy: number },
    layer: 'solid' | 'fluid',
  ): boolean => {
    if (layer === 'solid' && p.kind !== 'solid') return false;
    if (layer === 'fluid' && p.kind !== 'fluid') return false;
    if (p.face_direction.dx !== exit.dx || p.face_direction.dy !== exit.dy) return false;
    return (
      p.direction_constraint === 'output' ||
      p.direction_constraint === 'paired_opposite' ||
      p.direction_constraint === 'bidirectional'
    );
  };

  for (const link of allLinks) {
    const linkLayer = link.layer;
    const insideIndices: number[] = [];
    for (let i = 0; i < link.path.length; i++) {
      const k = `${link.path[i]!.x.toString()},${link.path[i]!.y.toString()}`;
      if (footprintSet.has(k)) insideIndices.push(i);
    }
    if (insideIndices.length === 0) continue;
    if (insideIndices.length > 1) return 'red';
    const idx = insideIndices[0]!;
    const cell = link.path[idx]!;
    const hasPrev = idx > 0;
    const hasNext = idx < link.path.length - 1;
    const portsAtCell = ports.filter((p) => p.cell.x === cell.x && p.cell.y === cell.y);

    if (hasPrev && hasNext) {
      // Interior — split with input + output ports.
      const enterDir = signDir(cell, link.path[idx - 1]!);
      const exitDir = signDir(link.path[idx + 1]!, cell);
      const inputPort = portsAtCell.find((p) => acceptsArrival(p, enterDir, linkLayer));
      const outputPort = portsAtCell.find((p) => acceptsExit(p, exitDir, linkLayer));
      if (!inputPort || !outputPort) return 'red';
      out.push({
        kind: 'split',
        link_id: link.id,
        at_cell: cell,
        input_port_index: inputPort.port_index,
        output_port_index: outputPort.port_index,
      });
    } else if (!hasPrev && hasNext) {
      // Start of belt — only exit direction matters; retarget src.
      const exitDir = signDir(link.path[idx + 1]!, cell);
      const outputPort = portsAtCell.find((p) => acceptsExit(p, exitDir, linkLayer));
      if (!outputPort) return 'red';
      out.push({ kind: 'set_src', link_id: link.id, output_port_index: outputPort.port_index });
    } else if (hasPrev && !hasNext) {
      // End of belt — only arrival direction matters; retarget dst.
      const enterDir = signDir(cell, link.path[idx - 1]!);
      const inputPort = portsAtCell.find((p) => acceptsArrival(p, enterDir, linkLayer));
      if (!inputPort) return 'red';
      out.push({ kind: 'set_dst', link_id: link.id, input_port_index: inputPort.port_index });
    } else {
      // Single-cell belt — both endpoints at the same cell. Degenerate; skip.
      return 'red';
    }
  }
  return out;
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

/** Split `path` at every cell whose key is in `bridgeKeys`. P4 v7.1: each
 *  bridge cell is KEPT in BOTH adjacent segments — the segment ENDING at
 *  the bridge includes the bridge cell as its last point, and the segment
 *  STARTING at the bridge includes it as its first point. This makes the
 *  rendered belts visually meet the bridge instead of leaving a gap on
 *  each side (the v7 behavior owners reported as broken). */
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
      // Close out the current segment — include the bridge cell as its tail.
      current.push(c);
      const seg: PathSegment = {
        path: current,
        ...(entryFrom !== undefined ? { entryFromBridgeKey: entryFrom } : {}),
        exitToBridgeKey: k,
      };
      // Skip degenerate segments (single-cell bridge-only path with no body).
      if (current.length >= 2) segments.push(seg);
      // Start the next segment with the bridge cell as its head.
      current = [c];
      entryFrom = k;
      continue;
    }
    current.push(c);
  }
  if (current.length >= 2) {
    const seg: PathSegment = {
      path: current,
      ...(entryFrom !== undefined ? { entryFromBridgeKey: entryFrom } : {}),
    };
    segments.push(seg);
  }
  return segments;
}
