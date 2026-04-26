/** In-memory clipboard for box-select copy/paste, mirrored to localStorage
 *  so a refresh doesn't lose the most-recent group.
 *
 *  Scope: only PlacedDevice records (positions normalized to the selection
 *  bounding-box origin so paste lands at the cursor with the same internal
 *  layout). Links are NOT copied in this round — they cascade through device
 *  identity which would require renumbering both endpoints across the paste.
 *  Links can be redrawn after paste with the multi-segment drafter (B12).
 */
import type { Cell, PlacedDevice, Rotation } from '@core/domain/types.ts';

const STORAGE_KEY = 'endfield_planner.clipboard.v1';

export interface ClipboardItem {
  readonly device_id: string;
  readonly rel_position: Cell; // offset from the bounding-box top-left
  readonly rotation: Rotation;
  readonly recipe_id: string | null;
}

export interface ClipboardPayload {
  /** Bounding-box origin in the project the items were copied from — kept
   *  for diagnostic purposes; paste recomputes against the target cursor. */
  readonly origin: Cell;
  readonly items: readonly ClipboardItem[];
}

let slot: ClipboardPayload | null = null;

/** Build a ClipboardPayload from a set of placed devices. The bounding box
 *  is the min/max over each device's position field (footprint-relative
 *  bounds aren't needed because paste places by position, not footprint). */
export function buildPayload(devices: readonly PlacedDevice[]): ClipboardPayload | null {
  if (devices.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  for (const d of devices) {
    if (d.position.x < minX) minX = d.position.x;
    if (d.position.y < minY) minY = d.position.y;
  }
  const origin: Cell = { x: minX, y: minY };
  const items: ClipboardItem[] = devices.map((d) => ({
    device_id: d.device_id,
    rel_position: { x: d.position.x - minX, y: d.position.y - minY },
    rotation: d.rotation,
    recipe_id: d.recipe_id,
  }));
  return { origin, items };
}

/** Persist `payload` to the in-memory slot and to localStorage. */
export function copyToClipboard(payload: ClipboardPayload): void {
  slot = payload;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota / disabled — silently ignore. The in-memory slot still works.
  }
}

/** Return the most-recent clipboard payload. Restores from localStorage if
 *  the in-memory slot is empty (e.g. on page reload). */
export function readClipboard(): ClipboardPayload | null {
  if (slot) return slot;
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ClipboardPayload;
    slot = parsed;
    return slot;
  } catch {
    return null;
  }
}

/** Reset the clipboard. Used by tests. */
export function clearClipboardForTest(): void {
  slot = null;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}
