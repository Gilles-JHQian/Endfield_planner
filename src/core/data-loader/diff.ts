/** Report which devices/recipes are missing or changed between two data
 *  bundle versions. Implements the §5.1 F1 acceptance criterion: "Loading
 *  a project created under v1.1 into the v1.2 schema reports which
 *  devices/recipes are missing or changed."
 */
import equal from 'fast-deep-equal';
import type { DataBundle, Device, Recipe } from './types.ts';

export interface DataBundleDiff {
  /** ids present in `from` but not in `to`. */
  readonly missing_devices: readonly string[];
  /** ids present in `from` but not in `to`. */
  readonly missing_recipes: readonly string[];
  /** ids present in both, but the records differ field-by-field. */
  readonly changed_devices: readonly string[];
  /** ids present in both, but the records differ field-by-field. */
  readonly changed_recipes: readonly string[];
}

function diffById<T extends { id: string }>(
  from: readonly T[],
  to: readonly T[],
): { missing: string[]; changed: string[] } {
  const toById = new Map(to.map((x) => [x.id, x]));
  const missing: string[] = [];
  const changed: string[] = [];
  for (const item of from) {
    const candidate = toById.get(item.id);
    if (!candidate) {
      missing.push(item.id);
      continue;
    }
    if (!equal(item, candidate)) {
      changed.push(item.id);
    }
  }
  return { missing: missing.sort(), changed: changed.sort() };
}

export function diffDataBundles(from: DataBundle, to: DataBundle): DataBundleDiff {
  const devices = diffById<Device>(from.devices, to.devices);
  const recipes = diffById<Recipe>(from.recipes, to.recipes);
  return {
    missing_devices: devices.missing,
    missing_recipes: recipes.missing,
    changed_devices: devices.changed,
    changed_recipes: recipes.changed,
  };
}
