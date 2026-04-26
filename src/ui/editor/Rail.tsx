/** Category rail per design/handoff/components.css `.rail`. Each item is a
 *  56px square showing a glyph + 10px CN label. Clicking a category filters
 *  the Library to that category's devices. Combat is rendered greyed out
 *  per REQUIREMENT.md §2 (out of editor scope but still visible in catalog).
 */
import { useI18n } from '@i18n/index.tsx';
import { RailItem } from '@ui/components/index.ts';
import type { DeviceCategory } from '@core/data-loader/types.ts';

interface Props {
  active: DeviceCategory;
  onChange: (cat: DeviceCategory) => void;
}

/** Order matches the rough flow of the in-game build menu — extraction up top,
 *  fabrication, storage/logistics, infra, planting, combat last. */
const CATEGORIES: { cat: DeviceCategory; glyph: string }[] = [
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

export function Rail({ active, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div className="scroll-y flex h-full min-h-0 flex-col gap-0.5 py-2">
      {CATEGORIES.map(({ cat, glyph }) => (
        <RailItem
          key={cat}
          icon={
            <span className="font-display text-[18px] leading-none" aria-hidden>
              {glyph}
            </span>
          }
          label={t(`category.${cat}`)}
          active={cat === active}
          onClick={() => onChange(cat)}
          title={t(`category.${cat}`)}
        />
      ))}
    </div>
  );
}
