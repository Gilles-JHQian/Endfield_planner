/** Single source of truth for the DRC rule list. Each rule is added here
 *  exactly once, in the order they should evaluate (which equals the order
 *  they're listed in the lint panel within their severity group).
 */
import type { Rule } from './types.ts';
import { region001 } from './rules/region.ts';

export const ALL_RULES: readonly Rule[] = [region001];
