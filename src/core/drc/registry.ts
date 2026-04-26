/** Single source of truth for the DRC rule list. Each rule is added here
 *  exactly once, in the order they should evaluate (which equals the order
 *  they're listed in the lint panel within their severity group).
 */
import type { Rule } from './types.ts';
import { belt001 } from './rules/belt-bandwidth.ts';
import { beltCorner001 } from './rules/belt-corner.ts';
import { beltCross001, pipeCross001 } from './rules/belt-cross.ts';
import { beltCrossDelay001 } from './rules/belt-cross-delay.ts';
import { beltParallel001 } from './rules/belt-parallel.ts';
import { beltTap001 } from './rules/belt-tap.ts';
import { layerCross001, layerCross002 } from './rules/layer-cross-infra.ts';
import { layerCross003 } from './rules/layer-cross-non-port.ts';
import { pipe001 } from './rules/pipe-bandwidth.ts';
import { port001 } from './rules/port-required-input.ts';
import { port002 } from './rules/port-output-collision.ts';
import { port003 } from './rules/port-layer-mismatch.ts';
import { port004 } from './rules/port-bridge-paired.ts';
import { power001 } from './rules/power-aoe.ts';
import { power002 } from './rules/power-balance.ts';
import { region001 } from './rules/region.ts';
import { storage001 } from './rules/storage.ts';
import { storageLine001 } from './rules/storage-line.ts';
import { storagePort001 } from './rules/storage-port.ts';
import { tech001 } from './rules/tech.ts';

export const ALL_RULES: readonly Rule[] = [
  region001,
  power001,
  power002,
  belt001,
  pipe001,
  beltCross001,
  pipeCross001,
  beltCrossDelay001,
  beltParallel001,
  beltCorner001,
  beltTap001,
  port001,
  port002,
  port003,
  port004,
  layerCross001,
  layerCross002,
  layerCross003,
  tech001,
  storage001,
  storagePort001,
  storageLine001,
];
