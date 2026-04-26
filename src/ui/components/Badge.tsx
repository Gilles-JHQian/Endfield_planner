/** Severity badge per `.drc-sev.*` classes. Tiny uppercase display font with
 *  matching border + faint tinted background.
 */
import type { ReactNode } from 'react';

type Severity = 'err' | 'warn' | 'info' | 'good';

interface Props {
  severity: Severity;
  children: ReactNode;
}

const SEVERITY_CLASS: Record<Severity, string> = {
  err: 'border-err text-err bg-err/10',
  warn: 'border-warn text-warn bg-warn/10',
  info: 'border-teal text-teal bg-teal/10',
  good: 'border-good text-good bg-good/10',
};

export function Badge({ severity, children }: Props) {
  return (
    <span
      className={`inline-block rounded-[2px] border px-1.5 py-px font-display text-[9px] font-bold uppercase tracking-[1.5px] ${SEVERITY_CLASS[severity]}`}
    >
      {children}
    </span>
  );
}
