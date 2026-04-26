/** Loads `data/versions/<v>/devices.scraped.json` — the scraper's pre-merge
 *  output, used by the device editor's "Reset to scraped baseline" action.
 *
 *  Returns the device array indexed by id for O(1) lookup. Errors silently
 *  resolve to `null`; the editor disables the Reset button when no baseline
 *  is available.
 */
import { useEffect, useState } from 'react';
import type { Device } from '@core/data-loader/types.ts';

export interface ScrapedBaseline {
  byId: ReadonlyMap<string, Device>;
}

export function useScrapedBaseline(version: string): ScrapedBaseline | null {
  const [baseline, setBaseline] = useState<ScrapedBaseline | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const url = `/data/versions/${version}/devices.scraped.json`;
        const r = await fetch(url);
        if (!r.ok) return;
        const arr = (await r.json()) as Device[];
        if (cancelled) return;
        setBaseline({ byId: new Map(arr.map((d) => [d.id, d])) });
      } catch {
        // Baseline missing or fetch failed — leave null; UI handles gracefully.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);
  return baseline;
}

/** Compute a "reset" record: take the baseline fields verbatim but preserve
 *  owner-only fields from the current draft (`io_ports`, `power_aoe`,
 *  additional locale display names not in the scraper output). */
export function applyBaseline(draft: Device, baseline: Device): Device {
  return {
    ...baseline,
    // Preserve owner-only fields if the draft has them.
    io_ports: draft.io_ports.length > 0 ? draft.io_ports : baseline.io_ports,
    ...(draft.power_aoe ? { power_aoe: draft.power_aoe } : {}),
  };
}
