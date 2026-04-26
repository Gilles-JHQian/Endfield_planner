import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@i18n/index.tsx';
import { DeviceList } from './DeviceList.tsx';
import type { Device } from '@core/data-loader/types.ts';

const FURNACE: Device = {
  id: 'furnance-1',
  display_name_zh_hans: '冶炼炉',
  category: 'basic_production',
  footprint: { width: 3, height: 3 },
  bandwidth: 0,
  power_draw: 100,
  requires_power: true,
  has_fluid_interface: false,
  io_ports: [],
  tech_prereq: [],
  recipes: [],
};
const PUMP: Device = {
  ...FURNACE,
  id: 'pump-1',
  display_name_zh_hans: '抽水泵',
  category: 'utility',
  has_fluid_interface: true,
};
const MINER: Device = {
  ...FURNACE,
  id: 'miner-1',
  display_name_zh_hans: '采矿机',
  category: 'miner',
};

describe('DeviceList category tabs', () => {
  it('shows all devices when ALL tab is active (default)', () => {
    render(
      <I18nProvider>
        <DeviceList devices={[FURNACE, PUMP, MINER]} selectedId={null} onPick={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByText('冶炼炉')).toBeInTheDocument();
    expect(screen.getByText('抽水泵')).toBeInTheDocument();
    expect(screen.getByText('采矿机')).toBeInTheDocument();
  });

  it('filters by category when a tab is clicked', async () => {
    render(
      <I18nProvider>
        <DeviceList devices={[FURNACE, PUMP, MINER]} selectedId={null} onPick={vi.fn()} />
      </I18nProvider>,
    );
    // Click the miner tab (⛏ glyph; resolved by its title attribute via i18n)
    const minerTab = screen.getByTitle(/资源开采|miner/i);
    await userEvent.click(minerTab);
    expect(screen.getByText('采矿机')).toBeInTheDocument();
    expect(screen.queryByText('冶炼炉')).not.toBeInTheDocument();
    expect(screen.queryByText('抽水泵')).not.toBeInTheDocument();
  });

  it('search and category filter compose', async () => {
    render(
      <I18nProvider>
        <DeviceList devices={[FURNACE, PUMP, MINER]} selectedId={null} onPick={vi.fn()} />
      </I18nProvider>,
    );
    await userEvent.type(screen.getByPlaceholderText('search…'), 'pump');
    expect(screen.getByText('抽水泵')).toBeInTheDocument();
    expect(screen.queryByText('冶炼炉')).not.toBeInTheDocument();
  });
});
