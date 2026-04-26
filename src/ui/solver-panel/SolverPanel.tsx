import { useMemo, useState, type FormEvent } from 'react';
import { solveThroughput, type SolveResult, type SolveTarget } from '@core/solver/index.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import { LOCALES, useI18n } from '@i18n/index.tsx';
import { Badge, Button, Pill, WarningStripe } from '@ui/components/index.ts';
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
      <p className="p-8 font-tech-mono text-fg-soft">
        {t('loading.text', { version: DEFAULT_VERSION })}
      </p>
    );
  }
  if (error || !bundle) {
    return (
      <p className="p-8 font-tech-mono text-err">
        {t('loading.error', { message: error?.message ?? t('loading.unknownError') })}
      </p>
    );
  }

  function nextLocale() {
    const idx = LOCALES.indexOf(locale);
    setLocale(LOCALES[(idx + 1) % LOCALES.length]!);
  }

  return (
    <div className="scroll-y h-full">
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-[20px] font-semibold uppercase tracking-[2px] text-amber">
              {t('app.title')}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Pill label="VER" tone="amber">
                v{bundle.version}
              </Pill>
              <Pill label="DEV">{bundle.devices.length}</Pill>
              <Pill label="REC">{bundle.recipes.length}</Pill>
              <Pill label="ITEM">{bundle.items.length}</Pill>
            </div>
          </div>
          <Button intent="ghost" onClick={nextLocale}>
            {t('lang.toggle')}
          </Button>
        </header>

        <WarningStripe />

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 rounded-[2px] border border-line bg-surface-1 p-4 sm:grid-cols-3"
        >
          <Field label={t('form.region')}>
            <select
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              className="rounded-[2px] border border-line bg-surface-0 px-2 py-1 font-cn text-fg outline-none focus:border-amber"
            >
              {bundle.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name_zh_hans} ({r.id})
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('form.targetItem')}>
            <input
              type="text"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              list="item-suggestions"
              placeholder="item-..."
              className="rounded-[2px] border border-line bg-surface-0 px-2 py-1 font-tech-mono text-fg placeholder:text-fg-dim focus:border-amber focus:outline-none"
            />
            <datalist id="item-suggestions">
              {itemSuggestions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </datalist>
          </Field>

          <Field label={t('form.rate')}>
            <div className="flex gap-2">
              <input
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                min="0"
                step="any"
                className="flex-1 rounded-[2px] border border-line bg-surface-0 px-2 py-1 text-right font-tech-mono text-amber focus:border-amber focus:outline-none"
              />
              <Button type="submit">{t('form.solve')}</Button>
            </div>
          </Field>
        </form>

        {solveError && (
          <p className="flex items-start gap-3 rounded-[2px] border-l-2 border-err bg-err/10 p-3 font-cn text-[12px] text-err">
            <Badge severity="err">ERR</Badge>
            {solveError}
          </p>
        )}

        {result && <ResultArea result={result} bundle={bundle} />}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-display text-[10px] font-semibold uppercase tracking-[1.5px] text-fg-soft">
        {label}
      </span>
      {children}
    </label>
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
        <p className="flex items-start gap-3 rounded-[2px] border-l-2 border-warn bg-warn/10 p-3 font-cn text-[12px] text-warn">
          <Badge severity="warn">CYC</Badge>
          {t('warning.cycles', { cycles: result.cycles.join(', ') })}
        </p>
      )}
    </div>
  );
}
