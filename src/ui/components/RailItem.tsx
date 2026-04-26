/** Category rail item per `.rail-item` — 56px square, 22px icon slot above
 *  a 10px CN label. Active state lights up the left border to amber and
 *  pins a glowing 3px tab on the right edge.
 */
import type { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}

export function RailItem({ icon, label, active = false, onClick, title }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`relative flex h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 border-l-2 transition-colors ${
        active
          ? 'border-amber bg-surface-2 text-amber'
          : 'border-transparent text-fg-faint hover:bg-surface-2 hover:text-fg-soft'
      }`}
    >
      <span className="grid h-[22px] w-[22px] place-items-center">{icon}</span>
      <span className="font-cn text-[10px] tracking-[1px]">{label}</span>
      {active && (
        <span
          className="absolute right-0 top-1/2 h-[60%] w-[3px] -translate-y-1/2 bg-amber shadow-[0_0_8px_var(--color-amber)]"
          aria-hidden
        />
      )}
    </button>
  );
}
