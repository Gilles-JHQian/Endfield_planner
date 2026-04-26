/** Project factories — `createProject` for new projects from a region template,
 *  `emptyProject` for the bootstrap fallback when nothing's in LocalStorage.
 */
import type { Project, Plot, Region } from './index.ts';

let counter = 0;
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function createProject(opts: {
  region: Region;
  data_version: string;
  name?: string;
  plot?: Plot;
}): Project {
  const now = new Date().toISOString();
  return {
    id: newId('proj'),
    name: opts.name ?? `${opts.region.display_name_zh_hans} 未命名项目`,
    region_id: opts.region.id,
    data_version: opts.data_version,
    plot: opts.plot ?? opts.region.plot_default_size,
    devices: [],
    solid_links: [],
    fluid_links: [],
    created_at: now,
    updated_at: now,
  };
}

export function emptyProject(): Project {
  const now = new Date().toISOString();
  return {
    id: newId('proj'),
    name: '空项目',
    region_id: '',
    data_version: '',
    plot: { width: 50, height: 50 },
    devices: [],
    solid_links: [],
    fluid_links: [],
    created_at: now,
    updated_at: now,
  };
}

/** Internal: used by the edit functions to produce a stable, sortable id for
 *  newly created entities. Exposed so tests can spy/replace if they want
 *  deterministic ids. */
export function generateInstanceId(prefix = 'd'): string {
  return newId(prefix);
}
