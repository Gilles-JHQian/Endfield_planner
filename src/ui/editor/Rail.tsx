/** Category rail per design/handoff/components.css `.rail`. Each item is a
 *  56px square showing a glyph + 10px CN label. Clicking a category filters
 *  the Library to that category's devices. Combat is rendered greyed out
 *  per REQUIREMENT.md §2 (out of editor scope but still visible in catalog).
 *
 *  P4 v7 adds a 'clipboard' pseudo-tab as the bottom item that switches the
 *  Library into a clipboard-history view.
 */
import { useI18n } from '@i18n/index.tsx';
import { RailItem } from '@ui/components/index.ts';
import type { DeviceCategory } from '@core/data-loader/types.ts';

export type LibraryTab = DeviceCategory | 'clipboard';

interface Props {
  active: LibraryTab;
  onChange: (tab: LibraryTab) => void;
}

const CATEGORIES: { cat: LibraryTab; glyph: string }[] = [
  { cat: 'miner', glyph: '⛏' },
  { cat: 'basic_production', glyph: '⚙' },
  { cat: 'synthesis', glyph: '⛁' },
  { cat: 'storage', glyph: '▦' },
  { cat: 'logistics', glyph: '↹' },
  { cat: 'power', glyph: '⚡' },
  { cat: 'utility', glyph: '◧' },
  { cat: 'planting', glyph: '✿' },
  { cat: 'combat', glyph: '⚔' },
  { cat: 'clipboard', glyph: '📋' },
];

export function Rail({ active, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div className="scroll-y flex h-full min-h-0 flex-col gap-0.5 py-2">
      {CATEGORIES.map(({ cat, glyph }) => {
        const label = cat === 'clipboard' ? t('library.clipboard') : t(`category.${cat}`);
        return (
          <RailItem
            key={cat}
            icon={
              <span className="font-display text-[18px] leading-none" aria-hidden>
                {glyph}
              </span>
            }
            label={label}
            active={cat === active}
            onClick={() => onChange(cat)}
            title={label}
          />
        );
      })}
    </div>
  );
}
