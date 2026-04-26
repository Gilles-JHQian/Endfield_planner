import type { DataBundle } from '@core/data-loader/types.ts';
import type { SolveResult } from '@core/solver/index.ts';
import { useI18n } from '@i18n/index.tsx';

interface Props {
  result: SolveResult;
  bundle: DataBundle;
}

export function RecipeNodes({ result, bundle }: Props) {
  const { t } = useI18n();
  const recipeNameById = new Map(bundle.recipes.map((r) => [r.id, r.display_name_zh_hans]));
  const deviceNameById = new Map(bundle.devices.map((d) => [d.id, d.display_name_zh_hans]));

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2.5">
        <span className="block h-3 w-1 bg-amber" aria-hidden />
        <span className="font-display text-[11px] font-semibold uppercase tracking-[1.5px] text-fg">
          RECIPE NODES
        </span>
        <span className="font-cn text-[12px] text-fg-soft">{t('results.recipeNodes')}</span>
      </h2>
      <div className="overflow-x-auto rounded-[2px] border border-line bg-surface-1">
        <table className="min-w-full">
          <thead className="border-b border-line-faint bg-surface-2">
            <tr className="text-left">
              <Th>{t('table.recipe')}</Th>
              <Th>{t('table.device')}</Th>
              <Th align="right">{t('table.runsPerMin')}</Th>
              <Th align="right">{t('table.machineCount')}</Th>
              <Th align="right">{t('table.power')}</Th>
              <Th align="right">{t('table.footprint')}</Th>
            </tr>
          </thead>
          <tbody>
            {result.nodes.map((node) => (
              <tr
                key={node.recipe_id}
                className="border-b border-line-faint last:border-b-0 hover:bg-surface-2"
              >
                <Td>
                  <div className="font-cn text-fg">
                    {recipeNameById.get(node.recipe_id) ?? node.recipe_id}
                  </div>
                  <div className="font-tech-mono text-[9px] text-fg-faint">{node.recipe_id}</div>
                </Td>
                <Td>
                  {node.machine_id ? (
                    <>
                      <div className="font-cn text-fg">
                        {deviceNameById.get(node.machine_id) ?? node.machine_id}
                      </div>
                      <div className="font-tech-mono text-[9px] text-fg-faint">
                        {node.machine_id}
                      </div>
                    </>
                  ) : (
                    <span className="text-fg-dim">—</span>
                  )}
                </Td>
                <Td align="right" mono>
                  {node.runs_per_minute.toFixed(2)}
                </Td>
                <Td align="right" mono accent>
                  {node.machine_count}
                </Td>
                <Td align="right" mono>
                  {node.power_draw}
                </Td>
                <Td align="right" mono>
                  {node.footprint}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`px-3 py-2 font-display text-[9px] font-semibold uppercase tracking-[1.5px] text-fg-soft ${align === 'right' ? 'text-right' : ''}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  mono = false,
  accent = false,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2 text-[12px] tabular-nums ${align === 'right' ? 'text-right' : ''} ${
        mono ? 'font-tech-mono' : ''
      } ${accent ? 'text-amber' : ''}`}
    >
      {children}
    </td>
  );
}
