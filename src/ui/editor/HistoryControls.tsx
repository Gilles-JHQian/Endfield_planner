/** Undo/Redo button cluster — floats top-right of the workspace.
 *  Buttons mirror the project store's canUndo/canRedo flags.
 *  Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) are wired in
 *  EditorPage so they fire even when the buttons are not in focus.
 */
interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function HistoryControls({ canUndo, canRedo, onUndo, onRedo }: Props) {
  return (
    <div className="absolute right-3 top-12 z-10 flex gap-1">
      <HistoryBtn glyph="⤺" label="Ctrl+Z · Undo" enabled={canUndo} onClick={onUndo} />
      <HistoryBtn glyph="⤻" label="Ctrl+Shift+Z · Redo" enabled={canRedo} onClick={onRedo} />
    </div>
  );
}

function HistoryBtn({
  glyph,
  label,
  enabled,
  onClick,
}: {
  glyph: string;
  label: string;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      disabled={!enabled}
      className={`grid h-8 w-8 place-items-center rounded-[2px] border font-display text-[14px] transition-colors ${
        enabled
          ? 'border-line bg-surface-1 text-fg-soft hover:border-line-strong hover:bg-surface-3 hover:text-fg'
          : 'cursor-not-allowed border-line bg-surface-1 text-fg-dim opacity-50'
      }`}
    >
      {glyph}
    </button>
  );
}
