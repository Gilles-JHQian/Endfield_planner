import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@i18n/index.tsx';
import { RecipeSelector } from './RecipeSelector.tsx';
import type { Device, Recipe } from '@core/data-loader/types.ts';

const DEVICE: Device = {
  id: 'furnace-1',
  display_name_zh_hans: '冶炼炉',
  display_name_en: 'Furnace',
  category: 'basic_production',
  footprint: { width: 2, height: 2 },
  recipes: ['recipe-iron', 'recipe-copper'],
  power_draw: 100,
  bandwidth: 0,
  requires_power: true,
  has_fluid_interface: false,
  io_ports: [],
  tech_prereq: [],
};

const RECIPES: Recipe[] = [
  {
    id: 'recipe-iron',
    display_name_zh_hans: '炼铁',
    cycle_seconds: 4,
    inputs: [{ item_id: 'iron-ore', qty_per_cycle: 1 }],
    outputs: [{ item_id: 'iron-ingot', qty_per_cycle: 1 }],
    compatible_devices: ['furnace-1'],
  },
  {
    id: 'recipe-copper',
    display_name_zh_hans: '炼铜',
    cycle_seconds: 4,
    inputs: [{ item_id: 'copper-ore', qty_per_cycle: 1 }],
    outputs: [{ item_id: 'copper-ingot', qty_per_cycle: 1 }],
    compatible_devices: ['furnace-1'],
  },
  {
    id: 'recipe-other',
    display_name_zh_hans: '不相关配方',
    cycle_seconds: 2,
    inputs: [],
    outputs: [],
    compatible_devices: ['somewhere-else'],
  },
];

function renderSelector(currentRecipeId: string | null, onChange = vi.fn()) {
  const utils = render(
    <I18nProvider>
      <RecipeSelector
        device={DEVICE}
        recipes={RECIPES}
        currentRecipeId={currentRecipeId}
        onChange={onChange}
      />
    </I18nProvider>,
  );
  return { ...utils, onChange };
}

describe('RecipeSelector', () => {
  it('lists only candidates that the device whitelist allows', () => {
    renderSelector(null);
    const select: HTMLSelectElement = screen.getByRole('combobox');
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels.some((l) => l?.includes('炼铁'))).toBe(true);
    expect(labels.some((l) => l?.includes('炼铜'))).toBe(true);
    expect(labels.some((l) => l?.includes('不相关配方'))).toBe(false);
  });

  it('shows the input/output pills when a recipe is bound', () => {
    renderSelector('recipe-iron');
    expect(screen.getByText('iron-ore')).toBeInTheDocument();
    expect(screen.getByText('iron-ingot')).toBeInTheDocument();
  });

  it('emits null when the user picks the "none" option', async () => {
    const { onChange } = renderSelector('recipe-iron');
    await userEvent.selectOptions(screen.getByRole('combobox'), '');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('emits the recipe id when the user picks a candidate', async () => {
    const { onChange } = renderSelector(null);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'recipe-copper');
    expect(onChange).toHaveBeenLastCalledWith('recipe-copper');
  });

  it('shows a placeholder when device.recipes is empty', () => {
    const noRecipeDevice: Device = { ...DEVICE, recipes: [] };
    render(
      <I18nProvider>
        <RecipeSelector
          device={noRecipeDevice}
          recipes={RECIPES}
          currentRecipeId={null}
          onChange={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
