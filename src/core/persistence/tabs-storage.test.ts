// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearTabs,
  clearTabsForTest,
  flushSaveTabs,
  loadTabs,
  scheduleSaveTabs,
  type TabsManifest,
} from './tabs-storage.ts';
import { createProject } from '@core/domain/project.ts';
import { exportProject } from './json-io.ts';
import type { Region } from '@core/data-loader/types.ts';

const REGION: Region = {
  id: 'r',
  display_name_zh_hans: 'R',
  plot_default_size: { width: 10, height: 10 },
  core_position: { x: 0, y: 0 },
  sub_core_positions: [],
  available_tech_tiers: [],
  mining_nodes: [],
};

function makeManifest(): TabsManifest {
  const a = createProject({ region: REGION, data_version: 'test' });
  const b = createProject({ region: REGION, data_version: 'test' });
  return {
    active_id: a.id,
    tabs: [
      { id: a.id, name: 'A', project: a },
      { id: b.id, name: 'B', project: b },
    ],
  };
}

describe('tabs-storage', () => {
  beforeEach(() => clearTabsForTest());
  afterEach(() => clearTabsForTest());

  it('round-trips a manifest through localStorage', () => {
    const m = makeManifest();
    scheduleSaveTabs(m);
    flushSaveTabs();
    const loaded = loadTabs();
    expect(loaded).not.toBeNull();
    expect(loaded?.active_id).toBe(m.active_id);
    expect(loaded?.tabs).toHaveLength(2);
    expect(loaded?.tabs[0]!.name).toBe('A');
    expect(loaded?.tabs[1]!.project.id).toBe(m.tabs[1]!.project.id);
  });

  it('returns null when nothing has ever been saved', () => {
    expect(loadTabs()).toBeNull();
  });

  it('migrates a legacy single-project key into a one-tab manifest', () => {
    const legacy = createProject({ region: REGION, data_version: 'test' });
    localStorage.setItem('endfield_planner.current_project.v1', exportProject(legacy));
    const loaded = loadTabs();
    expect(loaded).not.toBeNull();
    expect(loaded?.tabs).toHaveLength(1);
    expect(loaded?.active_id).toBe(legacy.id);
    expect(loaded?.tabs[0]!.name).toBe(legacy.name);
    // Legacy key wiped after a successful migration.
    expect(localStorage.getItem('endfield_planner.current_project.v1')).toBeNull();
    // Subsequent load reads from the new key directly.
    const again = loadTabs();
    expect(again?.tabs).toHaveLength(1);
  });

  it('clearTabs wipes the manifest', () => {
    scheduleSaveTabs(makeManifest());
    flushSaveTabs();
    expect(loadTabs()).not.toBeNull();
    clearTabs();
    expect(loadTabs()).toBeNull();
  });

  it('rejects a corrupted manifest and falls back to legacy migration', () => {
    localStorage.setItem('endfield_planner.tabs.v1', '{not json');
    const legacy = createProject({ region: REGION, data_version: 'test' });
    localStorage.setItem('endfield_planner.current_project.v1', exportProject(legacy));
    const loaded = loadTabs();
    // Bad new-key payload was wiped, then legacy migrated through.
    expect(loaded?.tabs).toHaveLength(1);
    expect(loaded?.active_id).toBe(legacy.id);
  });
});
