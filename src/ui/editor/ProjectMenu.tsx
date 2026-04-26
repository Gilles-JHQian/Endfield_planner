/** Project menu — sits at top-left of the workspace.
 *
 *  Three actions:
 *  - New: clear localStorage and reset the project to an empty plot.
 *  - Import: open a JSON file via <input type=file>; on success, replace
 *    the project (caller validates against the current data bundle).
 *  - Export: download a JSON file with the current project state.
 *
 *  The auto-save indicator below polls getLastSavedAt() every 5s — keeps the
 *  display roughly fresh without coupling save and render. The actual save
 *  scheduling happens in EditorPage.
 */
import { useEffect, useState } from 'react';
import { getLastSavedAt } from '@core/persistence/index.ts';

interface Props {
  onNew: () => void;
  onImport: (json: string) => void;
  onExport: () => void;
}

export function ProjectMenu({ onNew, onImport, onExport }: Props) {
  const [open, setOpen] = useState(false);

  function handleImportClick(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then(onImport);
    });
    input.click();
    setOpen(false);
  }

  return (
    <div className="absolute left-3 top-12 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid h-8 place-items-center rounded-[2px] border border-line bg-surface-1 px-3 font-display text-[10px] uppercase tracking-[1.5px] text-fg-soft hover:border-line-strong hover:bg-surface-3 hover:text-fg"
      >
        Project ▾
      </button>
      {open && (
        <div className="mt-1 flex min-w-[160px] flex-col rounded-[2px] border border-line bg-surface-1 shadow-lg">
          <MenuItem
            label="New"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
          />
          <MenuItem label="Import…" onClick={handleImportClick} />
          <MenuItem
            label="Export"
            onClick={() => {
              onExport();
              setOpen(false);
            }}
          />
        </div>
      )}
      <div className="mt-1 font-tech-mono text-[9px] text-fg-faint">
        <SavedIndicator />
      </div>
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-b border-line-faint px-3 py-1.5 text-left font-display text-[10px] uppercase tracking-[1.5px] text-fg-soft last:border-b-0 hover:bg-surface-3 hover:text-fg"
    >
      {label}
    </button>
  );
}

/** Polls getLastSavedAt() on a 5s tick + a `now` snapshot taken in the tick
 *  callback. Keeps Date.now() out of render so React's purity rule is happy. */
function SavedIndicator() {
  const [snapshot, setSnapshot] = useState<{ now: number; lastSavedAt: number | null }>(() => ({
    now: 0,
    lastSavedAt: null,
  }));
  useEffect(() => {
    const tick = (): void => setSnapshot({ now: Date.now(), lastSavedAt: getLastSavedAt() });
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);
  if (snapshot.lastSavedAt === null) return <span>not saved yet</span>;
  const dt = Math.round((snapshot.now - snapshot.lastSavedAt) / 1000);
  if (dt < 5) return <span>saved · just now</span>;
  if (dt < 60) return <span>saved · {dt.toString()}s ago</span>;
  return <span>saved · {Math.round(dt / 60).toString()}m ago</span>;
}
