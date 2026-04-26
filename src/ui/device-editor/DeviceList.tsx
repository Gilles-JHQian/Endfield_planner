/** Searchable left-rail device list for the §5.4 device editor.
 *  Click a row to load it into the draft state on the right.
 *  CategoryTabs above narrow the list by DeviceCategory; 'all' shows everything.
 */
import { useMemo, useState } from 'react';
import type { Device } from '@core/data-loader/types.ts';
import { CategoryTabs, type CategoryFilter } from './CategoryTabs.tsx';

interface Props {
  devices: readonly Device[];
  selectedId: string | null;
  onPick: (d: Device) => void;
}

export function DeviceList({ devices, selectedId, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices.filter((d) => {
      if (category !== 'all' && d.category !== category) return false;
      if (!q) return true;
      return (
        d.id.toLowerCase().includes(q) ||
        d.display_name_zh_hans.toLowerCase().includes(q) ||
        (d.display_name_en?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [devices, query, category]);

  return (
    <div className="flex h-full flex-col">
      <CategoryTabs active={category} onChange={setCategory} />
      <div className="border-b border-line p-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search…"
          className="w-full rounded-[2px] border border-line bg-surface-0 px-2 py-1 font-tech-mono text-[11px] text-fg outline-none focus:border-amber"
        />
        <div className="mt-1 font-tech-mono text-[9px] text-fg-faint">
          {filtered.length.toString()} / {devices.length.toString()} devices
        </div>
      </div>
      <ul className="scroll-y flex-1">
        {filtered.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onPick(d)}
              className={`flex w-full flex-col gap-0.5 border-l-2 border-b border-line-faint px-2 py-1.5 text-left transition-colors ${
                selectedId === d.id
                  ? 'border-l-amber bg-surface-3 text-fg'
                  : 'border-l-transparent hover:border-l-line-strong hover:bg-surface-2'
              }`}
            >
              <span className="font-cn text-[11px]">{d.display_name_zh_hans}</span>
              <span className="font-tech-mono text-[9px] text-fg-faint">{d.id}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
