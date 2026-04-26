/** Plot bounds — a hairline amber border with 4 corner brackets at each
 *  corner, per design/handoff/reference.html. Drawn in world coords, so
 *  pan/zoom comes from the parent Stage.
 */
import { Line, Rect } from 'react-konva';
import { useEffect, useState } from 'react';

interface Props {
  plot: { width: number; height: number };
  cellPx: number;
}

const BRACKET_LEN_CELLS = 0.6; // 60% of one cell — visually punchy at zoom 1

export function PlotRect({ plot, cellPx }: Props) {
  const w = plot.width * cellPx;
  const h = plot.height * cellPx;
  const amber = useCssColor('--color-amber', '#ff9a3d');
  const line = useCssColor('--color-line-strong', '#3d4651');

  const b = BRACKET_LEN_CELLS * cellPx;

  return (
    <>
      <Rect x={0} y={0} width={w} height={h} stroke={line} strokeWidth={1} listening={false} />
      {/* Four corner brackets — each is two short amber segments. */}
      {/* TL */}
      <Line points={[0, 0, b, 0]} stroke={amber} strokeWidth={2} listening={false} />
      <Line points={[0, 0, 0, b]} stroke={amber} strokeWidth={2} listening={false} />
      {/* TR */}
      <Line points={[w - b, 0, w, 0]} stroke={amber} strokeWidth={2} listening={false} />
      <Line points={[w, 0, w, b]} stroke={amber} strokeWidth={2} listening={false} />
      {/* BL */}
      <Line points={[0, h - b, 0, h]} stroke={amber} strokeWidth={2} listening={false} />
      <Line points={[0, h, b, h]} stroke={amber} strokeWidth={2} listening={false} />
      {/* BR */}
      <Line points={[w - b, h, w, h]} stroke={amber} strokeWidth={2} listening={false} />
      <Line points={[w, h - b, w, h]} stroke={amber} strokeWidth={2} listening={false} />
    </>
  );
}

function useCssColor(varName: string, fallback: string): string {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (v) setValue(v);
  }, [varName]);
  return value;
}
