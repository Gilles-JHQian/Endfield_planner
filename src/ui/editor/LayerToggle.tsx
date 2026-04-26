/** Top-right SOLID / FLUID / POWER pill group per design/handoff/components.css
 *  `.layer-toggle`. Drives the canvas's ViewMode (NOT a domain Layer — POWER
 *  is a visual overlay, not a routing layer; see use-view-mode.ts):
 *  - SOLID: full-opacity belts, dimmed pipes, ghost previews assume solid links.
 *  - FLUID: full-opacity pipes, dimmed belts, ghost previews assume fluid links.
 *  - POWER: dim everything; overlay every 供电桩 AoE square so the owner can
 *    see which cells are powered (B7+).
 */
import type { ViewMode } from './use-view-mode.ts';

interface Props {
  active: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const MODES: { mode: ViewMode; label: string; tone: 'amber' | 'teal' | 'fg' }[] = [
  { mode: 'solid', label: 'SOLID', tone: 'amber' },
  { mode: 'fluid', label: 'FLUID', tone: 'teal' },
  { mode: 'power', label: 'POWER', tone: 'fg' },
];

const TONE_TEXT: Record<'amber' | 'teal' | 'fg', string> = {
  amber: 'text-amber',
  teal: 'text-teal',
  fg: 'text-fg',
};

export function LayerToggle({ active, onChange }: Props) {
  return (
    <div className="absolute right-3 top-3 z-10 flex overflow-hidden rounded-[2px] border border-line bg-surface-1">
      {MODES.map(({ mode, label, tone }, i) => {
        const isActive = mode === active;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[1.5px] transition-colors ${
              i < MODES.length - 1 ? 'border-r border-line' : ''
            } ${isActive ? `bg-surface-3 ${TONE_TEXT[tone]}` : 'text-fg-faint hover:text-fg'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
