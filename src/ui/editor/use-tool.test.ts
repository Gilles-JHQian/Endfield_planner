import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTool } from './use-tool.ts';
import type { Device } from '@core/data-loader/types.ts';

const TEST_DEVICE: Device = {
  id: 'test-device',
  display_name_zh_hans: '测试设备',
  display_name_en: 'Test Device',
  category: 'basic_production',
  footprint: { width: 2, height: 2 },
  recipes: [],
  power_draw: 100,
  bandwidth: 0,
  requires_power: true,
  has_fluid_interface: false,
  io_ports: [],
  tech_prereq: [],
};

function dispatchKey(key: string, modifiers: { shiftKey?: boolean; ctrlKey?: boolean } = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ...modifiers }));
}

describe('useTool', () => {
  it('starts in select mode', () => {
    const { result } = renderHook(() => useTool());
    expect(result.current.tool.kind).toBe('select');
  });

  it('V/B/P/X switch tools and Esc returns to select', () => {
    const { result } = renderHook(() => useTool());

    act(() => dispatchKey('B'));
    expect(result.current.tool.kind).toBe('belt');

    act(() => dispatchKey('P'));
    expect(result.current.tool.kind).toBe('pipe');

    act(() => dispatchKey('X'));
    expect(result.current.tool.kind).toBe('box-select');

    act(() => dispatchKey('Escape'));
    expect(result.current.tool.kind).toBe('select');

    act(() => dispatchKey('B'));
    act(() => dispatchKey('V'));
    expect(result.current.tool.kind).toBe('select');
  });

  it('Q is an alias for pipe and E is an alias for belt', () => {
    const { result } = renderHook(() => useTool());

    act(() => dispatchKey('Q'));
    expect(result.current.tool.kind).toBe('pipe');

    act(() => dispatchKey('E'));
    expect(result.current.tool.kind).toBe('belt');

    act(() => dispatchKey('q'));
    expect(result.current.tool.kind).toBe('pipe');

    act(() => dispatchKey('e'));
    expect(result.current.tool.kind).toBe('belt');
  });

  it('R rotates the place ghost 90° at a time, no-op for other tools', () => {
    const { result } = renderHook(() => useTool());

    act(() => result.current.setPlace(TEST_DEVICE));
    expect(result.current.tool).toMatchObject({ kind: 'place', rotation: 0 });

    act(() => dispatchKey('R'));
    expect(result.current.tool).toMatchObject({ kind: 'place', rotation: 90 });

    act(() => dispatchKey('R'));
    act(() => dispatchKey('R'));
    act(() => dispatchKey('R'));
    expect(result.current.tool).toMatchObject({ kind: 'place', rotation: 0 });

    act(() => result.current.setBelt());
    act(() => dispatchKey('R'));
    expect(result.current.tool.kind).toBe('belt');
  });

  it('keyboard shortcuts are ignored while typing in inputs', () => {
    const { result } = renderHook(() => useTool());
    const input = document.createElement('input');
    document.body.appendChild(input);
    try {
      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', bubbles: true }));
      });
      expect(result.current.tool.kind).toBe('select');
    } finally {
      input.remove();
    }
  });

  it('Ctrl+R does not rotate (reserved for browser refresh)', () => {
    const { result } = renderHook(() => useTool());
    act(() => result.current.setPlace(TEST_DEVICE));

    act(() => dispatchKey('R', { ctrlKey: true }));
    expect(result.current.tool).toMatchObject({ kind: 'place', rotation: 0 });
  });
});
