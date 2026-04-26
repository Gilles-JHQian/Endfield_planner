/** Footprint + port grid editor.
 *
 *  Renders a W×H grid of cells. Perimeter cells (border of the footprint) are
 *  clickable: clicking an empty perimeter cell adds a new port at that
 *  (side, offset); clicking an existing port cell selects it for editing.
 *
 *  Below the grid, a port list with side/offset/kind/direction_constraint
 *  controls. Clicking the trash icon removes the port.
 */
import { useState } from 'react';
import { rotatedBoundingBox } from '@core/domain/geometry.ts';
import type { Port, PortDirection, PortKind, PortSide } from '@core/data-loader/types.ts';
import type { Device } from '@core/data-loader/types.ts';

interface Props {
  draft: Device;
  addPort: (port: Port) => void;
  updatePort: (port_index: number, patch: Partial<Port>) => void;
  removePort: (port_index: number) => void;
}

const CELL_PX = 24;
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

  function portAtCell(lx: number, ly: number): { index: number; port: Port } | null {
    for (let i = 0; i < draft.io_ports.length; i++) {
      const p = draft.io_ports[i]!;
      const cell = portLocalCell(p, width, height);
      if (cell.x === lx && cell.y === ly) return { index: i, port: p };
    }
    return null;
  }

  function portOnSide(side: PortSide): { index: number; port: Port } | null {
    for (let i = 0; i < draft.io_ports.length; i++) {
      const p = draft.io_ports[i]!;
      if (p.side === side) return { index: i, port: p };
    }
    return null;
  }

  function handleCellClick(lx: number, ly: number): void {
    const side = sideOf(lx, ly, width, height);
    if (!side) return; // interior cell
    const existing = portAtCell(lx, ly);
    if (existing) {
      setSelectedIdx(existing.index);
      return;
    }
    const offset = side === 'N' || side === 'S' ? lx : ly;
    addPort({ side, offset, kind: 'solid', direction_constraint: 'input' });
    setSelectedIdx(draft.io_ports.length); // index it'll have after the add
  }

  function handleSideClick(side: PortSide): void {
    // Used by the 1×1 special layout: side maps unambiguously to one slot.
    const existing = portOnSide(side);
    if (existing) {
      setSelectedIdx(existing.index);
      return;
    }
    addPort({ side, offset: 0, kind: 'solid', direction_constraint: 'input' });
    setSelectedIdx(draft.io_ports.length);
  }

  return (
    <div>
      <div className="mb-2 font-display text-[9px] uppercase tracking-[1.5px] text-fg-faint">
        Footprint · {width.toString()}×{height.toString()}
      </div>
      {width === 1 && height === 1 ? (
        <OneByOneGrid
          portOnSide={portOnSide}
          selectedIdx={selectedIdx}
          onSideClick={handleSideClick}
        />
      ) : (
        <div
          className="grid gap-px bg-line p-px"
          style={{
            width: width * CELL_PX + (width + 1),
            gridTemplateColumns: `repeat(${width.toString()}, ${CELL_PX.toString()}px)`,
          }}
        >
          {Array.from({ length: height }, (_, ly) =>
            Array.from({ length: width }, (_, lx) => {
              const side = sideOf(lx, ly, width, height);
              const port = portAtCell(lx, ly);
              const cls = !side
                ? 'bg-surface-2'
                : port
                  ? `bg-amber/30 border-amber ${selectedIdx === port.index ? 'ring-2 ring-amber' : ''}`
                  : 'bg-surface-1 hover:bg-surface-3 cursor-pointer';
              return (
                <button
                  key={`${lx.toString()}-${ly.toString()}`}
                  type="button"
                  onClick={() => handleCellClick(lx, ly)}
                  className={`grid h-[24px] w-[24px] place-items-center font-tech-mono text-[8px] ${cls}`}
                  disabled={!side}
                  aria-label={
                    side
                      ? `cell ${lx.toString()},${ly.toString()} (${side})`
                      : `interior ${lx.toString()},${ly.toString()}`
                  }
                >
                  {port ? port.port.kind[0]?.toUpperCase() : ''}
                </button>
              );
            }),
          )}
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {draft.io_ports.length === 0 && (
          <div className="font-tech-mono text-[10px] text-fg-faint">
            No ports yet — click a perimeter cell above.
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

/** Special layout for 1×1 devices (logistics bridges): the single cell can't
 *  resolve to four sides on its own, so we render the cell + four perimeter
 *  buttons positioned N / E / S / W around it. Each side maps unambiguously
 *  to a port slot (offset 0). */
function OneByOneGrid({
  portOnSide,
  selectedIdx,
  onSideClick,
}: {
  portOnSide: (s: PortSide) => { index: number; port: Port } | null;
  selectedIdx: number | null;
  onSideClick: (s: PortSide) => void;
}) {
  const SIDES: { side: PortSide; row: number; col: number; label: string }[] = [
    { side: 'N', row: 1, col: 2, label: 'N' },
    { side: 'W', row: 2, col: 1, label: 'W' },
    { side: 'E', row: 2, col: 3, label: 'E' },
    { side: 'S', row: 3, col: 2, label: 'S' },
  ];
  return (
    <div
      className="grid w-fit gap-px bg-line p-px"
      style={{ gridTemplateColumns: 'repeat(3, 28px)', gridTemplateRows: 'repeat(3, 28px)' }}
    >
      {/* Center body cell, non-clickable */}
      <div
        className="grid bg-surface-2 font-tech-mono text-[8px] text-fg-faint"
        style={{ gridRow: 2, gridColumn: 2, placeItems: 'center' }}
      >
        1×1
      </div>
      {SIDES.map(({ side, row, col, label }) => {
        const port = portOnSide(side);
        const cls = port
          ? `bg-amber/30 border-amber ${selectedIdx === port.index ? 'ring-2 ring-amber' : ''}`
          : 'bg-surface-1 hover:bg-surface-3 cursor-pointer';
        return (
          <button
            key={side}
            type="button"
            onClick={() => onSideClick(side)}
            className={`grid place-items-center font-tech-mono text-[9px] ${cls}`}
            style={{ gridRow: row, gridColumn: col }}
            aria-label={`side ${label}`}
          >
            {port ? port.port.kind[0]?.toUpperCase() : label}
          </button>
        );
      })}
    </div>
  );
}

function sideOf(lx: number, ly: number, w: number, h: number): PortSide | null {
  if (ly === 0) return 'N';
  if (ly === h - 1) return 'S';
  if (lx === 0) return 'W';
  if (lx === w - 1) return 'E';
  return null;
}

function portLocalCell(port: Pick<Port, 'side' | 'offset'>, w: number, h: number) {
  switch (port.side) {
    case 'N':
      return { x: port.offset, y: 0 };
    case 'S':
      return { x: port.offset, y: h - 1 };
    case 'W':
      return { x: 0, y: port.offset };
    case 'E':
      return { x: w - 1, y: port.offset };
  }
}
