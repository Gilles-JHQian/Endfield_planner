/** setDeviceRecipe — owner's per-instance recipe binding. The recipe must be
 *  in the catalog device's `recipes[]` whitelist; null clears the binding.
 *
 *  This is the "configure what this assembler is making" step from the
 *  inspector. DRC and the future simulator key off `placed.recipe_id`.
 */
import { err, ok } from '@core/domain/types.ts';
import type { Project, Result } from '@core/domain/types.ts';
import { findDevice } from './utils.ts';
import type { DeviceLookup } from './utils.ts';

export function setDeviceRecipe(
  project: Project,
  instance_id: string,
  recipe_id: string | null,
  lookup: DeviceLookup,
): Result<Project> {
  const placed = findDevice(project, instance_id);
  if (!placed) return err('not_found', `No placed device with instance_id=${instance_id}.`);

  if (recipe_id !== null) {
    const device = lookup(placed.device_id);
    if (!device) return err('not_found', `Catalog device ${placed.device_id} missing.`);
    if (!device.recipes.includes(recipe_id)) {
      return err(
        'invalid_recipe',
        `Recipe ${recipe_id} is not in device ${device.id}'s recipes whitelist.`,
      );
    }
  }

  return ok({
    ...project,
    devices: project.devices.map((d) => (d.instance_id === instance_id ? { ...d, recipe_id } : d)),
    updated_at: new Date().toISOString(),
  });
}
