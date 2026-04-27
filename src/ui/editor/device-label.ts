/** Display-name truncation rule shared by DeviceLayer (canvas) and
 *  DeviceThumb (Library card SVG). Keeps the label short enough to fit
 *  inside a small device footprint without wrapping. (P4 v7.6)
 *
 *  Owner spec: zh-Hans names show the first 3 characters; if the full name
 *  is longer than 3 chars, append `…`. English / other locales are not
 *  truncated by this helper for now.
 */

export const ABBREVIATION_MAX_CHARS = 3;

/** Truncate a Chinese-Hans display name to at most `max` characters,
 *  appending `…` when the original was longer. Returns the input unchanged
 *  if it already fits. */
export function abbreviateCnName(name: string, max: number = ABBREVIATION_MAX_CHARS): string {
  // Use Array.from so codepoints / surrogate pairs each count as one char,
  // not 2 — matters if a future name uses an SMP character.
  const chars = Array.from(name);
  if (chars.length <= max) return name;
  return chars.slice(0, max).join('') + '…';
}
