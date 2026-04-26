/** Canvas toolbar per design/handoff/components.css `.canvas-toolbar`.
 *  Sits at top-left of the workspace, floats above the Konva stage.
 *  Shows the currently active tool with an amber (or teal for fluid) glow.
 */
import type { ToolApi, Tool } from './use-tool.ts';

interface Props {
  api: ToolApi;
}

interface Btn {
  match: (t: Tool) => boolean;
  onClick: (api: ToolApi) => void;
  glyph: string;
  label: string;
  variant?: 'amber' | 'teal';
}

const BUTTONS: Btn[] = [
  {
    match: (t) => t.kind === 'select',
    onClick: (a) => a.setSelect(),
    glyph: '↖',
    label: 'V · Select',
  },
  {
    match: (t) => t.kind === 'place',
    onClick: () => undefined, // place tool is set by clicking a library card
    glyph: '⊕',
    label: 'Place',
  },
  // Divider between selection-style and drawing-style tools.
  { match: () => false, onClick: () => undefined, glyph: '|', label: '|' },
  {
    match: (t) => t.kind === 'belt',
    onClick: (a) => a.setBelt(),
    glyph: '━',
    label: 'B · Belt',
    variant: 'amber',
  },
  {
    match: (t) => t.kind === 'pipe',
    onClick: (a) => a.setPipe(),
    glyph: '═',
    label: 'P · Pipe',
    variant: 'teal',
  },
  { match: () => false, onClick: () => undefined, glyph: '|', label: '|' },
  {
    match: (t) => t.kind === 'delete',
    onClick: (a) => a.setDelete(),
    glyph: '✕',
    label: 'X · Delete',
  },
];

export function Toolbar({ api }: Props) {
  return (
    <div className="absolute left-3 top-3 z-10 flex gap-1">
      {BUTTONS.map((b, i) => {
        if (b.glyph === '|') {
          return (
            <span key={`div-${i.toString()}`} className="mx-1 my-1 w-px bg-line" aria-hidden />
          );
        }
        const active = b.match(api.tool);
        const accentBg =
          b.variant === 'teal' ? 'bg-teal text-surface-0' : 'bg-amber text-surface-0';
        const accentGlow =
          b.variant === 'teal'
            ? 'shadow-[0_0_12px_var(--color-teal)]/40'
            : 'shadow-[0_0_12px_var(--color-amber)]/40';
        return (
          <button
            key={b.label}
            type="button"
            title={b.label}
            onClick={() => b.onClick(api)}
            className={`grid h-8 w-8 place-items-center rounded-[2px] border font-display text-[14px] transition-colors ${
              active
                ? `${accentBg} border-transparent ${accentGlow}`
                : 'border-line bg-surface-1 text-fg-soft hover:border-line-strong hover:bg-surface-3 hover:text-fg'
            }`}
          >
            {b.glyph}
          </button>
        );
      })}
    </div>
  );
}
