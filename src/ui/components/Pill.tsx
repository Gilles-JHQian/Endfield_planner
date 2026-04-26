/** Hairline-bordered metadata pill per `.pill` in components.css. Used in the
 *  topbar project info ("REGION 武陵", "PLOT 50×30"). The label appears in tiny
 *  uppercase display font; the value sits in tech-mono.
 */
import type { ReactNode } from 'react';

interface Props {
  label?: string;
  children: ReactNode;
  /** Apply a status-color tint to the value text. */
  tone?: 'amber' | 'teal' | 'good' | 'warn' | 'err';
}

const TONE_CLASS: Record<NonNullable<Props['tone']>, string> = {
  amber: 'text-amber',
  teal: 'text-teal',
  good: 'text-good',
  warn: 'text-warn',
  err: 'text-err',
};

export function Pill({ label, children, tone }: Props) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-line-strong bg-surface-2 px-2 py-0.5">
      {label && (
        <span className="font-display text-[9px] uppercase tracking-[1.5px] text-fg-faint">
          {label}
        </span>
      )}
      <span className={`font-tech-mono text-[11px] ${tone ? TONE_CLASS[tone] : 'text-fg'}`}>
        {children}
      </span>
    </span>
  );
}
