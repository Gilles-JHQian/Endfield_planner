/** Footprint + per-face port editor (P4 v5).
 *
 *  Renders a W×H grid of body cells plus thin face-buttons around the
 *  perimeter — one per external face. The same cell can host up to two
 *  ports if it sits at a corner (one port per exposed face), which is
 *  required by the logistics bridges and any future multi-face device.
 *
 *  Click an empty face → adds a port at (side, offset) with default
 *  kind=solid + direction_constraint=input.
 *  Click an existing port's face → selects it; the row below the grid
 *  exposes side / offset / kind / direction_constraint editors.
 */
import { useState } from 'react';
import { rotatedBoundingBox } from '@core/domain/geometry.ts';
import type { Device, Port, PortDirection, PortKind, PortSide } from '@core/data-loader/types.ts';

interface Props {
  draft: Device;
  addPort: (port: Port) => void;
  updatePort: (port_index: number, patch: Partial<Port>) => void;
  removePort: (port_index: number) => void;
}

const BODY_PX = 28;
const FACE_PX = 12; // thickness of perimeter face buttons
const KINDS: readonly PortKind[] = ['solid', 'fluid', 'power'];
const DIRECTIONS: readonly PortDirection[] = [
  'input',
  'output',
  'bidirectional',
  'paired_opposite',
];

export function PortGrid({ draft, addPort, updatePort, removePort }: Props) {
  const { width, height } = rotatedBoundingBox(draft, 0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  function findPortOnFace(side: PortSide, offset: number): { index: number; port: Port } | null {
    for (let i = 0; i < draft.io_ports.length; i++) {
      const p = draft.io_ports[i]!;
      if (p.side === side && p.offset === offset) return { index: i, port: p };
    }
    return null;
  }

  function handleFaceClick(side: PortSide, offset: number): void {
    const existing = findPortOnFace(side, offset);
    if (existing) {
      setSelectedIdx(existing.index);
      return;
    }
    addPort({ side, offset, kind: 'solid', direction_constraint: 'input' });
    // The new port lands at the end of the array.
    setSelectedIdx(draft.io_ports.length);
  }

  // Grid coordinates: row 1 = top face strip, row 2..H+1 = body, row H+2 = bottom.
  // Col 1 = left face strip, col 2..W+1 = body, col W+2 = right.
  const totalCols = width + 2;
  const totalRows = height + 2;

  const faceButtons: { side: PortSide; offset: number; row: number; col: number }[] = [];
  for (let i = 0; i < width; i++) {
    faceButtons.push({ side: 'N', offset: i, row: 1, col: 2 + i });
    faceButtons.push({ side: 'S', offset: i, row: totalRows, col: 2 + i });
  }
  for (let j = 0; j < height; j++) {
    faceButtons.push({ side: 'W', offset: j, row: 2 + j, col: 1 });
    faceButtons.push({ side: 'E', offset: j, row: 2 + j, col: totalCols });
  }

  return (
    <div>
      <div className="mb-2 font-display text-[9px] uppercase tracking-[1.5px] text-fg-faint">
        Footprint · {width.toString()}×{height.toString()} · click a face to toggle a port
      </div>
      <div
        className="grid w-fit gap-px bg-line p-px"
        style={{
          gridTemplateColumns: `${FACE_PX.toString()}px repeat(${width.toString()}, ${BODY_PX.toString()}px) ${FACE_PX.toString()}px`,
          gridTemplateRows: `${FACE_PX.toString()}px repeat(${height.toString()}, ${BODY_PX.toString()}px) ${FACE_PX.toString()}px`,
        }}
      >
        {/* Body cells — non-clickable */}
        {Array.from({ length: height }, (_, ly) =>
          Array.from({ length: width }, (_, lx) => (
            <div
              key={`body-${lx.toString()}-${ly.toString()}`}
              className="bg-surface-2"
              style={{ gridRow: 2 + ly, gridColumn: 2 + lx }}
            />
          )),
        )}
        {/* Face buttons */}
        {faceButtons.map(({ side, offset, row, col }) => {
          const port = findPortOnFace(side, offset);
          const isSelected = selectedIdx !== null && port?.index === selectedIdx;
          const cls = port
            ? `bg-amber/40 ${isSelected ? 'ring-2 ring-amber' : ''}`
            : 'bg-surface-1 cursor-pointer hover:bg-surface-3';
          return (
            <button
              key={`face-${side}-${offset.toString()}`}
              type="button"
              onClick={() => handleFaceClick(side, offset)}
              className={`grid place-items-center font-tech-mono text-[8px] text-fg-soft ${cls}`}
              style={{ gridRow: row, gridColumn: col }}
              aria-label={`${side} face offset ${offset.toString()}`}
              title={
                port
                  ? `${side} #${offset.toString()} (${port.port.kind}, ${port.port.direction_constraint})`
                  : `Add port on ${side} face #${offset.toString()}`
              }
            >
              {port
                ? port.port.kind === 'solid'
                  ? 'S'
                  : port.port.kind === 'fluid'
                    ? 'F'
                    : 'P'
                : ''}
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-1.5">
        {draft.io_ports.length === 0 && (
          <div className="font-tech-mono text-[10px] text-fg-faint">
            No ports yet — click a face above (the thin strips around the body grid).
          </div>
        )}
        {draft.io_ports.map((port, i) => (
          <PortRow
            key={`${port.side}-${port.offset.toString()}-${i.toString()}`}
            port={port}
            selected={selectedIdx === i}
            onSelect={() => setSelectedIdx(i)}
            onUpdate={(patch) => updatePort(i, patch)}
            onRemove={() => {
              removePort(i);
              if (selectedIdx === i) setSelectedIdx(null);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function PortRow({
  port,
  selected,
  onSelect,
  onUpdate,
  onRemove,
}: {
  port: Port;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (p: Partial<Port>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
      className={`flex items-center gap-2 rounded-[2px] border p-1.5 ${
        selected ? 'border-amber bg-surface-3' : 'border-line bg-surface-1'
      }`}
    >
      <span className="font-display text-[10px] uppercase text-fg-faint">{port.side}</span>
      <input
        type="number"
        min={0}
        value={port.offset}
        onChange={(e) =>
          onUpdate({ offset: Math.max(0, Math.floor(Number.parseFloat(e.target.value) || 0)) })
        }
        onClick={(e) => e.stopPropagation()}
        className="w-12 rounded-[2px] border border-line bg-surface-0 px-1 py-0.5 font-tech-mono text-[10px] text-fg"
      />
      <select
        value={port.kind}
        onChange={(e) => onUpdate({ kind: e.target.value as PortKind })}
        onClick={(e) => e.stopPropagation()}
        className="rounded-[2px] border border-line bg-surface-0 px-1 py-0.5 font-tech-mono text-[10px] text-fg"
      >
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <select
        value={port.direction_constraint}
        onChange={(e) => onUpdate({ direction_constraint: e.target.value as PortDirection })}
        onClick={(e) => e.stopPropagation()}
        className="rounded-[2px] border border-line bg-surface-0 px-1 py-0.5 font-tech-mono text-[10px] text-fg"
      >
        {DIRECTIONS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-auto rounded-[2px] border border-line bg-surface-0 px-1.5 py-0.5 font-display text-[10px] text-err hover:border-err"
      >
        ✕
      </button>
    </div>
  );
}
