import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ClipboardThumb } from './ClipboardThumb.tsx';
import type { Device } from '@core/data-loader/types.ts';
import type { ClipboardPayload } from '@core/persistence/index.ts';

const stub: Device = {
  id: 'stub',
  display_name_zh_hans: 'stub',
  display_name_en: 'stub',
  category: 'basic_production',
  footprint: { width: 2, height: 2 },
  power_draw: 0,
  requires_power: false,
  has_fluid_interface: false,
  bandwidth: 0,
  io_ports: [],
  recipes: [],
  tech_prereq: [],
};

const fluid: Device = { ...stub, id: 'fluid', has_fluid_interface: true };

const lookup = (id: string): Device | undefined =>
  id === 'fluid' ? fluid : id === 'stub' ? stub : undefined;

const itemAt = (id: string, x: number, y: number): ClipboardPayload['items'][number] => ({
  device_id: id,
  rel_position: { x, y },
  rotation: 0,
  recipe_id: null,
});

describe('ClipboardThumb', () => {
  it('renders one rect per device and one polyline per link', () => {
    const payload: ClipboardPayload = {
      origin: { x: 0, y: 0 },
      items: [itemAt('stub', 0, 0), itemAt('fluid', 3, 0)],
      links: [
        {
          layer: 'solid',
          tier_id: 'belt-1',
          rel_path: [
            { x: 2, y: 0 },
            { x: 2, y: 1 },
          ],
        },
      ],
    };
    const { container } = render(<ClipboardThumb payload={payload} lookup={lookup} />);
    expect(container.querySelectorAll('rect')).toHaveLength(2);
    expect(container.querySelectorAll('polyline')).toHaveLength(1);
  });

  it('skips items whose device_id is missing from the catalog', () => {
    const payload: ClipboardPayload = {
      origin: { x: 0, y: 0 },
      items: [itemAt('unknown-id', 0, 0)],
      links: [],
    };
    const { container } = render(<ClipboardThumb payload={payload} lookup={lookup} />);
    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });

  it('does not render any text inside the thumb', () => {
    const payload: ClipboardPayload = {
      origin: { x: 0, y: 0 },
      items: [itemAt('stub', 0, 0)],
      links: [],
    };
    const { container } = render(<ClipboardThumb payload={payload} lookup={lookup} />);
    expect(container.querySelectorAll('text')).toHaveLength(0);
  });
});
