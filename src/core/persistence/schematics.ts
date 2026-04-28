/** Session-only schematic library — named ClipboardPayloads the owner can
 *  re-paste during the same session. Mirrors the clipboard.ts module-state
 *  pattern but does NOT persist to localStorage; the requirement (REQUIREMENT.md
 *  §5.4 follow-up) explicitly defers durable storage to a future DB phase.
 *
 *  Read flow:
 *  - UI components subscribe via a tick state in EditorPage (same convention
 *    as the clipboard tab) and call readSchematics() on each tick bump.
 *  - Newest entries are at index 0.
 */
import type { ClipboardPayload } from './clipboard.ts';

export interface Schematic {
  readonly id: string;
  readonly name: string;
  readonly saved_at: number;
  readonly payload: ClipboardPayload;
}

let store: Schematic[] = [];

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function saveSchematic(name: string, payload: ClipboardPayload): Schematic {
  const entry: Schematic = {
    id: generateId(),
    name,
    saved_at: Date.now(),
    payload,
  };
  store = [entry, ...store];
  return entry;
}

export function readSchematics(): readonly Schematic[] {
  return store;
}

export function removeSchematic(id: string): void {
  store = store.filter((s) => s.id !== id);
}

/** Validate a parsed JSON value against the ClipboardPayload shape and push
 *  it onto the session store. Throws on shape mismatch — caller surfaces the
 *  message via window.alert. */
export function importSchematicJson(json: unknown, fallbackName: string): Schematic {
  const payload = coerceSchematicPayload(json);
  const name =
    typeof (json as { name?: unknown }).name === 'string' &&
    (json as { name: string }).name.trim().length > 0
      ? (json as { name: string }).name
      : fallbackName;
  return saveSchematic(name, payload);
}

function coerceSchematicPayload(json: unknown): ClipboardPayload {
  // The on-disk format may be either a bare ClipboardPayload or a wrapped
  // { name, payload } object — accept both so future Export round-trips work.
  const candidate =
    isObject(json) && 'payload' in json && isObject((json as { payload: unknown }).payload)
      ? (json as { payload: unknown }).payload
      : json;
  if (!isObject(candidate)) {
    throw new Error('Schematic JSON is not an object.');
  }
  const origin = (candidate as { origin?: unknown }).origin;
  const items = (candidate as { items?: unknown }).items;
  const links = (candidate as { links?: unknown }).links ?? [];
  if (!isCell(origin)) {
    throw new Error('Schematic JSON missing or invalid `origin` (expected {x, y}).');
  }
  if (!Array.isArray(items)) {
    throw new Error('Schematic JSON missing or invalid `items` array.');
  }
  if (!Array.isArray(links)) {
    throw new Error('Schematic JSON `links` must be an array if present.');
  }
  return { origin, items, links } as ClipboardPayload;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isCell(v: unknown): v is { x: number; y: number } {
  return isObject(v) && typeof v.x === 'number' && typeof v.y === 'number';
}

/** Reset for tests. */
export function clearSchematicsForTest(): void {
  store = [];
}
