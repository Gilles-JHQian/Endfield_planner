/** LocalStorage persistence for the multi-canvas tabs manifest.
 *
 *  Mirrors local-storage.ts (single project) but stores N projects under one
 *  key plus the active id. Throttled writes; flushSave on unmount works the
 *  same way.
 *
 *  Migration: when loadTabs() finds no manifest, it falls back to the legacy
 *  single-project key so owners upgrading don't lose their canvas. The legacy
 *  key is wiped after a successful migration.
 */
import type { Project } from '@core/domain/types.ts';
import { importProject } from './json-io.ts';

const KEY = 'endfield_planner.tabs.v1';
const LEGACY_KEY = 'endfield_planner.current_project.v1';
const SAVE_THROTTLE_MS = 1000;
const SCHEMA_NAME = 'endfield-tabs';
const SCHEMA_VERSION = 1;

export interface TabEntry {
  readonly id: string;
  readonly name: string;
  readonly project: Project;
}

export interface TabsManifest {
  readonly active_id: string;
  readonly tabs: readonly TabEntry[];
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: TabsManifest | null = null;
let lastSavedAt: number | null = null;

function lsAvailable(): boolean {
  return (
    typeof localStorage !== 'undefined' &&
    typeof localStorage.getItem === 'function' &&
    typeof localStorage.setItem === 'function' &&
    typeof localStorage.removeItem === 'function'
  );
}

export function getLastTabsSavedAt(): number | null {
  return lastSavedAt;
}

function serialize(manifest: TabsManifest): string {
  const wrapper = {
    schema: SCHEMA_NAME,
    schema_version: SCHEMA_VERSION,
    active_id: manifest.active_id,
    tabs: manifest.tabs,
  };
  return JSON.stringify(wrapper);
}

export function scheduleSaveTabs(manifest: TabsManifest): void {
  if (!lsAvailable()) return;
  pending = manifest;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    if (pending) {
      try {
        localStorage.setItem(KEY, serialize(pending));
        lastSavedAt = Date.now();
      } catch {
        // Quota / disabled — silently ignore. The editor still works in-memory.
      }
    }
    saveTimer = null;
    pending = null;
  }, SAVE_THROTTLE_MS);
}

export function flushSaveTabs(): void {
  if (!lsAvailable()) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pending) {
    try {
      localStorage.setItem(KEY, serialize(pending));
      lastSavedAt = Date.now();
    } catch {
      /* see scheduleSaveTabs */
    }
    pending = null;
  }
}

/** Restore the tabs manifest. If none, fall back to migrating the legacy
 *  single-project key into a one-tab manifest. The legacy key is cleared on
 *  a successful migration so subsequent loads come straight from the new key. */
export function loadTabs(): TabsManifest | null {
  if (!lsAvailable()) return null;
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const parsed = parseManifest(raw);
    if (parsed) return parsed;
    // Bad payload — wipe so we don't loop on corrupted state.
    localStorage.removeItem(KEY);
  }
  return migrateLegacy();
}

function parseManifest(raw: string): TabsManifest | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return null;
    if (parsed.schema !== SCHEMA_NAME) return null;
    if (parsed.schema_version !== SCHEMA_VERSION) return null;
    if (typeof parsed.active_id !== 'string') return null;
    if (!Array.isArray(parsed.tabs)) return null;
    const tabs: TabEntry[] = [];
    for (const t of parsed.tabs) {
      if (!isObject(t)) return null;
      if (typeof t.id !== 'string' || typeof t.name !== 'string') return null;
      if (!isObject(t.project)) return null;
      tabs.push({ id: t.id, name: t.name, project: t.project as unknown as Project });
    }
    if (tabs.length === 0) return null;
    return { active_id: parsed.active_id, tabs };
  } catch {
    return null;
  }
}

function migrateLegacy(): TabsManifest | null {
  if (!lsAvailable()) return null;
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;
  const r = importProject(raw);
  if (!r.ok) {
    localStorage.removeItem(LEGACY_KEY);
    return null;
  }
  const project = r.value;
  const tab: TabEntry = { id: project.id, name: project.name, project };
  const manifest: TabsManifest = { active_id: project.id, tabs: [tab] };
  // Persist immediately under the new key so the next load is direct, then
  // wipe the legacy key.
  try {
    localStorage.setItem(KEY, serialize(manifest));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* migration is best-effort; in-memory result still works */
  }
  return manifest;
}

export function clearTabs(): void {
  if (!lsAvailable()) return;
  localStorage.removeItem(KEY);
  lastSavedAt = null;
}

export function clearTabsForTest(): void {
  saveTimer = null;
  pending = null;
  lastSavedAt = null;
  if (lsAvailable()) {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
