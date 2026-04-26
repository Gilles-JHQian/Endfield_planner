/** Horizontal category filter strip for the device editor's left rail.
 *  Mirrors the layout editor's category Rail (Rail.tsx) but laid out
 *  horizontally to preserve the 280px column for the device list itself.
 *
 *  Includes an "ALL" tab as the default — owners often want to jump straight
 *  to a specific device id by name without category-narrowing first.
 */
import { useI18n } from '@i18n/index.tsx';
import type { DeviceCategory } from '@core/data-loader/types.ts';

export type CategoryFilter = DeviceCategory | 'all';

interface Props {
  active: CategoryFilter;
  onChange: (cat: CategoryFilter) => void;
}

const TABS: { cat: CategoryFilter; glyph: string }[] = [
  { cat: 'all', glyph: '✱' },
  { cat: 'miner', glyph: '⛏' },
  { cat: 'basic_production', glyph: '⚙' },
  { cat: 'synthesis', glyph: '⛁' },
  { cat: 'storage', glyph: '▦' },
  { cat: 'logistics', glyph: '↹' },
  { cat: 'power', glyph: '⚡' },
  { cat: 'utility', glyph: '◧' },
  { cat: 'planting', glyph: '✿' },
  { cat: 'combat', glyph: '⚔' },
];

export function CategoryTabs({ active, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div className="scroll-y flex gap-px overflow-x-auto border-b border-line bg-surface-0 p-1">
      {TABS.map(({ cat, glyph }) => {
        const label = cat === 'all' ? 'ALL' : t(`category.${cat}`);
        const isActive = cat === active;
        return (
          <button
            key={cat}
            type="button"
            title={label}
            onClick={() => onChange(cat)}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-[2px] border font-display text-[12px] transition-colors ${
              isActive
                ? 'border-amber bg-amber/10 text-amber'
                : 'border-transparent text-fg-soft hover:border-line hover:bg-surface-2 hover:text-fg'
            }`}
          >
            {glyph}
          </button>
        );
      })}
    </div>
  );
}
