/** Inspector — right-column 320px panel per design/handoff/components.css
 *  `.inspector`. Two modes:
 *
 *  - When a device is selected: header (CN name + EN id badge + amber stripe)
 *    + collapsible Properties section + Ports section + Recipe section.
 *  - When nothing is selected: project summary (plot W×H, device count,
 *    link counts, total power).
 */
import { useMemo } from 'react';
import { useI18n } from '@i18n/index.tsx';
import { KvRow, SectionHead, WarningStripe } from '@ui/components/index.ts';
import { rotatedBoundingBox } from '@core/domain/geometry.ts';
import type { PlacedDevice, Project } from '@core/domain/types.ts';
import type { Device } from '@core/data-loader/types.ts';

interface Props {
  project: Project;
  selectedInstanceId: string | null;
  lookup: (id: string) => Device | undefined;
}

export function Inspector({ project, selectedInstanceId, lookup }: Props) {
  const placed = useMemo(
    () => project.devices.find((d) => d.instance_id === selectedInstanceId) ?? null,
    [project.devices, selectedInstanceId],
  );
  const device = placed ? (lookup(placed.device_id) ?? null) : null;

  if (!placed || !device) {
    return <ProjectSummary project={project} />;
  }
  return <DeviceInspector placed={placed} device={device} />;
}

function ProjectSummary({ project }: { project: Project }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line bg-surface-2 px-4 py-3.5">
        <div className="font-display text-[11px] font-semibold uppercase tracking-[1.5px] text-fg">
          {t('inspector.section.plotSummary').toUpperCase()}
        </div>
        <div className="mt-1 font-cn text-[12px] text-fg-soft">{project.name}</div>
      </header>
      <div className="scroll-y flex-1">
        <div className="px-4 py-3">
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

function DeviceInspector({ placed, device }: { placed: PlacedDevice; device: Device }) {
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
            <div className="py-2 font-tech-mono text-[11px] text-fg-soft">
              {t('inspector.ports.count', { count: device.io_ports.length })}
            </div>
          )}
        </Section>

        <Section titleEn="RECIPE" titleCn={t('inspector.section.recipe')}>
          {placed.recipe_id !== null ? (
            <div className="py-2 font-tech-mono text-[12px] text-amber">{placed.recipe_id}</div>
          ) : (
            <div className="py-2 font-cn text-[11px] text-fg-faint">
              {t('inspector.recipe.none')}
            </div>
          )}
          <div className="py-2 font-tech-mono text-[10px] text-fg-faint">
            {t('inspector.recipe.placeholder')}
          </div>
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
