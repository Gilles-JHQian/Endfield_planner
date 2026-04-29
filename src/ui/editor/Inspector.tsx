/** Inspector — right-column 320px panel per design/handoff/components.css
 *  `.inspector`. Three modes (priority order):
 *
 *  - When a right-click highlight set is non-empty: selection summary
 *    (footprint cells, total power, device + link counts). Wins over the
 *    pinned-device panel because the selection is the more recent owner
 *    intent — the pin survives invisibly and returns when selection clears.
 *  - When a device is pinned (left-click in select tool): header + Properties +
 *    Ports + Recipe sections.
 *  - Otherwise: project summary (plot W×H, device count, link counts).
 */
import { useMemo, useState } from 'react';
import { useI18n } from '@i18n/index.tsx';
import { Button, KvRow, SectionHead, WarningStripe } from '@ui/components/index.ts';
import { rotatedBoundingBox } from '@core/domain/geometry.ts';
import { buildPortConnectivity, portKey } from '@core/domain/topology.ts';
import type { PlacedDevice, Project } from '@core/domain/types.ts';
import type { Device, Recipe, Region } from '@core/data-loader/types.ts';
import { RecipeSelector } from './RecipeSelector.tsx';

interface Props {
  project: Project;
  selectedInstanceId: string | null;
  lookup: (id: string) => Device | undefined;
  recipes: readonly Recipe[];
  onRecipeChange: (instance_id: string, recipe_id: string | null) => void;
  /** Right-click highlight set (devices). When non-empty the panel shows a
   *  selection summary instead of the pinned device. */
  selectedDeviceIds: ReadonlySet<string>;
  /** Right-click highlight set (links). Counted into the selection summary
   *  alongside devices. */
  selectedLinkIds: ReadonlySet<string>;
  /** Copy the current selection to the clipboard slot + history (same as Ctrl+C). */
  onCopySelection: () => void;
  /** Cut = copy + delete the current selection. */
  onCutSelection: () => void;
  /** Prompt for a name and persist the selection as a session schematic. */
  onSaveSchematic: () => void;
  /** Region catalog from the data bundle — feeds the project-summary region picker. */
  regions: readonly Region[];
  /** Commit a new project name (inline rename in the project summary). */
  onRenameProject: (name: string) => void;
  /** Commit a new region_id (project summary dropdown). */
  onChangeRegion: (region_id: string) => void;
}

export function Inspector({
  project,
  selectedInstanceId,
  lookup,
  recipes,
  onRecipeChange,
  selectedDeviceIds,
  selectedLinkIds,
  onCopySelection,
  onCutSelection,
  onSaveSchematic,
  regions,
  onRenameProject,
  onChangeRegion,
}: Props) {
  const placed = useMemo(
    () => project.devices.find((d) => d.instance_id === selectedInstanceId) ?? null,
    [project.devices, selectedInstanceId],
  );
  const device = placed ? (lookup(placed.device_id) ?? null) : null;
  // P4 v7.1: port → link reverse index for the per-port connection rows.
  const portConn = useMemo(() => buildPortConnectivity(project), [project]);

  if (selectedDeviceIds.size > 0 || selectedLinkIds.size > 0) {
    return (
      <SelectionInspector
        project={project}
        deviceIds={selectedDeviceIds}
        linkIds={selectedLinkIds}
        lookup={lookup}
        onCopy={onCopySelection}
        onCut={onCutSelection}
        onSaveSchematic={onSaveSchematic}
      />
    );
  }
  if (!placed || !device) {
    return (
      <ProjectSummary
        project={project}
        regions={regions}
        onRenameProject={onRenameProject}
        onChangeRegion={onChangeRegion}
      />
    );
  }
  return (
    <DeviceInspector
      placed={placed}
      device={device}
      recipes={recipes}
      portToLink={portConn.portToLink}
      onRecipeChange={(rid) => onRecipeChange(placed.instance_id, rid)}
    />
  );
}

function SelectionInspector({
  project,
  deviceIds,
  linkIds,
  lookup,
  onCopy,
  onCut,
  onSaveSchematic,
}: {
  project: Project;
  deviceIds: ReadonlySet<string>;
  linkIds: ReadonlySet<string>;
  lookup: (id: string) => Device | undefined;
  onCopy: () => void;
  onCut: () => void;
  onSaveSchematic: () => void;
}) {
  const { t } = useI18n();
  const stats = useMemo(() => {
    let footprintCells = 0;
    let totalPower = 0;
    let powered = 0;
    let withFluid = 0;
    let resolvedDevices = 0;
    for (const placed of project.devices) {
      if (!deviceIds.has(placed.instance_id)) continue;
      const d = lookup(placed.device_id);
      if (!d) continue;
      resolvedDevices += 1;
      footprintCells += d.footprint.width * d.footprint.height;
      if (d.requires_power) {
        powered += 1;
        totalPower += d.power_draw;
      }
      if (d.has_fluid_interface) withFluid += 1;
    }
    const solidLinks = project.solid_links.reduce((n, l) => (linkIds.has(l.id) ? n + 1 : n), 0);
    const fluidLinks = project.fluid_links.reduce((n, l) => (linkIds.has(l.id) ? n + 1 : n), 0);
    return { footprintCells, totalPower, powered, withFluid, resolvedDevices, solidLinks, fluidLinks };
  }, [project, deviceIds, linkIds, lookup]);

  return (
    <div className="flex h-full flex-col">
      <header className="relative border-b border-line bg-surface-2 px-4 pb-3 pt-3.5">
        <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber" />
        <div className="font-display text-[11px] font-semibold uppercase tracking-[1.5px] text-fg">
          {t('inspector.section.selection').toUpperCase()}
        </div>
        <div className="mt-1 font-cn text-[12px] text-fg-soft">
          {t('inspector.selection.subtitle', {
            devices: stats.resolvedDevices,
            links: stats.solidLinks + stats.fluidLinks,
          })}
        </div>
      </header>
      <div className="scroll-y flex-1">
        <div className="px-4 py-3">
          <KvRow label={t('inspector.props.footprint')}>
            {stats.footprintCells.toString()} {t('inspector.selection.cellsUnit')}
          </KvRow>
          <KvRow
            label={t('inspector.props.powerDraw')}
            {...(stats.totalPower > 0 ? { tone: 'amber' as const } : {})}
          >
            {stats.totalPower > 0 ? `${stats.totalPower.toString()} P` : '—'}
          </KvRow>
          <KvRow label={t('inspector.summary.devices')}>{stats.resolvedDevices.toString()}</KvRow>
          <KvRow label={t('inspector.selection.poweredDevices')}>{stats.powered.toString()}</KvRow>
          <KvRow label={t('inspector.selection.fluidDevices')}>{stats.withFluid.toString()}</KvRow>
          <KvRow label={t('inspector.summary.solidLinks')}>{stats.solidLinks.toString()}</KvRow>
          <KvRow label={t('inspector.summary.fluidLinks')}>{stats.fluidLinks.toString()}</KvRow>
        </div>
        <Section
          titleEn="ACTIONS"
          titleCn={t('inspector.section.selectionActions')}
        >
          <div className="flex flex-col gap-2 pt-1">
            <Button intent="primary" onClick={onSaveSchematic} disabled={stats.resolvedDevices === 0}>
              {t('inspector.selection.saveSchematic')}
            </Button>
            <div className="flex gap-2">
              <Button intent="ghost" onClick={onCopy} className="flex-1">
                {t('inspector.selection.copy')}
              </Button>
              <Button intent="ghost" onClick={onCut} className="flex-1">
                {t('inspector.selection.cut')}
              </Button>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function ProjectSummary({
  project,
  regions,
  onRenameProject,
  onChangeRegion,
}: {
  project: Project;
  regions: readonly Region[];
  onRenameProject: (name: string) => void;
  onChangeRegion: (region_id: string) => void;
}) {
  const { t } = useI18n();
  const [draftName, setDraftName] = useState<string | null>(null);

  function commitName(value: string): void {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === project.name) {
      setDraftName(null);
      return;
    }
    onRenameProject(trimmed);
    setDraftName(null);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line bg-surface-2 px-4 py-3.5">
        <div className="font-display text-[11px] font-semibold uppercase tracking-[1.5px] text-fg">
          {t('inspector.section.plotSummary').toUpperCase()}
        </div>
        <div className="mt-1 flex items-center gap-2">
          {draftName === null ? (
            <>
              <span className="font-cn text-[12px] text-fg-soft">{project.name}</span>
              <button
                type="button"
                onClick={() => setDraftName(project.name)}
                title={t('inspector.summary.editName')}
                aria-label={t('inspector.summary.editName')}
                className="rounded-[2px] px-1 font-tech-mono text-[11px] text-fg-faint transition-colors hover:bg-surface-3 hover:text-fg"
              >
                ✎
              </button>
            </>
          ) : (
            <input
              autoFocus
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={() => commitName(draftName)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitName(draftName);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setDraftName(null);
                }
              }}
              className="flex-1 rounded-[2px] border border-amber bg-surface-0 px-1.5 py-0.5 font-cn text-[12px] text-fg outline-none"
            />
          )}
        </div>
      </header>
      <div className="scroll-y flex-1">
        <div className="px-4 py-3">
          <KvRow label={t('inspector.summary.region')}>
            <select
              value={project.region_id}
              onChange={(e) => onChangeRegion(e.target.value)}
              className="ml-auto rounded-[2px] border border-line bg-surface-0 px-1.5 py-0.5 font-cn text-[11px] text-fg outline-none focus:border-amber"
            >
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name_zh_hans}
                </option>
              ))}
              {regions.find((r) => r.id === project.region_id) === undefined && (
                <option value={project.region_id}>{project.region_id}</option>
              )}
            </select>
          </KvRow>
          <KvRow label={t('inspector.props.footprint')}>
            {project.plot.width.toString()} × {project.plot.height.toString()}
          </KvRow>
          <KvRow label={t('inspector.summary.devices')}>{project.devices.length.toString()}</KvRow>
          <KvRow label={t('inspector.summary.solidLinks')}>
            {project.solid_links.length.toString()}
          </KvRow>
          <KvRow label={t('inspector.summary.fluidLinks')}>
            {project.fluid_links.length.toString()}
          </KvRow>
        </div>
        <div className="px-4 py-6 text-center font-cn text-[12px] text-fg-faint">
          {t('inspector.empty')}
          <div className="mt-2 text-[11px]">{t('inspector.emptyHint')}</div>
        </div>
      </div>
    </div>
  );
}

function DeviceInspector({
  placed,
  device,
  recipes,
  portToLink,
  onRecipeChange,
}: {
  placed: PlacedDevice;
  device: Device;
  recipes: readonly Recipe[];
  portToLink: ReadonlyMap<string, string>;
  onRecipeChange: (recipe_id: string | null) => void;
}) {
  const { t } = useI18n();
  const bbox = rotatedBoundingBox(device, placed.rotation);
  const isFluid = device.has_fluid_interface;

  return (
    <div className="flex h-full flex-col">
      <header className="relative border-b border-line bg-surface-2 px-4 pb-3 pt-3.5">
        <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber" />
        <div className="flex items-baseline gap-2">
          <h2 className="font-cn text-[16px] font-bold text-fg">{device.display_name_zh_hans}</h2>
          <span className="ml-auto rounded-[2px] border border-line-strong px-1.5 py-px font-tech-mono text-[10px] text-fg-faint">
            {device.id}
          </span>
        </div>
        <div className="mt-1 font-display text-[11px] uppercase tracking-[1.5px] text-fg-faint">
          {t(`category.${device.category}`)}
          <span className="mx-1.5 text-fg-dim">·</span>
          {device.display_name_en ?? device.id.toUpperCase()}
        </div>
      </header>
      <WarningStripe />
      <div className="scroll-y flex-1">
        <Section titleEn="PROPERTIES" titleCn={t('inspector.section.properties')}>
          <KvRow label={t('inspector.props.footprint')}>
            {bbox.width.toString()} × {bbox.height.toString()}
          </KvRow>
          <KvRow label={t('inspector.props.bandwidth')}>{device.bandwidth.toString()}</KvRow>
          <KvRow
            label={t('inspector.props.powerDraw')}
            {...(device.requires_power ? { tone: 'amber' as const } : {})}
          >
            {device.requires_power ? `${device.power_draw.toString()} P` : '—'}
          </KvRow>
          <KvRow
            label={t('inspector.props.hasFluid')}
            {...(isFluid ? { tone: 'teal' as const } : {})}
          >
            {isFluid ? t('yes') : t('no')}
          </KvRow>
          <KvRow label={t('inspector.props.position')}>
            ({placed.position.x.toString()}, {placed.position.y.toString()})
          </KvRow>
          <KvRow label={t('inspector.props.rotation')}>{placed.rotation.toString()}°</KvRow>
          {device.tech_prereq.length > 0 && (
            <KvRow label={t('inspector.props.techPrereq')}>{device.tech_prereq.join(', ')}</KvRow>
          )}
        </Section>

        <Section titleEn="PORTS" titleCn={t('inspector.section.ports')}>
          {device.io_ports.length === 0 ? (
            <div className="py-2 font-cn text-[11px] leading-relaxed text-fg-faint">
              {t('inspector.ports.empty')}
            </div>
          ) : (
            <div className="py-2 font-tech-mono text-[10px] text-fg-soft">
              <div className="mb-2 text-fg-faint">
                {t('inspector.ports.count', { count: device.io_ports.length })}
              </div>
              <div className="flex flex-col gap-0.5">
                {device.io_ports.map((p, i) => {
                  const linkId = portToLink.get(
                    portKey({ device_instance_id: placed.instance_id, port_index: i }),
                  );
                  const dirGlyph =
                    p.direction_constraint === 'input'
                      ? '◀'
                      : p.direction_constraint === 'output'
                        ? '▶'
                        : p.direction_constraint === 'paired_opposite'
                          ? '↔'
                          : '◇';
                  return (
                    <div
                      key={i.toString()}
                      className="flex items-center gap-2 border-l-2 border-line-faint pl-2"
                    >
                      <span className="w-4 text-right text-fg-faint">{i.toString()}</span>
                      <span className="w-3 text-fg-soft">{p.side}</span>
                      <span className="w-3">{dirGlyph}</span>
                      <span className="w-8 text-fg-faint">{p.kind.slice(0, 4)}</span>
                      <span className={linkId ? 'text-amber' : 'text-fg-faint'}>
                        {linkId ? linkId.slice(0, 12) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>

        <Section titleEn="RECIPE" titleCn={t('inspector.section.recipe')}>
          <RecipeSelector
            device={device}
            recipes={recipes}
            currentRecipeId={placed.recipe_id}
            onChange={onRecipeChange}
          />
        </Section>
      </div>
    </div>
  );
}

function Section({
  titleEn,
  titleCn,
  children,
}: {
  titleEn: string;
  titleCn: string;
  children: React.ReactNode;
}) {
  // SectionHead has a collapse toggle; for now we don't wire collapse state —
  // the panels are short enough that everything fits.
  return (
    <section className="border-b border-line-faint">
      <SectionHead titleEn={titleEn} titleCn={titleCn} />
      <div className="px-4 pb-3">{children}</div>
    </section>
  );
}
