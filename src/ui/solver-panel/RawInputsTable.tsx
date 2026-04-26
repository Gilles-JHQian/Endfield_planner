import type { DataBundle } from '@core/data-loader/types.ts';
import { useI18n } from '@i18n/index.tsx';

interface Props {
  /** Map of item_id → rate per minute. */
  flows: Readonly<Record<string, number>>;
  bundle: DataBundle;
  title: string;
  emptyText: string;
}

export function RawInputsTable({ flows, bundle, title, emptyText }: Props) {
  const { t } = useI18n();
  const itemNameById = new Map(bundle.items.map((i) => [i.id, i.display_name_zh_hans]));
  const itemKindById = new Map(bundle.items.map((i) => [i.id, i.kind]));
  const entries = Object.entries(flows).sort(([a], [b]) => a.localeCompare(b));

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2.5">
        <span className="block h-3 w-1 bg-amber" aria-hidden />
        <span className="font-cn text-[14px] font-bold text-fg">{title}</span>
      </h2>
      {entries.length === 0 ? (
        <p className="rounded-[2px] border border-line bg-surface-1 p-3 font-cn text-[12px] text-fg-soft">
          {emptyText}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[2px] border border-line bg-surface-1">
          <table className="min-w-full">
            <thead className="border-b border-line-faint bg-surface-2">
              <tr className="text-left">
                <th className="px-3 py-2 font-display text-[9px] font-semibold uppercase tracking-[1.5px] text-fg-soft">
                  {t('table.item')}
                </th>
                <th className="px-3 py-2 font-display text-[9px] font-semibold uppercase tracking-[1.5px] text-fg-soft">
                  {t('table.kind')}
                </th>
                <th className="px-3 py-2 text-right font-display text-[9px] font-semibold uppercase tracking-[1.5px] text-fg-soft">
                  {t('table.ratePerMin')}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([itemId, rate]) => {
                const isFluid = itemKindById.get(itemId) === 'fluid';
                return (
                  <tr
                    key={itemId}
                    className="border-b border-line-faint last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-3 py-2">
                      <div className="font-cn text-[12px] text-fg">
                        {itemNameById.get(itemId) ?? itemId}
                      </div>
                      <div className="font-tech-mono text-[9px] text-fg-faint">{itemId}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`font-display text-[10px] uppercase tracking-[1px] ${isFluid ? 'text-teal' : 'text-amber'}`}
                      >
                        {t(isFluid ? 'kind.fluid' : 'kind.solid')}
                      </span>
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-tech-mono text-[12px] tabular-nums ${isFluid ? 'text-teal' : 'text-fg'}`}
                    >
                      {rate.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
