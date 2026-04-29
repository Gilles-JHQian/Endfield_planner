import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCanvases } from './use-canvases.ts';
import { createProject } from '@core/domain/project.ts';
import type { Region } from '@core/data-loader/types.ts';
import type { TabsManifest } from '@core/persistence/index.ts';

const REGION: Region = {
  id: 'r',
  display_name_zh_hans: 'R',
  plot_default_size: { width: 10, height: 10 },
  core_position: { x: 0, y: 0 },
  sub_core_positions: [],
  available_tech_tiers: [],
  mining_nodes: [],
};

function blankFactory() {
  return createProject({ region: REGION, data_version: 'test' });
}

function singleTabManifest(): TabsManifest {
  const p = createProject({ region: REGION, data_version: 'test' });
  return { active_id: p.id, tabs: [{ id: p.id, name: p.name, project: p }] };
}

function setup(initial?: TabsManifest) {
  const manifest = initial ?? singleTabManifest();
  const lookup = (): undefined => undefined;
  return renderHook(() =>
    useCanvases({ initialManifest: manifest, lookup, makeBlank: blankFactory }),
  );
}

describe('useCanvases', () => {
  it('exposes the active project from the initial manifest', () => {
    const { result } = setup();
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0]!.active).toBe(true);
    expect(result.current.canUndo).toBe(false);
  });

  it('newCanvas adds a tab and switches to it', () => {
    const { result } = setup();
    let newId = '';
    act(() => {
      newId = result.current.newCanvas();
    });
    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.activeId).toBe(newId);
    expect(result.current.tabs.find((t) => t.id === newId)?.active).toBe(true);
  });

  it('setActive switches the active tab without losing history of either', () => {
    const { result } = setup();
    const firstId = result.current.activeId;
    act(() => {
      result.current.newCanvas();
    });
    const secondId = result.current.activeId;
    act(() => {
      result.current.setActive(firstId);
    });
    expect(result.current.activeId).toBe(firstId);
    act(() => {
      result.current.setActive(secondId);
    });
    expect(result.current.activeId).toBe(secondId);
  });

  it('apply lands on the active canvas only — undo on tab A does not affect tab B', () => {
    const { result } = setup();
    const a = result.current.activeId;
    act(() => {
      result.current.apply({ type: 'set_name', name: 'A renamed' });
    });
    expect(result.current.project.name).toBe('A renamed');
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.newCanvas();
    });
    // Brand-new tab — its history is empty.
    expect(result.current.canUndo).toBe(false);
    expect(result.current.project.name).not.toBe('A renamed');

    // Switch back to A and verify the rename + history are preserved.
    act(() => {
      result.current.setActive(a);
    });
    expect(result.current.project.name).toBe('A renamed');
    expect(result.current.canUndo).toBe(true);
    act(() => {
      result.current.undo();
    });
    expect(result.current.project.name).not.toBe('A renamed');
  });

  it('closeCanvas drops the tab and promotes a neighbor as active', () => {
    const { result } = setup();
    const a = result.current.activeId;
    act(() => {
      result.current.newCanvas();
    });
    const b = result.current.activeId;
    act(() => {
      result.current.closeCanvas(b);
    });
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeId).toBe(a);
  });

  it('closing the last tab auto-creates a fresh blank one', () => {
    const { result } = setup();
    const original = result.current.activeId;
    act(() => {
      result.current.closeCanvas(original);
    });
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeId).not.toBe(original);
  });

  it('manifest reflects current entries and active id', () => {
    const { result } = setup();
    act(() => {
      result.current.newCanvas();
    });
    const m = result.current.manifest;
    expect(m.tabs).toHaveLength(2);
    expect(m.active_id).toBe(result.current.activeId);
  });
});
