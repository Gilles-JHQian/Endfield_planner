/** Per-instance recipe binding control — owner picks which recipe a placed
 *  device is currently running. Dropdown filtered to device.recipes[] so
 *  invalid combinations can't be selected (the setDeviceRecipe edit also
 *  enforces this contractually).
 */
import { useMemo } from 'react';
import { useI18n } from '@i18n/index.tsx';
import type { Device, Recipe } from '@core/data-loader/types.ts';

interface Props {
  device: Device;
  recipes: readonly Recipe[];
  currentRecipeId: string | null;
  onChange: (recipe_id: string | null) => void;
}

export function RecipeSelector({ device, recipes, currentRecipeId, onChange }: Props) {
  const { t } = useI18n();

  const candidates = useMemo(() => {
    const allowed = new Set(device.recipes);
    return recipes.filter((r) => allowed.has(r.id));
  }, [device.recipes, recipes]);

  const current = useMemo(
    () => candidates.find((r) => r.id === currentRecipeId) ?? null,
    [candidates, currentRecipeId],
  );

  if (device.recipes.length === 0) {
    return (
      <div className="py-2 font-cn text-[11px] text-fg-faint">
        {t('inspector.recipe.noRecipes')}
      </div>
    );
  }

  return (
    <div className="space-y-2 py-1">
      <select
        value={currentRecipeId ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        className="w-full rounded-[2px] border border-line bg-surface-0 px-2 py-1 font-cn text-[12px] text-fg outline-none focus:border-amber"
      >
        <option value="">— {t('inspector.recipe.none')} —</option>
        {candidates.map((r) => (
          <option key={r.id} value={r.id}>
            {r.display_name_zh_hans} · {r.cycle_seconds.toString()}s
          </option>
        ))}
      </select>

      {current && (
        <div className="space-y-1.5 rounded-[2px] border border-line-faint bg-surface-0 p-2">
          <ItemPills label={t('inspector.recipe.inputs')} items={current.inputs} tone="teal" />
          <ItemPills label={t('inspector.recipe.outputs')} items={current.outputs} tone="amber" />
          <div className="flex justify-between border-t border-dashed border-line-faint pt-1.5 font-tech-mono text-[10px] text-fg-faint">
            <span>{t('inspector.recipe.cycle')}</span>
            <span className="text-fg">{current.cycle_seconds.toString()}s</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemPills({
  label,
  items,
  tone,
}: {
  label: string;
  items: readonly { item_id: string; qty_per_cycle: number }[];
  tone: 'amber' | 'teal';
}) {
  const toneText = tone === 'amber' ? 'text-amber border-amber-deep' : 'text-teal border-teal-deep';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-display text-[9px] uppercase tracking-[1.5px] text-fg-faint">
        {label}
      </span>
      {items.map((it) => (
        <span
          key={it.item_id}
          className={`inline-flex items-center gap-1 rounded-[2px] border bg-surface-1 px-1.5 py-px font-tech-mono text-[10px] ${toneText}`}
        >
          {it.item_id}
          <span className="text-fg-soft">×{it.qty_per_cycle.toString()}</span>
        </span>
      ))}
    </div>
  );
}
