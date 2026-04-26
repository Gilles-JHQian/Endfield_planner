/** addLink / deleteLink edits.
 *
 *  This commit treats links as opaque cell-paths — link-vs-link and
 *  link-vs-device crossing rules belong to DRC (B8), not to placement
 *  validation. The only invariants enforced here:
 *  - non-empty path
 *  - all path cells inside the plot
 *  - any referenced PortRef must point at an existing device + valid port_index
 */
import { err, ok } from '@core/domain/types.ts';
import { generateInstanceId } from '@core/domain/project.ts';
import type {
  Cell,
  FluidLink,
  Layer,
  PortRef,
  Project,
  Result,
  SolidLink,
} from '@core/domain/types.ts';
import { findDevice } from './utils.ts';
import type { DeviceLookup } from './utils.ts';

interface AddLinkArgs {
  project: Project;
  layer: Layer;
  tier_id: string;
  path: readonly Cell[];
  src?: PortRef;
  dst?: PortRef;
  lookup: DeviceLookup;
  /** Used by tests to pin the generated link id. */
  id?: string;
}

export function addLink({
  project,
  layer,
  tier_id,
  path,
  src,
  dst,
  lookup,
  id,
}: AddLinkArgs): Result<{ project: Project; link: SolidLink | FluidLink }> {
  if (path.length === 0) {
    return err('invalid_link', 'Link path is empty.');
  }
  for (const c of path) {
    if (c.x < 0 || c.y < 0 || c.x >= project.plot.width || c.y >= project.plot.height) {
      return err(
        'out_of_bounds',
        `Link path cell (${c.x.toString()}, ${c.y.toString()}) is outside the plot.`,
        {
          at: c,
        },
      );
    }
  }

  const portCheck = validatePortRef(project, src, lookup) ?? validatePortRef(project, dst, lookup);
  if (portCheck) return portCheck;

  const link_id = id ?? generateInstanceId('lnk');
  const updated_at = new Date().toISOString();

  if (layer === 'solid') {
    const link: SolidLink = {
      id: link_id,
      layer: 'solid',
      tier_id,
      path,
      ...(src ? { src } : {}),
      ...(dst ? { dst } : {}),
    };
    return ok({
      project: { ...project, solid_links: [...project.solid_links, link], updated_at },
      link,
    });
  }
  const link: FluidLink = {
    id: link_id,
    layer: 'fluid',
    tier_id,
    path,
    ...(src ? { src } : {}),
    ...(dst ? { dst } : {}),
  };
  return ok({
    project: { ...project, fluid_links: [...project.fluid_links, link], updated_at },
    link,
  });
}

export function deleteLink(project: Project, link_id: string): Result<Project> {
  const beforeS = project.solid_links.length;
  const beforeF = project.fluid_links.length;
  const solid_links = project.solid_links.filter((l) => l.id !== link_id);
  const fluid_links = project.fluid_links.filter((l) => l.id !== link_id);
  if (solid_links.length === beforeS && fluid_links.length === beforeF) {
    return err('not_found', `No link with id=${link_id}.`);
  }
  return ok({ ...project, solid_links, fluid_links, updated_at: new Date().toISOString() });
}

function validatePortRef(
  project: Project,
  ref: PortRef | undefined,
  lookup: DeviceLookup,
): Result<never, never> | null {
  if (!ref) return null;
  const placed = findDevice(project, ref.device_instance_id);
  if (!placed) {
    return err(
      'invalid_link',
      `PortRef references missing device ${ref.device_instance_id}.`,
    ) as Result<never, never>;
  }
  const dev = lookup(placed.device_id);
  if (!dev) return null; // catalog absence isn't strictly a link error; let DRC notice
  if (ref.port_index < 0 || ref.port_index >= dev.io_ports.length) {
    return err(
      'invalid_link',
      `PortRef ${ref.device_instance_id}#${ref.port_index.toString()} is out of range (device has ${dev.io_ports.length.toString()} ports).`,
    ) as Result<never, never>;
  }
  return null;
}
