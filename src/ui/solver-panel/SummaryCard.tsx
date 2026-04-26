import type { SolveResult } from '@core/solver/index.ts';
import { useI18n } from '@i18n/index.tsx';

interface Props {
  result: SolveResult;
}

export function SummaryCard({ result }: Props) {
  const { t } = useI18n();
  const totalMachines = result.nodes.reduce((s, n) => s + n.machine_count, 0);

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat
        label={t('summary.targetRate')}
        value={`${result.target.rate_per_minute.toString()}/min`}
        accent
      />
      <Stat label={t('summary.totalMachines')} value={totalMachines.toString()} />
      <Stat label={t('summary.totalPower')} value={result.total_power_draw.toString()} />
      <Stat
        label={t('summary.totalFootprint')}
        value={`${result.total_footprint.toString()} ${t('summary.cells')}`}
      />
    </section>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="relative rounded-[2px] border border-line bg-surface-1 p-3">
      {accent && <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-amber" aria-hidden />}
      <div className="font-display text-[9px] font-semibold uppercase tracking-[1.5px] text-fg-faint">
        {label}
      </div>
      <div
        className={`mt-1 font-tech-mono text-[18px] font-semibold tabular-nums ${accent ? 'text-amber' : 'text-fg'}`}
      >
        {value}
      </div>
    </div>
  );
}
