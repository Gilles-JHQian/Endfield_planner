/** DRC (Design Rule Check) type system.
 *
 *  REQUIREMENT.md §5.5 — every layout edit is checked against a rule registry.
 *  Each rule emits zero or more Issues; Issues are grouped by severity and
 *  surfaced in the lint panel. Rules whose required data isn't loaded yet
 *  are silently skipped and reported separately so the owner knows what's
 *  not being checked (rather than mistaking absence for cleanness).
 */
import type { Cell, Project } from '@core/domain/types.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DeviceLookup } from '@core/domain/occupancy.ts';

export type Severity = 'error' | 'warning' | 'info';

export type RuleId =
  | 'REGION_001'
  | 'POWER_001'
  | 'POWER_002'
  | 'PORT_001'
  | 'PORT_002'
  | 'PORT_003'
  | 'PORT_004'
  | 'BELT_001'
  | 'BELT_CROSS_001'
  | 'BELT_CROSS_DELAY_001'
  | 'BELT_PARALLEL_001'
  | 'BELT_CORNER_001'
  | 'BELT_TAP_001'
  | 'PIPE_001'
  | 'PIPE_CROSS_001'
  | 'LAYER_CROSS_001'
  | 'LAYER_CROSS_002'
  | 'LAYER_CROSS_003'
  | 'TECH_001'
  | 'STORAGE_001';

/** Data prerequisites a rule needs to produce results. When any are missing
 *  the rule is skipped and reported in DrcReport.skipped; the lint panel
 *  drawer shows the owner exactly which rules are dormant and why. */
export type DataPrereq =
  | 'transport_tiers'
  | 'power_supply'
  | 'power_aoe_supply'
  | 'io_ports'
  | 'bridge_devices_solid'
  | 'bridge_devices_fluid'
  | 'logistics_category'
  | 'tech_tree'
  | 'storage_sink_metadata';

export interface Issue {
  readonly rule_id: RuleId;
  readonly severity: Severity;
  readonly message_zh_hans: string;
  readonly message_en: string;
  /** Cells the lint panel will pan/highlight when the issue is clicked. */
  readonly cells: readonly Cell[];
  /** Optional: the offending placed device. */
  readonly device_instance_id?: string;
  /** Optional: the offending link. */
  readonly link_id?: string;
}

export interface RuleContext {
  readonly project: Project;
  readonly bundle: DataBundle;
  readonly lookup: DeviceLookup;
}

export interface Rule {
  readonly id: RuleId;
  readonly severity: Severity;
  /** Returns the list of unmet prereqs (empty = ready to run). */
  readonly requires_data: (bundle: DataBundle) => DataPrereq[];
  readonly run: (ctx: RuleContext) => Issue[];
}

export interface SkippedRule {
  readonly rule_id: RuleId;
  readonly missing: readonly DataPrereq[];
}

export interface DrcReport {
  readonly issues: readonly Issue[];
  readonly skipped: readonly SkippedRule[];
}
