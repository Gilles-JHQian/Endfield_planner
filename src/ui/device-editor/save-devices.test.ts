import { describe, expect, it } from 'vitest';
import { mergeEdited } from './save-devices.ts';
import type { Device } from '@core/data-loader/types.ts';

const base: Device = {
  id: 'a',
  display_name_zh_hans: 'A',
  footprint: { width: 1, height: 1 },
  bandwidth: 0,
  power_draw: 0,
  requires_power: false,
  has_fluid_interface: false,
  io_ports: [],
  tech_prereq: [],
  category: 'basic_production',
  recipes: [],
};

describe('mergeEdited', () => {
  it('replaces the device with matching id', () => {
    const all = [base, { ...base, id: 'b' }];
    const edited = { ...base, power_draw: 99 };
    const merged = mergeEdited(all, edited);
    expect(merged.find((d) => d.id === 'a')?.power_draw).toBe(99);
    expect(merged.find((d) => d.id === 'b')?.power_draw).toBe(0);
    expect(merged).toHaveLength(2);
  });

  it('appends when the id is new', () => {
    const all = [base];
    const fresh = { ...base, id: 'new-device' };
    const merged = mergeEdited(all, fresh);
    expect(merged.map((d) => d.id)).toEqual(['a', 'new-device']);
  });

  it('does not mutate the input array', () => {
    const all = [base];
    mergeEdited(all, { ...base, power_draw: 100 });
    expect(all[0]!.power_draw).toBe(0);
  });
});
