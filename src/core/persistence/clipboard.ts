/** In-memory clipboard for box-select copy/paste, mirrored to localStorage
 *  so a refresh doesn't lose the most-recent group.
 *
 *  P4 v7 extends the payload to include LINKS in addition to PlacedDevices.
 *  Links are included only when both `src.device_instance_id` and
 *  `dst.device_instance_id` reference devices in the selection (otherwise
 *  the link would dangle on paste). PortRefs are remapped to the SELECTION-
 *  RELATIVE device index so paste can re-resolve them against the freshly-
 *  generated paste-time instance ids.
 *
 *  Also adds a separate in-memory history (last 10 payloads) for the
 *  Library "clipboard" pseudo-tab. Single-slot localStorage persistence
 *  remains for refresh recovery; history is memory-only.
 */
import type { Cell, Layer, PlacedDevice, Rotation } from '@core/domain/types.ts';

const STORAGE_KEY = 'endfield_planner.clipboard.v1';
const HISTORY_LIMIT = 10;

export interface ClipboardItem {
  readonly device_id: string;
  readonly rel_position: Cell; // offset from the bounding-box top-left
  readonly rotation: Rotation;
  readonly recipe_id: string | null;
}

export interface ClipboardLink {
  readonly layer: Layer;
  readonly tier_id: string;
  /** Path cells normalized to the bounding-box origin (same convention as
   *  device `rel_position`). Paste re-resolves to absolute cells = origin
   *  cursor + rel cell. */
  readonly rel_path: readonly Cell[];
  /** Index into ClipboardPayload.items pointing at the source device's
   *  selection-relative position (i.e. the device that ENDS UP at items[N]
   *  on paste). */
  readonly src_item_index: number;
  readonly src_port_index: number;
  readonly dst_item_index: number;
  readonly dst_port_index: number;
}

export interface ClipboardPayload {
  /** Bounding-box origin in the project the items were copied from — kept
   *  for diagnostic purposes; paste recomputes against the target cursor. */
  readonly origin: Cell;
  readonly items: readonly ClipboardItem[];
  /** Links (P4 v7). Empty array when no links span the selection. */
  readonly links: readonly ClipboardLink[];
}

let slot: ClipboardPayload | null = null;
let history: ClipboardPayload[] = [];

/** Build a ClipboardPayload from a set of placed devices and the project's
 *  links. Links are included only when both endpoints reference devices in
 *  the `devices` set; PortRefs are remapped to selection-relative indices.
 *  The bounding-box origin spans all device positions AND link path cells
 *  so paste preserves the visual layout including belt routes. */
export function buildPayload(
  devices: readonly PlacedDevice[],
  links?: readonly { layer: Layer; tier_id: string; path: readonly Cell[]; src?: { device_instance_id: string; port_index: number }; dst?: { device_instance_id: string; port_index: number } }[],
): ClipboardPayload | null {
  if (devices.length === 0) return null;
  const idToIndex = new Map<string, number>();
  devices.forEach((d, i) => idToIndex.set(d.instance_id, i));
  // Filter links: keep only those with both endpoints in the selection.
  const includedLinks = (links ?? []).filter(
    (l) =>
      l.src !== undefined &&
      l.dst !== undefined &&
      idToIndex.has(l.src.device_instance_id) &&
      idToIndex.has(l.dst.device_instance_id),
  );
  // Bounding box spans device positions AND link path cells so paste lands
  // the entire visual group at the cursor.
  let minX = Infinity;
  let minY = Infinity;
  for (const d of devices) {
    if (d.position.x < minX) minX = d.position.x;
    if (d.position.y < minY) minY = d.position.y;
  }
  for (const l of includedLinks) {
    for (const c of l.path) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
    }
  }
  const origin: Cell = { x: minX, y: minY };
  const items: ClipboardItem[] = devices.map((d) => ({
    device_id: d.device_id,
    rel_position: { x: d.position.x - minX, y: d.position.y - minY },
    rotation: d.rotation,
    recipe_id: d.recipe_id,
  }));
  const linkPayload: ClipboardLink[] = includedLinks.map((l) => ({
    layer: l.layer,
    tier_id: l.tier_id,
    rel_path: l.path.map((c) => ({ x: c.x - minX, y: c.y - minY })),
    src_item_index: idToIndex.get(l.src!.device_instance_id)!,
    src_port_index: l.src!.port_index,
    dst_item_index: idToIndex.get(l.dst!.device_instance_id)!,
    dst_port_index: l.dst!.port_index,
  }));
  return { origin, items, links: linkPayload };
}

/** Persist `payload` to the in-memory slot, push it onto the history (P4 v7
 *  — most-recent first, max 10 entries), and mirror to localStorage so a
 *  refresh recovers the latest. */
export function copyToClipboard(payload: ClipboardPayload): void {
  slot = payload;
  history = [payload, ...history].slice(0, HISTORY_LIMIT);
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
    // Tolerate v6 payloads (no `links` field); coerce to empty array.
    const normalized: ClipboardPayload = {
      origin: parsed.origin,
      items: parsed.items,
      links: parsed.links ?? [],
    };
    slot = normalized;
    return slot;
  } catch {
    return null;
  }
}

/** P4 v7: rolling history of recent copies, most-recent first. Memory-only
 *  (the localStorage slot still tracks just the latest for refresh
 *  recovery). The Library "clipboard" pseudo-tab reads this. */
export function readClipboardHistory(): readonly ClipboardPayload[] {
  return history;
}

/** Move a history entry to the front (so picking it from the Library tab
 *  also makes it the active Ctrl+V target). */
export function promoteToTopOfHistory(payload: ClipboardPayload): void {
  history = [payload, ...history.filter((p) => p !== payload)].slice(0, HISTORY_LIMIT);
  slot = payload;
}

/** Reset the clipboard. Used by tests. */
export function clearClipboardForTest(): void {
  slot = null;
  history = [];
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}
