/** Multi-canvas project state. Wraps N independent histories with the same
 *  ProjectStore-shaped surface for the active canvas, plus tab-management
 *  helpers (new / close / setActive). Each canvas has its own undo / redo
 *  stack capped at HISTORY_LIMIT.
 *
 *  Tab labels are derived from the active project's `name` field — renaming
 *  via the existing `set_name` action lands on both the tab strip and the
 *  project's exported JSON. Closing the last tab auto-creates a fresh blank
 *  one so the editor never has zero canvases.
 */
import { useCallback, useMemo, useState } from 'react';
import { applyAction, type ProjectAction } from './use-project.ts';
import type {
  EditError,
  PlacedDevice,
  Project,
  Result,
} from '@core/domain/types.ts';
import type { DeviceLookup } from '@core/domain/occupancy.ts';
import type { TabsManifest } from '@core/persistence/index.ts';

const HISTORY_LIMIT = 200;

interface CanvasHistory {
  past: Project[];
  present: Project;
  future: Project[];
}

interface CanvasEntry {
  id: string;
  history: CanvasHistory;
}

interface CanvasesState {
  entries: CanvasEntry[];
  activeId: string;
}

export interface CanvasTabSummary {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

export interface CanvasesStore {
  // Active canvas — mirrors ProjectStore so existing callers don't change.
  project: Project;
  canUndo: boolean;
  canRedo: boolean;
  apply: (action: ProjectAction) => Result<{ placed?: PlacedDevice }, EditError>;
  applyMany: (
    actions: readonly ProjectAction[],
  ) => Result<{ placed: readonly PlacedDevice[] }, EditError>;
  undo: () => void;
  redo: () => void;
  reset: (project: Project) => void;

  // Tab management.
  tabs: readonly CanvasTabSummary[];
  activeId: string;
  /** Add a fresh canvas and switch to it. Returns the new canvas id.
   *  Optional `initialName` overrides the default name from `makeBlank`. The
   *  override is applied atomically before the entry lands so callers don't
   *  need a follow-up `apply({ type: 'set_name' })` (that path captures the
   *  previously-active canvas's history and corrupts the new tab). */
  newCanvas: (initialName?: string) => string;
  closeCanvas: (id: string) => void;
  setActive: (id: string) => void;

  /** Snapshot of the tabs manifest for persistence. Throttled writes consume
   *  this value via scheduleSaveTabs. */
  manifest: TabsManifest;
}

export interface UseCanvasesOpts {
  initialManifest: TabsManifest;
  lookup: DeviceLookup;
  /** Factory for a fresh project — invoked on `newCanvas` and on the
   *  auto-recreate-when-closing-the-last-tab path. */
  makeBlank: () => Project;
}

export function useCanvases(opts: UseCanvasesOpts): CanvasesStore {
  const { lookup, makeBlank } = opts;
  const [state, setState] = useState<CanvasesState>(() => manifestToState(opts.initialManifest));

  const active = state.entries.find((e) => e.id === state.activeId) ?? state.entries[0]!;

  const apply = useCallback(
    (action: ProjectAction): Result<{ placed?: PlacedDevice }, EditError> => {
      const current = active.history.present;
      const result = applyAction(current, action, lookup);
      if (!result.ok) return result;
      const next = result.value.project;
      setState((s) => updateActive(s, (h) => pushHistory(h, next)));
      return { ok: true, value: result.value.placed ? { placed: result.value.placed } : {} };
    },
    [active, lookup],
  );

  const applyMany = useCallback(
    (
      actions: readonly ProjectAction[],
    ): Result<{ placed: readonly PlacedDevice[] }, EditError> => {
      let current = active.history.present;
      const placed: PlacedDevice[] = [];
      for (const action of actions) {
        const r = applyAction(current, action, lookup);
        if (!r.ok) return r; // entire batch rolls back
        current = r.value.project;
        if (r.value.placed) placed.push(r.value.placed);
      }
      const final = current;
      setState((s) => updateActive(s, (h) => pushHistory(h, final)));
      return { ok: true, value: { placed } };
    },
    [active, lookup],
  );

  const undo = useCallback((): void => {
    setState((s) =>
      updateActive(s, (h) => {
        if (h.past.length === 0) return h;
        const prev = h.past[h.past.length - 1]!;
        return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
      }),
    );
  }, []);

  const redo = useCallback((): void => {
    setState((s) =>
      updateActive(s, (h) => {
        if (h.future.length === 0) return h;
        const next = h.future[0]!;
        return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
      }),
    );
  }, []);

  const reset = useCallback((project: Project): void => {
    setState((s) => updateActive(s, () => ({ past: [], present: project, future: [] })));
  }, []);

  const newCanvas = useCallback(
    (initialName?: string): string => {
      const blank = makeBlank();
      const project = initialName ? { ...blank, name: initialName } : blank;
      const entry: CanvasEntry = {
        id: project.id,
        history: { past: [], present: project, future: [] },
      };
      setState((s) => ({ entries: [...s.entries, entry], activeId: project.id }));
      return project.id;
    },
    [makeBlank],
  );

  const closeCanvas = useCallback(
    (id: string): void => {
      setState((s) => {
        const idx = s.entries.findIndex((e) => e.id === id);
        if (idx === -1) return s;
        const remaining = s.entries.filter((e) => e.id !== id);
        if (remaining.length === 0) {
          // Auto-create a blank tab so the editor never has zero canvases.
          const blank = makeBlank();
          const fresh: CanvasEntry = {
            id: blank.id,
            history: { past: [], present: blank, future: [] },
          };
          return { entries: [fresh], activeId: blank.id };
        }
        let activeId = s.activeId;
        if (activeId === id) {
          // Promote a neighbor: the next tab if there is one, else the previous.
          const neighbor = remaining[Math.min(idx, remaining.length - 1)]!;
          activeId = neighbor.id;
        }
        return { entries: remaining, activeId };
      });
    },
    [makeBlank],
  );

  const setActive = useCallback((id: string): void => {
    setState((s) => (s.entries.some((e) => e.id === id) ? { ...s, activeId: id } : s));
  }, []);

  const tabs = useMemo(
    (): readonly CanvasTabSummary[] =>
      state.entries.map((e) => ({
        id: e.id,
        name: e.history.present.name,
        active: e.id === state.activeId,
      })),
    [state],
  );

  const manifest = useMemo(
    (): TabsManifest => ({
      active_id: state.activeId,
      tabs: state.entries.map((e) => ({
        id: e.id,
        name: e.history.present.name,
        project: e.history.present,
      })),
    }),
    [state],
  );

  return useMemo(
    () => ({
      project: active.history.present,
      canUndo: active.history.past.length > 0,
      canRedo: active.history.future.length > 0,
      apply,
      applyMany,
      undo,
      redo,
      reset,
      tabs,
      activeId: state.activeId,
      newCanvas,
      closeCanvas,
      setActive,
      manifest,
    }),
    [
      active,
      apply,
      applyMany,
      undo,
      redo,
      reset,
      tabs,
      state.activeId,
      newCanvas,
      closeCanvas,
      setActive,
      manifest,
    ],
  );
}

function manifestToState(m: TabsManifest): CanvasesState {
  const entries: CanvasEntry[] = m.tabs.map((t) => ({
    id: t.id,
    history: { past: [], present: t.project, future: [] },
  }));
  // Active id falls back to the first tab if the manifest's stored id is stale.
  const activeId = entries.some((e) => e.id === m.active_id)
    ? m.active_id
    : (entries[0]?.id ?? m.active_id);
  return { entries, activeId };
}

function pushHistory(h: CanvasHistory, next: Project): CanvasHistory {
  return {
    past: [...h.past, h.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

function updateActive(s: CanvasesState, fn: (h: CanvasHistory) => CanvasHistory): CanvasesState {
  return {
    ...s,
    entries: s.entries.map((e) => (e.id === s.activeId ? { ...e, history: fn(e.history) } : e)),
  };
}
