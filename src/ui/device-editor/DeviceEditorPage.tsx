/** §5.4 device editor page. Three columns:
 *  - Left (280px): searchable device list
 *  - Middle (flex): scalar fields + footprint/port grid editor
 *  - Right (260px): summary / save controls
 *
 *  The intent is owner workflow: pick a device → fill in real-game-measured
 *  values → click Save → patch lands in data/versions/<v>/devices.json (via
 *  the File System Access API or a download fallback).
 */
import { useEffect } from 'react';
import { useDataBundle } from '@ui/use-data-bundle.ts';
import { Button } from '@ui/components/index.ts';
import { DeviceList } from './DeviceList.tsx';
import { ScalarFields } from './ScalarFields.tsx';
import { PortGrid } from './PortGrid.tsx';
import { mergeEdited, saveDevicesJson, type SaveResult } from './save-devices.ts';
import { useDeviceDraft } from './use-device-draft.ts';
import { applyBaseline, useScrapedBaseline } from './use-scraped-baseline.ts';
import { useState } from 'react';

const DATA_VERSION = '1.2';

export function DeviceEditorPage() {
  const { bundle, error, loading, setDevices } = useDataBundle(DATA_VERSION);
  const draftApi = useDeviceDraft();
  const baseline = useScrapedBaseline(DATA_VERSION);
  const [saveStatus, setSaveStatus] = useState<SaveResult | null>(null);

  // Auto-load the first device on first bundle render so the right-hand pane
  // has something to show.
  useEffect(() => {
    if (bundle && !draftApi.draft && bundle.devices[0]) {
      draftApi.load(bundle.devices[0]);
    }
  }, [bundle, draftApi]);

  if (loading) {
    return (
      <div className="grid h-[calc(100vh-44px)] place-items-center font-tech-mono text-fg-soft">
        loading v{DATA_VERSION} …
      </div>
    );
  }
  if (error || !bundle) {
    return (
      <div className="grid h-[calc(100vh-44px)] place-items-center font-tech-mono text-err">
        data load failed: {error?.message ?? 'unknown'}
      </div>
    );
  }

  async function handleSave(): Promise<boolean> {
    if (!draftApi.draft || !bundle) return false;
    const merged = mergeEdited(bundle.devices, draftApi.draft);
    const result = await saveDevicesJson(bundle.devices, draftApi.draft);
    setSaveStatus(result);
    if (!result.ok) return false;
    // Reload: align the in-memory bundle with what is now on disk and
    // re-anchor the draft so `dirty` flips back to false.
    setDevices(merged);
    const refreshed = merged.find((d) => d.id === draftApi.draft!.id);
    if (refreshed) draftApi.load(refreshed);
    return true;
  }

  function handleResetToBaseline(): void {
    if (!draftApi.draft || !baseline) return;
    const baseRecord = baseline.byId.get(draftApi.draft.id);
    if (!baseRecord) {
      window.alert(
        `No scraped baseline for ${draftApi.draft.id}. This is likely a hand-authored device (e.g. logistics bridge).`,
      );
      return;
    }
    const proceed = window.confirm(
      `Reset ${draftApi.draft.display_name_zh_hans} (${draftApi.draft.id}) to scraped baseline? io_ports / power_aoe will be preserved.`,
    );
    if (!proceed) return;
    const reset = applyBaseline(draftApi.draft, baseRecord);
    draftApi.load(reset);
  }

  const baselineAvailable = baseline?.byId.has(draftApi.draft?.id ?? '') ?? false;

  return (
    <div
      className="grid h-[calc(100vh-44px)] overflow-hidden"
      style={{ gridTemplateColumns: '280px 1fr 260px' }}
    >
      <aside
        aria-label="device list"
        className="flex h-full min-h-0 flex-col overflow-hidden border-r border-line bg-surface-1"
      >
        <DeviceList
          devices={bundle.devices}
          selectedId={draftApi.draft?.id ?? null}
          onPick={draftApi.load}
        />
      </aside>

      <main className="flex h-full flex-col overflow-y-auto bg-canvas">
        {draftApi.draft && (
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section
              aria-label="scalar fields"
              className="rounded-[2px] border border-line bg-surface-1 p-3"
            >
              <h2 className="mb-3 font-display text-[10px] uppercase tracking-[1.5px] text-amber">
                FIELDS · 标量字段
              </h2>
              <ScalarFields draft={draftApi.draft} setField={draftApi.setField} />
            </section>
            <section
              aria-label="port grid"
              className="rounded-[2px] border border-line bg-surface-1 p-3"
            >
              <h2 className="mb-3 font-display text-[10px] uppercase tracking-[1.5px] text-amber">
                PORTS · 端口几何
              </h2>
              <PortGrid
                draft={draftApi.draft}
                addPort={draftApi.addPort}
                updatePort={draftApi.updatePort}
                removePort={draftApi.removePort}
              />
            </section>
          </div>
        )}
      </main>

      <aside
        aria-label="device editor save"
        className="flex flex-col border-l border-line bg-surface-1 p-3"
      >
        <h2 className="mb-2 font-display text-[10px] uppercase tracking-[1.5px] text-amber">
          SAVE · 保存
        </h2>
        <div className="mb-3 font-tech-mono text-[10px] text-fg-soft">
          {draftApi.dirty ? '● modified · 已修改' : '○ clean · 未修改'}
        </div>
        <Button
          intent="primary"
          onClick={() => {
            void handleSave();
          }}
          disabled={!draftApi.draft || !draftApi.dirty}
        >
          Save devices.json
        </Button>
        <Button
          intent="ghost"
          onClick={draftApi.reset}
          disabled={!draftApi.draft || !draftApi.dirty}
        >
          Reset edits
        </Button>
        <Button
          intent="ghost"
          onClick={handleResetToBaseline}
          disabled={!draftApi.draft || !baselineAvailable}
          title={
            baselineAvailable
              ? 'Restore the scraped fields, preserving io_ports / power_aoe'
              : 'No scraped baseline for this device'
          }
        >
          Reset to scraped
        </Button>
        {saveStatus && (
          <div className="mt-3 rounded-[2px] border border-line bg-surface-0 p-2 font-tech-mono text-[10px] text-fg-soft">
            <div className="text-fg">
              {saveStatus.via === 'fs-api' ? '✓ saved via FS API' : '⤓ downloaded'}
            </div>
            {saveStatus.message && <div className="mt-1 text-fg-faint">{saveStatus.message}</div>}
          </div>
        )}
        <p className="mt-auto pt-3 font-cn text-[10px] leading-relaxed text-fg-faint">
          编辑设备的字段后，Save 会把整份 devices.json 写回。 支持 Chrome/Edge
          直接覆盖文件；其他浏览器会下载新文件， 请手动替换 data/versions/{DATA_VERSION}
          /devices.json。
        </p>
      </aside>
    </div>
  );
}
