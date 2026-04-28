/** Device library panel per design/handoff/components.css `.library`.
 *  Header (count + title) → search box → 2-column device card grid.
 *  Cards are draggable / clickable; placement wiring lands in B7 commit 3.
 *
 *  P4 v7 adds a 'clipboard' pseudo-tab that swaps the device grid for the
 *  clipboard-history slots. Clicking a slot promotes it to the top of the
 *  history (so Ctrl+V picks it up) and arms the paste-mode preview.
 */
import { useMemo, useRef, useState } from 'react';
import { useI18n } from '@i18n/index.tsx';
import { Card } from '@ui/components/index.ts';
import type { Device } from '@core/data-loader/types.ts';
import type { ClipboardPayload, Schematic } from '@core/persistence/index.ts';
import { ClipboardThumb } from './ClipboardThumb.tsx';
import { DeviceThumb } from './DeviceThumb.tsx';
import type { LibraryTab } from './Rail.tsx';

interface Props {
  devices: readonly Device[];
  category: LibraryTab;
  selectedDeviceId: string | null;
  onPick: (device: Device | null) => void;
  /** P4 v7: rolling clipboard history (memory-only, last 10). Only consulted
   *  when category === 'clipboard'. */
  clipboardHistory?: readonly ClipboardPayload[];
  /** P4 v7: callback when a clipboard slot is picked. Editor uses this to
   *  promote the slot + arm paste mode. */
  onPickClipboardSlot?: (payload: ClipboardPayload) => void;
  /** Session-only schematic library. Only consulted when category === 'schematic'. */
  schematics?: readonly Schematic[];
  /** Click a saved schematic → editor arms paste mode (same flow as clipboard slots). */
  onPickSchematic?: (payload: ClipboardPayload) => void;
  /** Import a schematic JSON from disk → editor parses + appends to the list. */
  onImportSchematic?: (file: File) => void;
  /** Remove an entry from the session schematic list. */
  onRemoveSchematic?: (id: string) => void;
}

export function Library({
  devices,
  category,
  selectedDeviceId,
  onPick,
  clipboardHistory,
  onPickClipboardSlot,
  schematics,
  onPickSchematic,
  onImportSchematic,
  onRemoveSchematic,
}: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (category === 'clipboard' || category === 'schematic') return [] as Device[];
    const q = query.trim().toLowerCase();
    return devices.filter((d) => {
      if (d.category !== category) return false;
      if (!q) return true;
      return (
        d.id.toLowerCase().includes(q) ||
        d.display_name_zh_hans.toLowerCase().includes(q) ||
        d.display_name_en?.toLowerCase().includes(q)
      );
    });
  }, [devices, category, query]);

  if (category === 'clipboard') {
    return (
      <ClipboardView
        history={clipboardHistory ?? []}
        devices={devices}
        {...(onPickClipboardSlot ? { onPick: onPickClipboardSlot } : {})}
      />
    );
  }

  if (category === 'schematic') {
    return (
      <SchematicView
        schematics={schematics ?? []}
        devices={devices}
        {...(onPickSchematic ? { onPick: onPickSchematic } : {})}
        {...(onImportSchematic ? { onImport: onImportSchematic } : {})}
        {...(onRemoveSchematic ? { onRemove: onRemoveSchematic } : {})}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line-faint px-3.5 py-3">
        <div className="flex flex-col gap-px">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[2px] text-amber">
            LIBRARY
          </span>
          <span className="font-cn text-[14px] font-bold text-fg">{t('library.title')}</span>
        </div>
        <span className="rounded-[2px] border border-line-strong px-1.5 py-0.5 font-tech-mono text-[10px] text-fg-faint">
          {filtered.length.toString()}
        </span>
      </header>

      <div className="m-3 flex items-center gap-2 rounded-[2px] border border-line bg-surface-0 px-2.5 py-1.5 focus-within:border-amber focus-within:shadow-[0_0_0_1px_var(--color-amber)]/20">
        <span className="text-fg-faint" aria-hidden>
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('library.search')}
          className="flex-1 bg-transparent font-tech-mono text-[12px] text-fg placeholder:text-fg-dim focus:outline-none"
        />
      </div>

      <div className="scroll-y min-h-0 flex-1 px-3 pb-3">
        {filtered.length === 0 ? (
          <div className="grid h-32 place-items-center font-cn text-[12px] text-fg-faint">
            {t('library.empty')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((d) => {
              const layer = d.has_fluid_interface ? 'fluid' : 'solid';
              const isSelected = d.id === selectedDeviceId;
              return (
                <Card
                  key={d.id}
                  layer={layer}
                  selected={isSelected}
                  onClick={() => onPick(isSelected ? null : d)}
                >
                  <div
                    className="grid aspect-square w-full place-items-center rounded-[2px] border border-line-faint bg-surface-0"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, var(--color-line-faint) 1px, transparent 1px), linear-gradient(to bottom, var(--color-line-faint) 1px, transparent 1px)',
                      backgroundSize: '8px 8px',
                    }}
                  >
                    <DeviceThumb device={d} />
                  </div>
                  <div>
                    <div className="font-cn text-[12px] leading-tight text-fg">
                      {d.display_name_zh_hans}
                    </div>
                    <div className="font-tech-mono text-[9px] tracking-[0.5px] text-fg-faint">
                      {d.id}
                    </div>
                  </div>
                  <div className="flex gap-1 font-tech-mono text-[9px]">
                    <span className="rounded-[2px] border border-line-strong px-1 py-px text-fg-soft">
                      {d.footprint.width.toString()}×{d.footprint.height.toString()}
                    </span>
                    {d.requires_power && (
                      <span className="rounded-[2px] border border-line-strong px-1 py-px text-amber">
                        {d.power_draw.toString()}P
                      </span>
                    )}
                    {d.has_fluid_interface && (
                      <span className="rounded-[2px] border border-teal-deep px-1 py-px text-teal">
                        FL
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** P4 v7 clipboard tab: render the rolling history as 1-column cards.
 *  Each card shows the device count + a tiny bbox preview rectangle so
 *  owners can distinguish slots at a glance. Clicking promotes + arms paste.
 *
 *  P4 v7.7: the bbox preview is now a real `ClipboardThumb` SVG showing
 *  the cluster's relative footprints + link paths. */
function ClipboardView({
  history,
  devices,
  onPick,
}: {
  history: readonly ClipboardPayload[];
  devices: readonly Device[];
  onPick?: (payload: ClipboardPayload) => void;
}) {
  const { t } = useI18n();
  const lookup = useMemo(() => {
    const map = new Map<string, Device>();
    for (const d of devices) map.set(d.id, d);
    return (id: string): Device | undefined => map.get(id);
  }, [devices]);
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line-faint px-3.5 py-3">
        <div className="flex flex-col gap-px">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[2px] text-amber">
            CLIPBOARD
          </span>
          <span className="font-cn text-[14px] font-bold text-fg">{t('library.clipboard')}</span>
        </div>
        <span className="rounded-[2px] border border-line-strong px-1.5 py-0.5 font-tech-mono text-[10px] text-fg-faint">
          {history.length.toString()}
        </span>
      </header>
      <div className="scroll-y min-h-0 flex-1 px-3 py-3">
        {history.length === 0 ? (
          <div className="grid h-32 place-items-center px-3 text-center font-cn text-[12px] text-fg-faint">
            {t('library.clipboardEmpty')}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((payload, i) => {
              const w = bboxWidth(payload);
              const h = bboxHeight(payload);
              return (
                <button
                  type="button"
                  key={i.toString()}
                  onClick={() => onPick?.(payload)}
                  className="flex items-center gap-3 rounded-[2px] border border-line bg-surface-1 px-3 py-2 text-left transition-colors hover:border-amber"
                >
                  <span className="font-tech-mono text-[10px] text-fg-faint">
                    #{(i + 1).toString()}
                  </span>
                  <div
                    className="grid place-items-center rounded-[2px] border border-line-faint bg-surface-0"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, var(--color-line-faint) 1px, transparent 1px), linear-gradient(to bottom, var(--color-line-faint) 1px, transparent 1px)',
                      backgroundSize: '8px 8px',
                    }}
                  >
                    <ClipboardThumb payload={payload} lookup={lookup} />
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="font-cn text-[12px] text-fg">
                      {t('library.clipboardSlot', {
                        devices: payload.items.length,
                        links: payload.links.length,
                      })}
                    </span>
                    <span className="font-tech-mono text-[10px] text-fg-faint">
                      {w.toString()} × {h.toString()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function bboxWidth(p: ClipboardPayload): number {
  let max = 0;
  for (const it of p.items) max = Math.max(max, it.rel_position.x + 1);
  for (const l of p.links) for (const c of l.rel_path) max = Math.max(max, c.x + 1);
  return max;
}
function bboxHeight(p: ClipboardPayload): number {
  let max = 0;
  for (const it of p.items) max = Math.max(max, it.rel_position.y + 1);
  for (const l of p.links) for (const c of l.rel_path) max = Math.max(max, c.y + 1);
  return max;
}

/** Schematic tab — session-only named ClipboardPayloads. Mirrors ClipboardView
 *  but adds a top-row Import button (hidden file input + FileReader) and a
 *  per-entry remove button. Clicking a card arms paste mode via onPick (same
 *  pipeline the clipboard slots use). */
function SchematicView({
  schematics,
  devices,
  onPick,
  onImport,
  onRemove,
}: {
  schematics: readonly Schematic[];
  devices: readonly Device[];
  onPick?: (payload: ClipboardPayload) => void;
  onImport?: (file: File) => void;
  onRemove?: (id: string) => void;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lookup = useMemo(() => {
    const map = new Map<string, Device>();
    for (const d of devices) map.set(d.id, d);
    return (id: string): Device | undefined => map.get(id);
  }, [devices]);
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line-faint px-3.5 py-3">
        <div className="flex flex-col gap-px">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[2px] text-amber">
            SCHEMATIC
          </span>
          <span className="font-cn text-[14px] font-bold text-fg">{t('library.schematic')}</span>
        </div>
        <span className="rounded-[2px] border border-line-strong px-1.5 py-0.5 font-tech-mono text-[10px] text-fg-faint">
          {schematics.length.toString()}
        </span>
      </header>
      <div className="flex items-center gap-2 border-b border-line-faint px-3 py-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-[2px] border border-line bg-transparent px-2 py-1 font-display text-[11px] uppercase tracking-[1px] text-fg-soft transition-colors hover:bg-surface-2 hover:text-fg"
        >
          {t('library.schematicImport')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && onImport) onImport(file);
            // Reset so picking the same file twice still fires onChange.
            e.target.value = '';
          }}
        />
      </div>
      <div className="scroll-y min-h-0 flex-1 px-3 py-3">
        {schematics.length === 0 ? (
          <div className="grid h-32 place-items-center px-3 text-center font-cn text-[12px] text-fg-faint">
            {t('library.schematicEmpty')}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {schematics.map((s) => {
              const w = bboxWidth(s.payload);
              const h = bboxHeight(s.payload);
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-[2px] border border-line bg-surface-1 px-3 py-2 transition-colors hover:border-amber"
                >
                  <button
                    type="button"
                    onClick={() => onPick?.(s.payload)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <div
                      className="grid place-items-center rounded-[2px] border border-line-faint bg-surface-0"
                      style={{
                        backgroundImage:
                          'linear-gradient(to right, var(--color-line-faint) 1px, transparent 1px), linear-gradient(to bottom, var(--color-line-faint) 1px, transparent 1px)',
                        backgroundSize: '8px 8px',
                      }}
                    >
                      <ClipboardThumb payload={s.payload} lookup={lookup} />
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5">
                      <span className="font-cn text-[12px] text-fg">{s.name}</span>
                      <span className="font-tech-mono text-[10px] text-fg-faint">
                        {t('library.schematicSlot', {
                          devices: s.payload.items.length,
                          links: s.payload.links.length,
                        })}
                        <span className="mx-1.5">·</span>
                        {w.toString()} × {h.toString()}
                      </span>
                    </div>
                  </button>
                  {onRemove && (
                    <button
                      type="button"
                      onClick={() => onRemove(s.id)}
                      title="remove"
                      className="rounded-[2px] px-1.5 py-0.5 font-tech-mono text-[12px] text-fg-faint hover:bg-surface-2 hover:text-err"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
