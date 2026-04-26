/** Inspector key/value row per `.kv` — Chinese label left, tech-mono value
 *  right, dashed bottom rule. Used densely inside `.insp-section-body`.
 */
import type { ReactNode } from 'react';

interface Props {
  label: ReactNode;
  /** Tone color for the value text. */
  tone?: 'amber' | 'teal' | 'good' | 'warn' | 'err';
  children: ReactNode;
}

const TONE_CLASS: Record<NonNullable<Props['tone']>, string> = {
  amber: 'text-amber',
  teal: 'text-teal',
  good: 'text-good',
  warn: 'text-warn',
  err: 'text-err',
};

export function KvRow({ label, tone, children }: Props) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-line-faint py-1.5 last:border-b-0">
      <span className="font-cn text-[11px] text-fg-soft">{label}</span>
      <span
        className={`flex items-center gap-1.5 font-tech-mono text-[11px] ${
          tone ? TONE_CLASS[tone] : 'text-fg'
        }`}
      >
        {children}
      </span>
    </div>
  );
}
