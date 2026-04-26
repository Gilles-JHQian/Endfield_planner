/** Scalar-field editor — display names + footprint W/H + power_draw / bandwidth /
 *  flags + category + tech_prereq (comma list) + recipes (comma list).
 *
 *  Field-by-field controlled inputs writing back via setField(). Number inputs
 *  silently round to integer to match schema constraints.
 */
import type { Device, DeviceCategory } from '@core/data-loader/types.ts';

interface Props {
  draft: Device;
  setField: <K extends keyof Device>(key: K, value: Device[K]) => void;
}

const CATEGORIES: readonly DeviceCategory[] = [
  'miner',
  'basic_production',
  'synthesis',
  'storage',
  'logistics',
  'power',
  'utility',
  'planting',
  'combat',
];

export function ScalarFields({ draft, setField }: Props) {
  const setFootprint = (axis: 'width' | 'height', v: number): void => {
    const safe = Math.max(1, Math.floor(v));
    setField('footprint', { ...draft.footprint, [axis]: safe });
  };
  const setIntField = <K extends 'power_draw' | 'bandwidth'>(key: K, raw: string): void => {
    const v = Math.max(0, Math.floor(Number.parseFloat(raw) || 0));
    setField(key, v as Device[K]);
  };
  const setCsv = (key: 'tech_prereq' | 'recipes', raw: string): void => {
    const arr = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    setField(key, arr as Device[typeof key]);
  };

  return (
    <div className="space-y-3">
      <Field label="ID (read-only)">
        <input
          readOnly
          value={draft.id}
          className="w-full rounded-[2px] border border-line bg-surface-2 px-2 py-1 font-tech-mono text-[11px] text-fg-faint"
        />
      </Field>
      <Field label="Display name 中文">
        <input
          type="text"
          value={draft.display_name_zh_hans}
          onChange={(e) => setField('display_name_zh_hans', e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field label="Display name EN">
        <input
          type="text"
          value={draft.display_name_en ?? ''}
          onChange={(e) => setField('display_name_en', e.target.value || undefined)}
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Footprint width">
          <input
            type="number"
            min={1}
            value={draft.footprint.width}
            onChange={(e) => setFootprint('width', Number.parseFloat(e.target.value))}
            className={inputCls}
          />
        </Field>
        <Field label="Footprint height">
          <input
            type="number"
            min={1}
            value={draft.footprint.height}
            onChange={(e) => setFootprint('height', Number.parseFloat(e.target.value))}
            className={inputCls}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Power draw">
          <input
            type="number"
            min={0}
            value={draft.power_draw}
            onChange={(e) => setIntField('power_draw', e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Bandwidth">
          <input
            type="number"
            min={0}
            value={draft.bandwidth}
            onChange={(e) => setIntField('bandwidth', e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <div className="flex gap-4">
        <CheckboxField
          label="Requires power"
          checked={draft.requires_power}
          onChange={(v) => setField('requires_power', v)}
        />
        <CheckboxField
          label="Has fluid interface"
          checked={draft.has_fluid_interface}
          onChange={(v) => setField('has_fluid_interface', v)}
        />
      </div>
      <Field label="Category">
        <select
          value={draft.category}
          onChange={(e) => setField('category', e.target.value as DeviceCategory)}
          className={inputCls}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tech prereq (comma-separated)">
        <input
          type="text"
          value={draft.tech_prereq.join(', ')}
          onChange={(e) => setCsv('tech_prereq', e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field label="Recipes (comma-separated)">
        <input
          type="text"
          value={draft.recipes.join(', ')}
          onChange={(e) => setCsv('recipes', e.target.value)}
          className={inputCls}
        />
      </Field>
    </div>
  );
}

const inputCls =
  'w-full rounded-[2px] border border-line bg-surface-0 px-2 py-1 font-tech-mono text-[11px] text-fg outline-none focus:border-amber';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block font-display text-[9px] uppercase tracking-[1.5px] text-fg-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3 accent-amber"
      />
      <span className="font-display text-[9px] uppercase tracking-[1.5px] text-fg-soft">
        {label}
      </span>
    </label>
  );
}
