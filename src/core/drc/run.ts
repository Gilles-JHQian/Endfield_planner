/** DRC engine entry point — runs every rule against the current project,
 *  separating produced Issues from rules that couldn't run because their
 *  required data wasn't loaded.
 *
 *  This is intentionally synchronous and pure. The web worker bridge
 *  (workers/drc-worker.ts) wraps it so the UI doesn't block on large layouts;
 *  tests and the device editor's preview consume it directly.
 */
import type { Project } from '@core/domain/types.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DeviceLookup } from '@core/domain/occupancy.ts';
import { ALL_RULES } from './registry.ts';
import type { DrcReport, Issue, SkippedRule } from './types.ts';

export function runDrc(project: Project, bundle: DataBundle, lookup: DeviceLookup): DrcReport {
  const issues: Issue[] = [];
  const skipped: SkippedRule[] = [];
  const ctx = { project, bundle, lookup };
  for (const rule of ALL_RULES) {
    const missing = rule.requires_data(bundle);
    if (missing.length > 0) {
      skipped.push({ rule_id: rule.id, missing });
      continue;
    }
    issues.push(...rule.run(ctx));
  }
  return { issues, skipped };
}
