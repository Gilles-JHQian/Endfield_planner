/** Device library panel per design/handoff/components.css `.library`.
 *  Header (count + title) → search box → 2-column device card grid.
 *  Cards are draggable / clickable; placement wiring lands in B7 commit 3.
 */
import { useMemo, useState } from 'react';
import { useI18n } from '@i18n/index.tsx';
import { Card } from '@ui/components/index.ts';
import type { Device, DeviceCategory } from '@core/data-loader/types.ts';

interface Props {
  devices: readonly Device[];
  category: DeviceCategory;
  selectedDeviceId: string | null;
  onPick: (device: Device | null) => void;
}

export function Library({ devices, category, selectedDeviceId, onPick }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices.filter((d) => {
      if (d.category !== category) return false;
      if (!q) return true;
      return (
        d.id.toLowerCase().includes(q) ||
        d.display_name_zh_hans.toLowerCase().includes(q) ||
        d.display_name_en?.toLowerCase().includes(q)
      );
    });
  }, [devices, category, query]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line-faint px-3.5 py-3">
        <div className="flex flex-col gap-px">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[2px] text-amber">
            LIBRARY
          </span>
          <span className="font-cn text-[14px] font-bold text-fg">{t('library.title')}</span>
        </div>
        <span className="rounded-[2px] border border-line-strong px-1.5 py-0.5 font-tech-mono text-[10px] text-fg-faint">
          {filtered.length.toString()}
        </span>
      </header>

      <div className="m-3 flex items-center gap-2 rounded-[2px] border border-line bg-surface-0 px-2.5 py-1.5 focus-within:border-amber focus-within:shadow-[0_0_0_1px_var(--color-amber)]/20">
        <span className="text-fg-faint" aria-hidden>
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('library.search')}
          className="flex-1 bg-transparent font-tech-mono text-[12px] text-fg placeholder:text-fg-dim focus:outline-none"
        />
      </div>

      <div className="scroll-y flex-1 px-3 pb-3">
        {filtered.length === 0 ? (
          <div className="grid h-32 place-items-center font-cn text-[12px] text-fg-faint">
            {t('library.empty')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((d) => {
              const layer = d.has_fluid_interface ? 'fluid' : 'solid';
              const isSelected = d.id === selectedDeviceId;
              return (
                <Card
                  key={d.id}
                  layer={layer}
                  selected={isSelected}
                  onClick={() => onPick(isSelected ? null : d)}
                >
                  <div
                    className="grid aspect-square w-full place-items-center rounded-[2px] border border-line-faint bg-surface-0"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, var(--color-line-faint) 1px, transparent 1px), linear-gradient(to bottom, var(--color-line-faint) 1px, transparent 1px)',
                      backgroundSize: '8px 8px',
                    }}
                  >
                    <span
                      className={`font-display text-[18px] uppercase ${layer === 'fluid' ? 'text-teal' : 'text-amber'}`}
                      aria-hidden
                    >
                      {d.id.split('-')[0]?.[0]?.toUpperCase() ?? '?'}
                    </span>
                  </div>
                  <div>
                    <div className="font-cn text-[12px] leading-tight text-fg">
                      {d.display_name_zh_hans}
                    </div>
                    <div className="font-tech-mono text-[9px] tracking-[0.5px] text-fg-faint">
                      {d.id}
                    </div>
                  </div>
                  <div className="flex gap-1 font-tech-mono text-[9px]">
                    <span className="rounded-[2px] border border-line-strong px-1 py-px text-fg-soft">
                      {d.footprint.width.toString()}×{d.footprint.height.toString()}
                    </span>
                    {d.requires_power && (
                      <span className="rounded-[2px] border border-line-strong px-1 py-px text-amber">
                        {d.power_draw.toString()}P
                      </span>
                    )}
                    {d.has_fluid_interface && (
                      <span className="rounded-[2px] border border-teal-deep px-1 py-px text-teal">
                        FL
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
