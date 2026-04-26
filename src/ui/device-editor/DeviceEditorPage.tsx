/** Device editor page — placeholder for B9. The route exists now so the
 *  router/header wiring lands in B6 once and doesn't have to be revisited.
 */
export function DeviceEditorPage() {
  return (
    <div className="grid h-[calc(100vh-44px)] place-items-center">
      <div className="text-center">
        <div className="font-display text-[14px] font-semibold uppercase tracking-[2px] text-fg-soft">
          DEVICE EDITOR
        </div>
        <div className="mt-2 font-cn text-[12px] text-fg-faint">
          设备编辑器将在 B9 上线 — 用于录入端口数据
        </div>
      </div>
    </div>
  );
}
