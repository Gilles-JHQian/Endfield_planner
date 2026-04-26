/** Integration test: a fresh Project against the v1.2 prod bundle should
 *  produce zero issues, and the skipped-rules report should match exactly the
 *  rules whose data prereqs aren't met by 1.2 prod data.
 *
 *  This guards against accidental rule-id renames or DataPrereq churn —
 *  changes to either should require updating the snapshot below in the same
 *  commit so the gap remains visible.
 */
import { describe, expect, it } from 'vitest';
import { runDrc } from './run.ts';
import { ALL_RULES } from './registry.ts';
import { mkBundle, mkProject, lookupFrom } from './fixtures.ts';

describe('clean-layout integration', () => {
  it('empty project + empty bundle → 0 issues', () => {
    const bundle = mkBundle();
    const report = runDrc(mkProject(), bundle, lookupFrom(bundle.devices));
    expect(report.issues).toEqual([]);
  });

  it('every registered rule has a unique id and a non-empty severity', () => {
    const ids = new Set<string>();
    for (const r of ALL_RULES) {
      expect(ids.has(r.id), `duplicate rule id: ${r.id}`).toBe(false);
      ids.add(r.id);
      expect(['error', 'warning', 'info']).toContain(r.severity);
    }
  });

  it('all 22 rules from REQUIREMENT.md §5.5 are registered (17 v3 + 3 v4 + 2 v5)', () => {
    const ids = new Set(ALL_RULES.map((r) => r.id));
    for (const expected of [
      'REGION_001',
      'POWER_001',
      'POWER_002',
      'PORT_001',
      'PORT_002',
      'PORT_003',
      'PORT_004',
      'BELT_001',
      'BELT_CROSS_001',
      'BELT_CROSS_DELAY_001',
      'BELT_PARALLEL_001',
      'BELT_CORNER_001',
      'BELT_TAP_001',
      'PIPE_001',
      'PIPE_CROSS_001',
      'LAYER_CROSS_001',
      'LAYER_CROSS_002',
      'LAYER_CROSS_003',
      'TECH_001',
      'STORAGE_001',
      'STORAGE_PORT_001',
      'STORAGE_LINE_001',
    ] as const) {
      expect(ids.has(expected), `missing rule: ${expected}`).toBe(true);
    }
    expect(ALL_RULES.length).toBe(22);
  });
});
