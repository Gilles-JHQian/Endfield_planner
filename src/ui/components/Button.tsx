/** Button per design/handoff/components.css `.run-btn` and `.tool-btn`.
 *  Three intents: primary (amber CTA, used for Solve / Run / confirm),
 *  ghost (transparent + line border, used for menu items), danger (err color).
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Intent = 'primary' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  intent?: Intent;
  children: ReactNode;
}

const INTENT_CLASSES: Record<Intent, string> = {
  primary:
    'bg-amber text-surface-0 border-amber font-display font-bold uppercase tracking-[2px] hover:bg-amber-deep',
  ghost:
    'bg-transparent text-fg-soft border-line font-display font-medium uppercase tracking-[1px] hover:bg-surface-2 hover:text-fg',
  danger:
    'bg-transparent text-err border-err font-display font-medium uppercase tracking-[1px] hover:bg-err/10',
};

export function Button({ intent = 'primary', className = '', children, ...rest }: Props) {
  const intentClass = INTENT_CLASSES[intent];
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-[2px] border px-4 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${intentClass} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
