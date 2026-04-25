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
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {entries.length === 0 ? (
        <p className="rounded border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
          {emptyText}
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-600">
              <tr>
                <th className="px-3 py-2">{t('table.item')}</th>
                <th className="px-3 py-2">{t('table.kind')}</th>
                <th className="px-3 py-2 text-right">{t('table.ratePerMin')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {entries.map(([itemId, rate]) => (
                <tr key={itemId}>
                  <td className="px-3 py-2">
                    <div>{itemNameById.get(itemId) ?? itemId}</div>
                    <div className="font-mono text-xs text-neutral-500">{itemId}</div>
                  </td>
                  <td className="px-3 py-2">
                    {t(itemKindById.get(itemId) === 'fluid' ? 'kind.fluid' : 'kind.solid')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{rate.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
