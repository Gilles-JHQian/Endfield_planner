/** Single source of truth for the DRC rule list. Each rule is added here
 *  exactly once, in the order they should evaluate (which equals the order
 *  they're listed in the lint panel within their severity group).
 */
import type { Rule } from './types.ts';
import { belt001 } from './rules/belt-bandwidth.ts';
import { layerCross003 } from './rules/layer-cross-non-port.ts';
import { pipe001 } from './rules/pipe-bandwidth.ts';
import { port001 } from './rules/port-required-input.ts';
import { port003 } from './rules/port-layer-mismatch.ts';
import { power001 } from './rules/power-aoe.ts';
import { power002 } from './rules/power-balance.ts';
import { region001 } from './rules/region.ts';

export const ALL_RULES: readonly Rule[] = [
  region001,
  power001,
  power002,
  belt001,
  pipe001,
  port001,
  port003,
  layerCross003,
];
