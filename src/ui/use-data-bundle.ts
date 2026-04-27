/** React hook that loads a versioned DataBundle in the browser via
 *  Vite's import.meta.glob. Returns { bundle, error, loading }.
 *
 *  Vite eagerly resolves every JSON file under data/versions/<v>/ at build
 *  time but only fetches them on demand because we use eager: false. The
 *  hook re-runs when `version` changes.
 */
import { useCallback, useEffect, useState } from 'react';
// Import from the IO-agnostic loader, NOT the barrel — the barrel pulls in
// the Node-only fs wrapper which would bloat the browser bundle.
import { loadDataBundleFromReader, type JsonReader } from '@core/data-loader/load.ts';
import type { DataBundle, Device } from '@core/data-loader/types.ts';

// Maps "/data/versions/<v>/<file>.json" → loader function returning JSON.
const dataModules = import.meta.glob<{ default: unknown }>('/data/versions/*/*.json');

function makeReader(version: string): JsonReader {
  return async (relPath: string) => {
    const key = `/data/versions/${version}/${relPath}`;
    const loader = dataModules[key];
    if (!loader) {
      throw new Error(`No bundled data file at ${key}`);
    }
    const mod = await loader();
    return mod.default;
  };
}

interface FetchedState {
  readonly bundle: DataBundle | null;
  readonly error: Error | null;
}

export interface DataBundleState extends FetchedState {
  readonly loading: boolean;
  /** Replace the bundle's devices array in place. Used by the device editor
   *  after Save to keep the in-memory bundle aligned with what was just
   *  written to disk — equivalent to a re-fetch since the merged array is
   *  exactly the file content.
   */
  readonly setDevices: (devices: readonly Device[]) => void;
}

export function useDataBundle(version: string): DataBundleState {
  const [state, setState] = useState<FetchedState>({ bundle: null, error: null });

  useEffect(() => {
    let cancelled = false;
    loadDataBundleFromReader(version, makeReader(version))
      .then((bundle) => {
        if (!cancelled) setState({ bundle, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ bundle: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const setDevices = useCallback((devices: readonly Device[]): void => {
    setState((s) =>
      s.bundle ? { bundle: { ...s.bundle, devices }, error: s.error } : s,
    );
  }, []);

  // Derive loading from version mismatch — avoids a synchronous setState
  // inside the effect (react-hooks/set-state-in-effect).
  const loading = state.bundle?.version !== version && state.error === null;
  return { ...state, loading, setDevices };
}
