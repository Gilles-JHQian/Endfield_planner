/** Inspector section head per `.insp-section-head` — clickable bar with a 4×12
 *  amber marker, display-font EN title, CN subtitle, and a chevron that
 *  rotates -90° when the section is collapsed.
 */
import type { ReactNode } from 'react';

interface Props {
  titleEn: string;
  titleCn: string;
  collapsed?: boolean;
  onToggle?: () => void;
  /** Optional right-side accessory (count badge, "+ Add" button, etc.). */
  right?: ReactNode;
}

export function SectionHead({ titleEn, titleCn, collapsed = false, onToggle, right }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between bg-surface-1 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
    >
      <span className="flex items-center gap-2.5">
        <span className="block h-3 w-1 bg-amber" aria-hidden />
        <span className="font-display text-[11px] font-semibold uppercase tracking-[1.5px] text-fg">
          {titleEn}
        </span>
        <span className="font-cn text-[12px] text-fg-soft">{titleCn}</span>
      </span>
      <span className="flex items-center gap-2">
        {right}
        <span
          className={`font-tech-mono text-[10px] text-fg-faint transition-transform ${collapsed ? '-rotate-90' : ''}`}
          aria-hidden
        >
          ▾
        </span>
      </span>
    </button>
  );
}
