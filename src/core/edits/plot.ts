/** resizePlot — change the plot's W×H. Shrinking that would leave any device
 *  or link cell outside the new bounds returns a `shrink_conflict` error
 *  enumerating the offending instance ids; UI resolves by deleting them
 *  first.
 */
import { fitsInPlot } from '@core/domain/geometry.ts';
import { err, ok } from '@core/domain/types.ts';
import type { Project, Result } from '@core/domain/types.ts';
import type { DeviceLookup } from './utils.ts';

export function resizePlot(
  project: Project,
  width: number,
  height: number,
  lookup: DeviceLookup,
): Result<Project> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return err(
      'out_of_bounds',
      `Plot size must be positive integers (got ${width.toString()}×${height.toString()}).`,
    );
  }

  const newPlot = { width, height };
  const conflicts: string[] = [];

  for (const placed of project.devices) {
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    if (!fitsInPlot(dev, placed, newPlot)) conflicts.push(placed.instance_id);
  }
  for (const link of [...project.solid_links, ...project.fluid_links]) {
    for (const c of link.path) {
      if (c.x < 0 || c.y < 0 || c.x >= width || c.y >= height) {
        conflicts.push(link.id);
        break;
      }
    }
  }

  if (conflicts.length > 0) {
    return err(
      'shrink_conflict',
      `Cannot shrink plot to ${width.toString()}×${height.toString()}: ${conflicts.length.toString()} device(s)/link(s) would fall outside.`,
      { conflicts },
    );
  }

  return ok({ ...project, plot: newPlot, updated_at: new Date().toISOString() });
}
