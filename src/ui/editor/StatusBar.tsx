/** 24px workspace footer per design/handoff/components.css `.statusbar`.
 *  Cursor cell coords / zoom% / device count / total power / etc.
 *  Sits absolutely positioned at the bottom of the workspace.
 */
import type { ViewMode } from './use-view-mode.ts';

interface Props {
  cursor: { x: number; y: number } | null;
  zoom: number;
  plot: { width: number; height: number };
  deviceCount: number;
  totalPower?: number;
  viewMode: ViewMode;
}

const VIEW_TONE: Record<ViewMode, 'amber' | 'teal' | undefined> = {
  solid: 'amber',
  fluid: 'teal',
  power: undefined,
};

export function StatusBar({ cursor, zoom, plot, deviceCount, totalPower, viewMode }: Props) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 flex h-[24px] items-center gap-4 border-t border-line bg-surface-1 px-3 font-tech-mono text-[10px] text-fg-soft">
      <Group label="CURSOR">
        {cursor ? `${cursor.x.toString()}, ${cursor.y.toString()}` : '—'}
      </Group>
      <Group label="ZOOM">{Math.round(zoom * 100).toString()}%</Group>
      <Group label="PLOT">
        {plot.width.toString()}×{plot.height.toString()}
      </Group>
      <Group label="VIEW" {...(VIEW_TONE[viewMode] ? { tone: VIEW_TONE[viewMode] } : {})}>
        {viewMode.toUpperCase()}
      </Group>
      <div className="ml-auto flex gap-4">
        <Group label="DEVICES">{deviceCount.toString()}</Group>
        {totalPower !== undefined && <Group label="POWER">{totalPower.toString()}</Group>}
      </div>
    </div>
  );
}

function Group({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: 'amber' | 'teal';
  children: React.ReactNode;
}) {
  const valueClass = tone === 'amber' ? 'text-amber' : tone === 'teal' ? 'text-teal' : 'text-fg';
  return (
    <span className="flex items-center gap-1">
      <span className="uppercase tracking-[1px] text-fg-faint">{label}</span>
      <span className={valueClass}>{children}</span>
    </span>
  );
}
