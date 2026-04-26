/** Top-right SOLID / FLUID / POWER pill group per design/handoff/components.css
 *  `.layer-toggle`. The active layer determines:
 *  - which layer's links are rendered fully opaque (others dim)
 *  - which kind of port is highlighted on hover
 *  - which infrastructure devices the palette highlights
 */
import type { Layer } from '@core/domain/types.ts';

interface Props {
  active: Layer;
  onChange: (layer: Layer) => void;
}

const LAYERS: { layer: Layer; label: string; tone: 'amber' | 'teal' | 'fg' }[] = [
  { layer: 'solid', label: 'SOLID', tone: 'amber' },
  { layer: 'fluid', label: 'FLUID', tone: 'teal' },
  { layer: 'power', label: 'POWER', tone: 'fg' },
];

const TONE_TEXT: Record<'amber' | 'teal' | 'fg', string> = {
  amber: 'text-amber',
  teal: 'text-teal',
  fg: 'text-fg',
};

export function LayerToggle({ active, onChange }: Props) {
  return (
    <div className="absolute right-3 top-3 z-10 flex overflow-hidden rounded-[2px] border border-line bg-surface-1">
      {LAYERS.map(({ layer, label, tone }, i) => {
        const isActive = layer === active;
        return (
          <button
            key={layer}
            type="button"
            onClick={() => onChange(layer)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[1.5px] transition-colors ${
              i < LAYERS.length - 1 ? 'border-r border-line' : ''
            } ${isActive ? `bg-surface-3 ${TONE_TEXT[tone]}` : 'text-fg-faint hover:text-fg'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
