/** Phase 2 editor page — 4-column shell per design/handoff/reference.html.
 *  Rail (56px) / Library (280px) / Workspace (flex) / Inspector (320px).
 *  This commit is the static frame only; subsequent commits fill each column.
 */
export function EditorPage() {
  return (
    <div
      className="grid h-[calc(100vh-44px)] overflow-hidden"
      style={{
        gridTemplateColumns: 'var(--rail-w) var(--library-w) 1fr var(--inspector-w)',
      }}
    >
      <aside aria-label="category rail" className="border-r border-line bg-surface-1 px-0 py-2" />
      <aside
        aria-label="device library"
        className="flex flex-col border-r border-line bg-surface-1"
      >
        <PlaceholderPanel title="LIBRARY" cn="设备库" />
      </aside>
      <main aria-label="workspace" className="relative bg-canvas">
        <PlaceholderPanel title="WORKSPACE" cn="画布 — 即将上线" centered />
      </main>
      <aside aria-label="inspector" className="flex flex-col border-l border-line bg-surface-1">
        <PlaceholderPanel title="INSPECTOR" cn="检视器" />
      </aside>
    </div>
  );
}

function PlaceholderPanel({
  title,
  cn,
  centered = false,
}: {
  title: string;
  cn: string;
  centered?: boolean;
}) {
  return (
    <div
      className={`flex flex-col p-4 ${centered ? 'h-full items-center justify-center text-center' : ''}`}
    >
      <span className="font-display text-[11px] font-semibold uppercase tracking-[1.5px] text-fg-soft">
        {title}
      </span>
      <span className="font-cn text-[12px] text-fg-faint">{cn}</span>
    </div>
  );
}
