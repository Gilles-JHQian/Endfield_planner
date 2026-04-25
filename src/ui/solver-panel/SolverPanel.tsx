import { useMemo, useState, type FormEvent } from 'react';
import { solveThroughput, type SolveResult, type SolveTarget } from '@core/solver/index.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import { useDataBundle } from './use-data-bundle.ts';
import { RecipeNodes } from './RecipeNodes.tsx';
import { RawInputsTable } from './RawInputsTable.tsx';
import { SummaryCard } from './SummaryCard.tsx';

const DEFAULT_VERSION = '1.2';

export function SolverPanel() {
  const { bundle, error, loading } = useDataBundle(DEFAULT_VERSION);

  const [regionId, setRegionId] = useState<string>('');
  const [itemId, setItemId] = useState<string>('item-iron-cmpt');
  const [rate, setRate] = useState<string>('30');
  const [result, setResult] = useState<SolveResult | null>(null);
  const [solveError, setSolveError] = useState<string | null>(null);

  // Default the region select to the first region once the bundle arrives.
  if (bundle && regionId === '' && bundle.regions.length > 0) {
    setRegionId(bundle.regions[0]!.id);
  }

  const itemSuggestions = useMemo(() => {
    if (!bundle) return [];
    return bundle.items.map((i) => ({ id: i.id, name: i.display_name_zh_hans }));
  }, [bundle]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!bundle) return;
    const numericRate = Number.parseFloat(rate);
    if (!Number.isFinite(numericRate) || numericRate <= 0) {
      setSolveError('请输入大于零的产能（单位：每分钟）。');
      setResult(null);
      return;
    }
    const target: SolveTarget = {
      item_id: itemId.trim(),
      rate_per_minute: numericRate,
      ...(regionId ? { region_id: regionId } : {}),
    };
    try {
      const r = solveThroughput(bundle, target);
      setResult(r);
      setSolveError(null);
    } catch (err) {
      setSolveError(err instanceof Error ? err.message : String(err));
      setResult(null);
    }
  }

  if (loading) {
    return <p className="p-8 text-neutral-600">正在加载 v{DEFAULT_VERSION} 数据 …</p>;
  }
  if (error || !bundle) {
    return <p className="p-8 text-red-700">数据加载失败：{error?.message ?? '未知错误'}</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Endfield Planner — 产能解算器</h1>
        <p className="mt-1 text-sm text-neutral-600">
          数据版本 {bundle.version} · {bundle.devices.length} 设备 · {bundle.recipes.length} 配方 ·{' '}
          {bundle.items.length} 物品
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-4 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-3"
      >
        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium">区域</span>
          <select
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1"
          >
            {bundle.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.display_name_zh_hans} ({r.id})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium">目标物品</span>
          <input
            type="text"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            list="item-suggestions"
            className="rounded border border-neutral-300 px-2 py-1 font-mono"
            placeholder="item-..."
          />
          <datalist id="item-suggestions">
            {itemSuggestions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </datalist>
        </label>

        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium">产能（每分钟）</span>
          <div className="flex gap-2">
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              min="0"
              step="any"
              className="flex-1 rounded border border-neutral-300 px-2 py-1"
            />
            <button
              type="submit"
              className="rounded bg-neutral-900 px-4 py-1 text-sm font-medium text-white hover:bg-neutral-700"
            >
              解算
            </button>
          </div>
        </label>
      </form>

      {solveError && (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {solveError}
        </p>
      )}

      {result && <ResultArea result={result} bundle={bundle} />}
    </div>
  );
}

function ResultArea({ result, bundle }: { result: SolveResult; bundle: DataBundle }) {
  return (
    <div className="space-y-6">
      <SummaryCard result={result} />
      <RecipeNodes result={result} bundle={bundle} />
      <RawInputsTable
        flows={result.raw_inputs}
        bundle={bundle}
        title="原料消耗 (raw inputs)"
        emptyText="无原料消耗 — 整条产线自给自足。"
      />
      {Object.keys(result.byproducts).length > 0 && (
        <RawInputsTable
          flows={result.byproducts}
          bundle={bundle}
          title="副产物 (byproducts)"
          emptyText="无副产物。"
        />
      )}
      {result.cycles.length > 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          检测到环路配方（已截断展开）：{result.cycles.join(', ')}
        </p>
      )}
    </div>
  );
}
