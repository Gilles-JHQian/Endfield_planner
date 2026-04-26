/** LocalStorage persistence for the active project.
 *
 *  REQUIREMENT.md F4 / plan: a single auto-saved project; owners reload the
 *  app and pick up where they left off. We throttle writes so a flurry of
 *  edits doesn't pound localStorage every keystroke.
 *
 *  Storage key is namespaced and versioned so a future schema change can
 *  decide whether to migrate or wipe. The serialized JSON is the same
 *  format exportProject produces — see json-io.ts.
 */
import type { Project } from '@core/domain/types.ts';
import { exportProject, importProject } from './json-io.ts';

const KEY = 'endfield_planner.current_project.v1';
const SAVE_THROTTLE_MS = 1000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: Project | null = null;

/** Schedule a write of `project` to localStorage. Coalesces calls within
 *  SAVE_THROTTLE_MS — only the latest project state actually lands on disk. */
export function scheduleSave(project: Project): void {
  if (typeof localStorage === 'undefined') return;
  pending = project;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    if (pending) {
      try {
        localStorage.setItem(KEY, exportProject(pending));
      } catch {
        // Storage quota / disabled / SecurityError — silently ignore for now;
        // the editor still works in-memory.
      }
    }
    saveTimer = null;
    pending = null;
  }, SAVE_THROTTLE_MS);
}

/** Force-flush any pending save synchronously. Useful before a navigation. */
export function flushSave(): void {
  if (typeof localStorage === 'undefined') return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pending) {
    try {
      localStorage.setItem(KEY, exportProject(pending));
    } catch {
      /* see scheduleSave */
    }
    pending = null;
  }
}

/** Restore a previously-saved project, or null if none / invalid. */
export function loadCurrent(): Project | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  const result = importProject(raw);
  return result.ok ? result.value : null;
}

/** Wipe the saved project (used by File → New). */
export function clearCurrent(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(KEY);
}
