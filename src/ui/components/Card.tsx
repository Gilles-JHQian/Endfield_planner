/** Card per `.dev-card` — bg-2 surface with hairline border that turns amber
 *  (or teal, when fluid) on hover. Four 8×8 corner brackets sit at the
 *  top-left and top-right; they pick up the same accent on hover.
 *
 *  Used as the device library card; reusable for any "drag this thing" affordance.
 */
import type { ReactNode } from 'react';

interface Props {
  /** Layer affinity changes the hover accent: solid → amber, fluid → teal. */
  layer?: 'solid' | 'fluid';
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

export function Card({
  layer = 'solid',
  selected = false,
  onClick,
  children,
  className = '',
}: Props) {
  const accent = layer === 'fluid' ? 'teal' : 'amber';
  const hoverBorder = layer === 'fluid' ? 'hover:border-teal' : 'hover:border-amber';
  const selectedBorder = selected
    ? layer === 'fluid'
      ? 'border-teal'
      : 'border-amber'
    : 'border-line';

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`group relative flex cursor-grab flex-col gap-1.5 rounded-[2px] border bg-surface-2 p-2 transition-all ${selectedBorder} ${hoverBorder} hover:bg-surface-3 ${className}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-2 w-2 border-l border-t border-line-strong group-hover:border-${accent}`}
        aria-hidden
      />
      <span
        className={`absolute right-0.5 top-0.5 h-2 w-2 border-r border-t border-line-strong group-hover:border-${accent}`}
        aria-hidden
      />
      {children}
    </div>
  );
}
