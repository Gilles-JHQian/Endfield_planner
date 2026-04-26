/** Project ↔ JSON serializer.
 *
 *  Output schema (v1):
 *    {
 *      schema: 'endfield-project',
 *      schema_version: 1,
 *      project: { ... full Project type ... }
 *    }
 *
 *  importProject does light structural validation (top-level shape + required
 *  Project fields) but does NOT cross-check device_id / recipe_id against any
 *  bundle — that's the caller's responsibility (it depends on which bundle
 *  is loaded). Schema-level errors raise an Error with a precise location.
 */
import type { Project, Result } from '@core/domain/types.ts';

export const SCHEMA_NAME = 'endfield-project';
export const SCHEMA_VERSION = 1;

export interface ImportError {
  readonly kind: 'invalid_json' | 'wrong_schema' | 'incompatible_version' | 'invalid_shape';
  readonly message: string;
}

export function exportProject(project: Project): string {
  const wrapper = {
    schema: SCHEMA_NAME,
    schema_version: SCHEMA_VERSION,
    project,
  };
  return JSON.stringify(wrapper, null, 2);
}

export function importProject(json: string): Result<Project, ImportError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    return { ok: false, error: { kind: 'invalid_json', message: (err as Error).message } };
  }
  if (!isObject(parsed)) {
    return {
      ok: false,
      error: { kind: 'invalid_shape', message: 'top-level value is not an object' },
    };
  }
  if (parsed.schema !== SCHEMA_NAME) {
    return {
      ok: false,
      error: {
        kind: 'wrong_schema',
        message: `expected schema=${SCHEMA_NAME}, got ${String(parsed.schema)}`,
      },
    };
  }
  if (parsed.schema_version !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        kind: 'incompatible_version',
        message: `schema_version ${String(parsed.schema_version)} not supported (this build expects ${SCHEMA_VERSION.toString()})`,
      },
    };
  }
  const proj = parsed.project;
  if (!isObject(proj)) {
    return { ok: false, error: { kind: 'invalid_shape', message: 'missing project object' } };
  }
  for (const required of [
    'id',
    'name',
    'region_id',
    'data_version',
    'plot',
    'devices',
    'solid_links',
    'fluid_links',
    'created_at',
    'updated_at',
  ]) {
    if (!(required in proj)) {
      return {
        ok: false,
        error: { kind: 'invalid_shape', message: `missing project.${required}` },
      };
    }
  }
  // Cast trusted after structural check.
  return { ok: true, value: proj as unknown as Project };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
