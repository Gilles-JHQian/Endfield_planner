/** Canvas view mode — what the user is looking at on the workspace.
 *
 *  Two of these (solid, fluid) correspond to actual transport layers from the
 *  domain model — ghost-preview tools key off them and the matching layer's
 *  links render fully opaque while the other dims. The third (power) is a
 *  visual overlay only: it dims everything else and highlights every 供电桩
 *  AoE square so the owner can see which cells are powered. There is no
 *  power Layer in the domain model (REQUIREMENT.md §4.6: power is wireless,
 *  no on-grid links).
 */
import { useState } from 'react';

export type ViewMode = 'solid' | 'fluid' | 'power';

/** Default to the layer the user is most likely to be working on. */
export const DEFAULT_VIEW_MODE: ViewMode = 'solid';

export function useViewMode(initial: ViewMode = DEFAULT_VIEW_MODE) {
  return useState<ViewMode>(initial);
}
