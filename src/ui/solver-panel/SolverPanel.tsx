import { useMemo, useState, type FormEvent } from 'react';
import { solveThroughput, type SolveResult, type SolveTarget } from '@core/solver/index.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import { LOCALES, useI18n } from '@i18n/index.tsx';
import { useDataBundle } from './use-data-bundle.ts';
import { RecipeNodes } from './RecipeNodes.tsx';
import { RawInputsTable } from './RawInputsTable.tsx';
import { SummaryCard } from './SummaryCard.tsx';

const DEFAULT_VERSION = '1.2';

export function SolverPanel() {
  const { t, locale, setLocale } = useI18n();
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
      setSolveError(t('form.invalidRate'));
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
    return (
      <p className="p-8 text-neutral-600">{t('loading.text', { version: DEFAULT_VERSION })}</p>
    );
  }
  if (error || !bundle) {
    return (
      <p className="p-8 text-red-700">
        {t('loading.error', { message: error?.message ?? t('loading.unknownError') })}
      </p>
    );
  }

  // Toggle to the "next" locale when the language button is clicked.
  function nextLocale() {
    const idx = LOCALES.indexOf(locale);
    setLocale(LOCALES[(idx + 1) % LOCALES.length]!);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('app.title')}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {t('app.summary', {
              version: bundle.version,
              devices: bundle.devices.length,
              recipes: bundle.recipes.length,
              items: bundle.items.length,
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={nextLocale}
          className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          {t('lang.toggle')}
        </button>
      </header>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-4 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-3"
      >
        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium">{t('form.region')}</span>
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
          <span className="mb-1 font-medium">{t('form.targetItem')}</span>
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
          <span className="mb-1 font-medium">{t('form.rate')}</span>
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
              {t('form.solve')}
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
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <SummaryCard result={result} />
      <RecipeNodes result={result} bundle={bundle} />
      <RawInputsTable
        flows={result.raw_inputs}
        bundle={bundle}
        title={t('results.rawInputs')}
        emptyText={t('results.noRawInputs')}
      />
      {Object.keys(result.byproducts).length > 0 && (
        <RawInputsTable
          flows={result.byproducts}
          bundle={bundle}
          title={t('results.byproducts')}
          emptyText={t('results.noByproducts')}
        />
      )}
      {result.cycles.length > 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {t('warning.cycles', { cycles: result.cycles.join(', ') })}
        </p>
      )}
    </div>
  );
}
