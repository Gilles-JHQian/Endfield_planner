/** Minimal Manhattan path planner for belt/pipe drafts.
 *
 *  This is the placeholder until the auto-router (Phase 4 / F7) lands. It
 *  walks horizontally then vertically from `from` to `to`, includes both
 *  endpoints, and yields cells in draw order. Diagonal jumps aren't legal in
 *  the game so we never emit them.
 *
 *  Status checks (path intersects a device, path leaves the plot) live in
 *  EditorPage so the ghost color reflects the same occupancy map placement
 *  uses.
 */
import type { Cell } from '@core/domain/types.ts';

export function manhattanPath(from: Cell, to: Cell): Cell[] {
  const cells: Cell[] = [{ x: from.x, y: from.y }];
  let x = from.x;
  let y = from.y;
  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    cells.push({ x, y });
  }
  while (y !== to.y) {
    y += y < to.y ? 1 : -1;
    cells.push({ x, y });
  }
  return cells;
}
