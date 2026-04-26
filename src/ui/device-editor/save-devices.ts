/** Save the merged devices.json out of the device editor.
 *
 *  Save strategy (in order of preference):
 *  1. **Dev middleware** (P3): when `pnpm dev` is running, POST the JSON to
 *     /api/dev/devices and let scripts/vite-dev-api.ts write the file
 *     atomically. No browser dialog. Available only in dev builds.
 *  2. **File System Access API** where available (Chrome / Edge / Opera) —
 *     opens a save dialog so the owner can overwrite
 *     data/versions/<v>/devices.json directly. Persists the
 *     FileSystemFileHandle so repeat saves don't re-prompt.
 *  3. **Download fallback** — Firefox / Safari / cancelled FS API → blob
 *     download for manual replacement.
 *
 *  Output is merged: we take the bundle's existing devices.json and replace
 *  the edited device by id. Untouched devices pass through unchanged so the
 *  whole file (not just the diff) lands on disk.
 */
import type { Device } from '@core/data-loader/types.ts';

interface FsApiWindow {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
}

let lastHandle: FileSystemFileHandle | null = null;

export interface SaveResult {
  ok: boolean;
  via: 'dev-middleware' | 'fs-api' | 'download';
  message?: string;
}

export async function saveDevicesJson(
  allDevices: readonly Device[],
  edited: Device,
): Promise<SaveResult> {
  const merged = mergeEdited(allDevices, edited);
  const json = JSON.stringify(merged, null, 2) + '\n';

  // Dev middleware (only when running `pnpm dev` — Vite injects DEV=true).
  if (import.meta.env.DEV) {
    try {
      const r = await fetch('/api/dev/devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: json,
      });
      if (r.ok) return { ok: true, via: 'dev-middleware' };
      const err = (await r.json().catch(() => ({ error: r.statusText }))) as { error?: string };
      const msg = `dev middleware rejected: ${err.error ?? r.statusText}`;
      // Fall through to FS API on dev-API failure (caller still gets a save).
      const fsResult = await saveViaFsApi(json, msg);
      return fsResult;
    } catch (err) {
      // Network/fetch error → fall through to FS API.
      const msg = `dev middleware unreachable: ${(err as Error).message}`;
      return saveViaFsApi(json, msg);
    }
  }

  return saveViaFsApi(json);
}

async function saveViaFsApi(json: string, devMessage?: string): Promise<SaveResult> {
  const w = window as Window & FsApiWindow;
  if (w.showSaveFilePicker) {
    try {
      const handle =
        lastHandle ??
        (await w.showSaveFilePicker({
          suggestedName: 'devices.json',
          types: [{ description: 'devices.json', accept: { 'application/json': ['.json'] } }],
        }));
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      lastHandle = handle;
      return devMessage
        ? { ok: true, via: 'fs-api', message: devMessage }
        : { ok: true, via: 'fs-api' };
    } catch (err) {
      // User canceled or browser refused — fall back to download.
      return downloadFallback(json, (err as Error).message);
    }
  }
  return downloadFallback(json, devMessage);
}

export function mergeEdited(allDevices: readonly Device[], edited: Device): Device[] {
  let replaced = false;
  const out = allDevices.map((d) => {
    if (d.id !== edited.id) return d;
    replaced = true;
    return edited;
  });
  if (!replaced) out.push(edited);
  return out;
}

function downloadFallback(json: string, message?: string): SaveResult {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'devices.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return message ? { ok: true, via: 'download', message } : { ok: true, via: 'download' };
}
