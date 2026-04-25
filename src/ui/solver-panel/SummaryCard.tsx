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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-200 bg-white p-3">
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
