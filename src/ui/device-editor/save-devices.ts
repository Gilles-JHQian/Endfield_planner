/** Save the merged devices.json out of the device editor.
 *
 *  Strategy:
 *  1. File System Access API where available (Chrome / Edge / Opera) — opens
 *     a save dialog so the owner can overwrite data/versions/<v>/devices.json
 *     directly. Persists the FileSystemFileHandle in `lastHandle` so repeat
 *     saves don't re-prompt.
 *  2. Fallback download — Firefox / Safari get a regular `<a download>` blob
 *     so they can replace the file by hand.
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
  via: 'fs-api' | 'download';
  message?: string;
}

export async function saveDevicesJson(
  allDevices: readonly Device[],
  edited: Device,
): Promise<SaveResult> {
  const merged = mergeEdited(allDevices, edited);
  const json = JSON.stringify(merged, null, 2) + '\n';

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
      return { ok: true, via: 'fs-api' };
    } catch (err) {
      // User canceled or browser refused — fall back to download.
      return downloadFallback(json, (err as Error).message);
    }
  }
  return downloadFallback(json);
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
