import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDeviceDraft } from './use-device-draft.ts';
import type { Device } from '@core/data-loader/types.ts';

const seed: Device = {
  id: 'a',
  display_name_zh_hans: 'A',
  footprint: { width: 2, height: 2 },
  bandwidth: 0,
  power_draw: 0,
  requires_power: false,
  has_fluid_interface: false,
  io_ports: [],
  tech_prereq: [],
  category: 'basic_production',
  recipes: [],
};

describe('useDeviceDraft', () => {
  it('starts empty and dirty=false until a device is loaded', () => {
    const { result } = renderHook(() => useDeviceDraft());
    expect(result.current.draft).toBeNull();
    expect(result.current.dirty).toBe(false);
  });

  it('load sets the draft and stays clean', () => {
    const { result } = renderHook(() => useDeviceDraft());
    act(() => result.current.load(seed));
    expect(result.current.draft?.id).toBe('a');
    expect(result.current.dirty).toBe(false);
  });

  it('setField mutates the draft and flips dirty', () => {
    const { result } = renderHook(() => useDeviceDraft());
    act(() => result.current.load(seed));
    act(() => result.current.setField('power_draw', 50));
    expect(result.current.draft?.power_draw).toBe(50);
    expect(result.current.dirty).toBe(true);
  });

  it('reset goes back to the original device, dirty=false', () => {
    const { result } = renderHook(() => useDeviceDraft());
    act(() => result.current.load(seed));
    act(() => result.current.setField('power_draw', 50));
    act(() => result.current.reset());
    expect(result.current.draft?.power_draw).toBe(0);
    expect(result.current.dirty).toBe(false);
  });

  it('addPort/removePort/updatePort go through draft state', () => {
    const { result } = renderHook(() => useDeviceDraft());
    act(() => result.current.load(seed));
    act(() =>
      result.current.addPort({
        side: 'N',
        offset: 0,
        kind: 'solid',
        direction_constraint: 'input',
      }),
    );
    expect(result.current.draft?.io_ports).toHaveLength(1);
    act(() => result.current.updatePort(0, { kind: 'fluid' }));
    expect(result.current.draft?.io_ports[0]?.kind).toBe('fluid');
    act(() => result.current.removePort(0));
    expect(result.current.draft?.io_ports).toHaveLength(0);
  });
});
