import { describe, expect, it } from 'vitest';
import { exportProject, importProject } from './json-io.ts';
import { createProject } from '@core/domain/project.ts';
import type { Region } from '@core/data-loader/types.ts';

const REGION: Region = {
  id: 'r',
  display_name_zh_hans: 'R',
  plot_default_size: { width: 10, height: 10 },
  core_position: { x: 0, y: 0 },
  sub_core_positions: [],
  available_tech_tiers: [],
  mining_nodes: [],
};

describe('JSON import/export round-trip', () => {
  it('survives a full export → import', () => {
    const project = createProject({ region: REGION, data_version: 'test' });
    const json = exportProject(project);
    const result = importProject(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(project.id);
      expect(result.value.region_id).toBe('r');
      expect(result.value.plot).toEqual({ width: 10, height: 10 });
    }
  });

  it('rejects malformed JSON with kind=invalid_json', () => {
    const r = importProject('{not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_json');
  });

  it('rejects a wrapper missing the schema sentinel', () => {
    const r = importProject(JSON.stringify({ schema_version: 1, project: {} }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('wrong_schema');
  });

  it('rejects an unknown schema_version', () => {
    const r = importProject(
      JSON.stringify({ schema: 'endfield-project', schema_version: 999, project: {} }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('incompatible_version');
  });

  it('rejects a project missing required fields', () => {
    const r = importProject(
      JSON.stringify({ schema: 'endfield-project', schema_version: 1, project: { id: 'x' } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_shape');
  });
});
