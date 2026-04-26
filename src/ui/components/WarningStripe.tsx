/** 4px-tall 45° amber/black warning-stripe band per `.stripes`. Decorative,
 *  use sparingly: under inspector header, at bottom of topbar.
 */

interface Props {
  /** Optional override of the default 4px height. */
  height?: number;
  className?: string;
}

export function WarningStripe({ height = 4, className = '' }: Props) {
  return (
    <div
      aria-hidden
      className={`opacity-30 ${className}`}
      style={{
        height: `${height.toString()}px`,
        background:
          'repeating-linear-gradient(-45deg, var(--color-amber) 0 6px, var(--color-surface-0) 6px 12px)',
      }}
    />
  );
}
