/** STORAGE_001 — storage device fills with no drain (sink semantics undefined).
 *
 *  Per plan and DRC_REPORT.md §1: this rule is intentionally dormant for the
 *  Phase-2 MVP. It needs a `is_sink` flag on devices and a "drain" concept
 *  that the owner has chosen not to define yet. Registered here so the lint
 *  panel can surface it as a known-skipped rule, making the gap visible
 *  instead of mysterious.
 */
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

export const storage001: Rule = {
  id: 'STORAGE_001',
  severity: 'info',
  requires_data: (_bundle: DataBundle): DataPrereq[] => ['storage_sink_metadata'],
  run(_ctx: RuleContext): Issue[] {
    return [];
  },
};
