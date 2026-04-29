/** Project state hook with undo/redo.
 *
 *  Wraps the immutable edit functions from src/core/edits with a past/future
 *  history stack. Each successful action pushes the previous project onto
 *  `past` and clears `future`. undo/redo move project across the stacks.
 *
 *  apply() returns a Result so the caller can show error feedback when the
 *  edit was rejected (out-of-bounds, collision, etc.).
 */
import { useCallback, useMemo, useState } from 'react';
import {
  addLink,
  deleteDevice,
  deleteLink,
  moveDevice,
  moveRotateDevice,
  placeDevice,
  resizePlot,
  rotateDevice,
  setDeviceRecipe,
  setLinkEndpoint,
  splitLink,
} from '@core/edits/index.ts';
import type {
  Cell,
  EditError,
  Layer,
  PlacedDevice,
  PortRef,
  Project,
  Result,
  Rotation,
} from '@core/domain/types.ts';
import type { Device } from '@core/data-loader/types.ts';
import type { DeviceLookup } from '@core/domain/occupancy.ts';

export type ProjectAction =
  | {
      type: 'place_device';
      device: Device;
      position: Cell;
      rotation?: Rotation;
      /** P4 v6: pinning the instance_id lets the auto-bridge flow forward-
       *  reference the bridge's id from sibling actions in the same applyMany
       *  batch (e.g. `split_link.left_dst.device_instance_id`). */
      instance_id?: string;
    }
  | { type: 'move_device'; instance_id: string; position: Cell }
  | { type: 'rotate_device'; instance_id: string }
  | {
      /** P4 v7 batch-rotate-around-centroid: each affected device gets a new
       *  position AND a new rotation in one transactional step. */
      type: 'move_rotate_device';
      instance_id: string;
      position: Cell;
      rotation: Rotation;
    }
  | { type: 'delete_device'; instance_id: string }
  | { type: 'set_recipe'; instance_id: string; recipe_id: string | null }
  | {
      type: 'add_link';
      layer: Layer;
      tier_id: string;
      path: readonly Cell[];
      src?: PortRef;
      dst?: PortRef;
    }
  | { type: 'delete_link'; link_id: string }
  | {
      type: 'split_link';
      link_id: string;
      at_cell: Cell;
      left_dst: PortRef;
      right_src: PortRef;
      /** P4 v7.5: pin the right-half's id so a sibling split_link in the
       *  same applyMany batch can forward-reference it. Used when a single
       *  existing link is crossed by the new belt at multiple cells — each
       *  subsequent split operates on the previous split's right half. */
      right_id?: string;
    }
  | {
      /** P4 v7.1: retarget a link's src or dst PortRef without splitting.
       *  Used by the place-on-belt flow when the new device sits at one of
       *  the existing belt's endpoints. */
      type: 'set_link_endpoint';
      link_id: string;
      end: 'src' | 'dst';
      ref: PortRef | undefined;
    }
  | { type: 'resize_plot'; width: number; height: number }
  | { type: 'set_name'; name: string }
  | { type: 'set_region'; region_id: string };

interface History {
  past: Project[];
  present: Project;
  future: Project[];
}

const HISTORY_LIMIT = 200;

export interface ProjectStore {
  project: Project;
  canUndo: boolean;
  canRedo: boolean;
  /** Apply an action. Returns ok with the (possibly newly-created) instance
   *  id for place_device, otherwise ok({}). On failure returns an EditError. */
  apply: (action: ProjectAction) => Result<{ placed?: PlacedDevice }, EditError>;
  /** Apply a batch of actions atomically as a single history snapshot. If any
   *  action fails the whole batch is rolled back and the error is returned;
   *  on success returns the list of placed devices for any place_device
   *  actions in the batch (in order). */
  applyMany: (
    actions: readonly ProjectAction[],
  ) => Result<{ placed: readonly PlacedDevice[] }, EditError>;
  undo: () => void;
  redo: () => void;
  reset: (project: Project) => void;
}

export function useProject(initial: Project, lookup: DeviceLookup): ProjectStore {
  const [history, setHistory] = useState<History>({ past: [], present: initial, future: [] });

  const apply = useCallback(
    (action: ProjectAction): Result<{ placed?: PlacedDevice }, EditError> => {
      const current = history.present;
      const result = applyAction(current, action, lookup);
      if (!result.ok) return result;
      const { project: next, placed } = result.value;
      setHistory((h) => ({
        past: [...h.past, h.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
      }));
      return { ok: true, value: placed ? { placed } : {} };
    },
    [history.present, lookup],
  );

  const applyMany = useCallback(
    (actions: readonly ProjectAction[]): Result<{ placed: readonly PlacedDevice[] }, EditError> => {
      let current = history.present;
      const placed: PlacedDevice[] = [];
      for (const action of actions) {
        const result = applyAction(current, action, lookup);
        if (!result.ok) return result; // entire batch rolls back — current never committed
        current = result.value.project;
        if (result.value.placed) placed.push(result.value.placed);
      }
      const final = current;
      setHistory((h) => ({
        past: [...h.past, h.present].slice(-HISTORY_LIMIT),
        present: final,
        future: [],
      }));
      return { ok: true, value: { placed } };
    },
    [history.present, lookup],
  );

  const undo = useCallback((): void => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const prev = h.past[h.past.length - 1]!;
      return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
    });
  }, []);

  const redo = useCallback((): void => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0]!;
      return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
    });
  }, []);

  const reset = useCallback((project: Project): void => {
    setHistory({ past: [], present: project, future: [] });
  }, []);

  return useMemo(
    () => ({
      project: history.present,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      apply,
      applyMany,
      undo,
      redo,
      reset,
    }),
    [history, apply, applyMany, undo, redo, reset],
  );
}

function applyAction(
  project: Project,
  action: ProjectAction,
  lookup: DeviceLookup,
): Result<{ project: Project; placed?: PlacedDevice }, EditError> {
  switch (action.type) {
    case 'place_device': {
      const r = placeDevice({
        project,
        device: action.device,
        position: action.position,
        ...(action.rotation !== undefined ? { rotation: action.rotation } : {}),
        ...(action.instance_id !== undefined ? { instance_id: action.instance_id } : {}),
        lookup,
      });
      if (!r.ok) return r;
      return { ok: true, value: { project: r.value.project, placed: r.value.placed } };
    }
    case 'move_device':
      return wrap(moveDevice(project, action.instance_id, action.position, lookup));
    case 'rotate_device':
      return wrap(rotateDevice(project, action.instance_id, lookup));
    case 'move_rotate_device':
      return wrap(
        moveRotateDevice(project, action.instance_id, action.position, action.rotation, lookup),
      );
    case 'delete_device':
      return wrap(deleteDevice(project, action.instance_id));
    case 'set_recipe':
      return wrap(setDeviceRecipe(project, action.instance_id, action.recipe_id, lookup));
    case 'add_link': {
      const r = addLink({
        project,
        layer: action.layer,
        tier_id: action.tier_id,
        path: action.path,
        ...(action.src ? { src: action.src } : {}),
        ...(action.dst ? { dst: action.dst } : {}),
        lookup,
      });
      if (!r.ok) return r;
      return { ok: true, value: { project: r.value.project } };
    }
    case 'delete_link':
      return wrap(deleteLink(project, action.link_id));
    case 'split_link': {
      const r = splitLink({
        project,
        link_id: action.link_id,
        at_cell: action.at_cell,
        left_dst: action.left_dst,
        right_src: action.right_src,
        ...(action.right_id ? { ids: { right: action.right_id } } : {}),
      });
      if (!r.ok) return r;
      return { ok: true, value: { project: r.value.project } };
    }
    case 'set_link_endpoint':
      return wrap(
        setLinkEndpoint({
          project,
          link_id: action.link_id,
          end: action.end,
          ref: action.ref,
          lookup,
        }),
      );
    case 'resize_plot':
      return wrap(resizePlot(project, action.width, action.height, lookup));
    case 'set_name':
      return { ok: true, value: { project: { ...project, name: action.name } } };
    case 'set_region':
      return { ok: true, value: { project: { ...project, region_id: action.region_id } } };
  }
}

function wrap(
  r: Result<Project, EditError>,
): Result<{ project: Project; placed?: PlacedDevice }, EditError> {
  if (!r.ok) return r;
  return { ok: true, value: { project: r.value } };
}
