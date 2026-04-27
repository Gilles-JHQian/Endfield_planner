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

interface SplitLinkArgs {
  project: Project;
  link_id: string;
  at_cell: Cell;
  /** PortRef the LEFT half's dst should point at (typically the new
   *  cross-bridge's port on the side the link enters). */
  left_dst: PortRef;
  /** PortRef the RIGHT half's src should point at (typically the new
   *  cross-bridge's port on the side the link exits). */
  right_src: PortRef;
  /** Pinned ids for the two halves. The auto-bridge flow needs these upfront
   *  so it can wire other links being added in the same batch. */
  ids?: { left?: string; right?: string };
}

/** Split a Link at `at_cell` into two new Links. The cell is KEPT in BOTH
 *  halves (P4 v7.1) so the resulting belt segments visually CONNECT to the
 *  bridge that triggered the split — owners reported v7's gap-on-each-side
 *  rendering looked broken. Each half ends or starts at the bridge cell,
 *  meeting the bridge device in the center.
 *
 *  Rejects splits at endpoint cells — either half would degenerate to a
 *  single cell. Endpoint placements should use `setLinkEndpoint` instead. */
export function splitLink({
  project,
  link_id,
  at_cell,
  left_dst,
  right_src,
  ids,
}: SplitLinkArgs): Result<{ project: Project; left_id: string; right_id: string }> {
  const original =
    project.solid_links.find((l) => l.id === link_id) ??
    project.fluid_links.find((l) => l.id === link_id);
  if (!original) return err('not_found', `No link with id=${link_id}.`);

  const idx = original.path.findIndex((c) => c.x === at_cell.x && c.y === at_cell.y);
  if (idx < 0) {
    return err(
      'invalid_link',
      `Link ${link_id} does not cover cell (${at_cell.x.toString()}, ${at_cell.y.toString()}).`,
    );
  }
  if (idx === 0 || idx === original.path.length - 1) {
    return err(
      'invalid_link',
      `Cannot split link ${link_id} at an endpoint cell — use setLinkEndpoint to retarget the dangling end instead.`,
      { at: at_cell },
    );
  }

  // P4 v7.1: keep at_cell in both halves so renderings meet at the bridge.
  const leftPath = original.path.slice(0, idx + 1);
  const rightPath = original.path.slice(idx);
  if (leftPath.length < 2 || rightPath.length < 2) {
    return err('invalid_link', `Split would produce an empty half.`, { at: at_cell });
  }

  const left_id = ids?.left ?? generateInstanceId('lnk');
  const right_id = ids?.right ?? generateInstanceId('lnk');
  const updated_at = new Date().toISOString();

  const baseLeft = {
    id: left_id,
    tier_id: original.tier_id,
    path: leftPath,
    ...(original.src ? { src: original.src } : {}),
    dst: left_dst,
  };
  const baseRight = {
    id: right_id,
    tier_id: original.tier_id,
    path: rightPath,
    src: right_src,
    ...(original.dst ? { dst: original.dst } : {}),
  };

  if (original.layer === 'solid') {
    const left: SolidLink = { ...baseLeft, layer: 'solid' };
    const right: SolidLink = { ...baseRight, layer: 'solid' };
    return ok({
      project: {
        ...project,
        solid_links: [...project.solid_links.filter((l) => l.id !== link_id), left, right],
        updated_at,
      },
      left_id,
      right_id,
    });
  }
  const left: FluidLink = { ...baseLeft, layer: 'fluid' };
  const right: FluidLink = { ...baseRight, layer: 'fluid' };
  return ok({
    project: {
      ...project,
      fluid_links: [...project.fluid_links.filter((l) => l.id !== link_id), left, right],
      updated_at,
    },
    left_id,
    right_id,
  });
}

/** Update a link's `src` or `dst` PortRef without touching the path (P4
 *  v7.1). Used by the place-on-belt flow when the new device sits at one
 *  of the existing belt's endpoints — no split is needed, just retarget
 *  the dangling end to the device's port. Pass `ref: undefined` to clear. */
export function setLinkEndpoint({
  project,
  link_id,
  end,
  ref,
  lookup,
}: {
  project: Project;
  link_id: string;
  end: 'src' | 'dst';
  ref: PortRef | undefined;
  lookup: DeviceLookup;
}): Result<Project> {
  const portCheck = ref ? validatePortRef(project, ref, lookup) : null;
  if (portCheck) return portCheck;
  const updated_at = new Date().toISOString();
  const updateLink = <T extends SolidLink | FluidLink>(l: T): T => {
    if (l.id !== link_id) return l;
    const next: T = { ...l };
    if (end === 'src') {
      if (ref) (next as { src?: PortRef }).src = ref;
      else delete (next as { src?: PortRef }).src;
    } else {
      if (ref) (next as { dst?: PortRef }).dst = ref;
      else delete (next as { dst?: PortRef }).dst;
    }
    return next;
  };
  const beforeS = project.solid_links;
  const beforeF = project.fluid_links;
  const solid_links = beforeS.map((l) => updateLink(l));
  const fluid_links = beforeF.map((l) => updateLink(l));
  const found = beforeS.some((l) => l.id === link_id) || beforeF.some((l) => l.id === link_id);
  if (!found) return err('not_found', `No link with id=${link_id}.`);
  return ok({ ...project, solid_links, fluid_links, updated_at });
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
