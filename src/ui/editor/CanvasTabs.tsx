/** Horizontal canvas-tab strip rendered between the global Header and the
 *  4-column editor grid. Each tab shows the project's current name plus a
 *  hover-revealed × close button; a trailing "+" button opens a fresh canvas.
 *
 *  Tabs are scrollable horizontally when many are open; the "+" button stays
 *  pinned at the end (outside the scrollable region).
 */
import type { CanvasTabSummary } from './use-canvases.ts';
import { useI18n } from '@i18n/index.tsx';

interface Props {
  tabs: readonly CanvasTabSummary[];
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}

export function CanvasTabs({ tabs, onActivate, onClose, onAdd }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex h-[32px] items-stretch border-b border-line bg-surface-1">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab) => (
          <CanvasTab key={tab.id} tab={tab} onActivate={onActivate} onClose={onClose} />
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        title={t('canvasTabs.add')}
        aria-label={t('canvasTabs.add')}
        className="flex w-8 items-center justify-center border-l border-line text-fg-faint transition-colors hover:bg-surface-2 hover:text-amber"
      >
        +
      </button>
    </div>
  );
}

function CanvasTab({
  tab,
  onActivate,
  onClose,
}: {
  tab: CanvasTabSummary;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="tab"
      aria-selected={tab.active}
      onClick={() => onActivate(tab.id)}
      className={`group relative flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-line-faint px-3 font-cn text-[12px] transition-colors ${
        tab.active
          ? 'bg-surface-2 text-fg'
          : 'text-fg-soft hover:bg-surface-2 hover:text-fg'
      }`}
    >
      {tab.active && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-amber" />
      )}
      <span className="max-w-[160px] truncate">{tab.name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.id);
        }}
        title={t('canvasTabs.close')}
        aria-label={t('canvasTabs.close')}
        className={`flex h-4 w-4 items-center justify-center rounded-[2px] font-tech-mono text-[11px] text-fg-faint transition-colors hover:bg-surface-3 hover:text-err ${
          tab.active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        ×
      </button>
    </div>
  );
}
