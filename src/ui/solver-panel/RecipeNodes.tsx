import type { DataBundle } from '@core/data-loader/types.ts';
import type { SolveResult } from '@core/solver/index.ts';

interface Props {
  result: SolveResult;
  bundle: DataBundle;
}

export function RecipeNodes({ result, bundle }: Props) {
  const recipeNameById = new Map(bundle.recipes.map((r) => [r.id, r.display_name_zh_hans]));
  const deviceNameById = new Map(bundle.devices.map((d) => [d.id, d.display_name_zh_hans]));

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">配方节点</h2>
      <div className="overflow-x-auto rounded border border-neutral-200">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-600">
            <tr>
              <th className="px-3 py-2">配方</th>
              <th className="px-3 py-2">设备</th>
              <th className="px-3 py-2 text-right">次/分</th>
              <th className="px-3 py-2 text-right">机器数</th>
              <th className="px-3 py-2 text-right">功耗</th>
              <th className="px-3 py-2 text-right">占地</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {result.nodes.map((node) => (
              <tr key={node.recipe_id}>
                <td className="px-3 py-2">
                  <div>{recipeNameById.get(node.recipe_id) ?? node.recipe_id}</div>
                  <div className="font-mono text-xs text-neutral-500">{node.recipe_id}</div>
                </td>
                <td className="px-3 py-2">
                  {node.machine_id ? (
                    <>
                      <div>{deviceNameById.get(node.machine_id) ?? node.machine_id}</div>
                      <div className="font-mono text-xs text-neutral-500">{node.machine_id}</div>
                    </>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {node.runs_per_minute.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{node.machine_count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{node.power_draw}</td>
                <td className="px-3 py-2 text-right tabular-nums">{node.footprint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
