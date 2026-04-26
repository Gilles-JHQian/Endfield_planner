/** Bottom-anchored DRC lint panel.
 *
 *  Collapsed: a 28px strip showing severity counts ("3 errors · 1 warning")
 *  and an expand toggle. Expanded: 240px scrollable area listing each issue
 *  with click-to-pan, plus a sub-section enumerating rules that didn't run
 *  due to missing data. Sits above the StatusBar (24px) at z-index 10.
 */
import { useMemo, useState } from 'react';
import { useI18n } from '@i18n/index.tsx';
import type { DrcReport, Issue, Severity, SkippedRule } from '@core/drc/index.ts';

interface Props {
  report: DrcReport;
  onIssueClick: (issue: Issue) => void;
}

const SEVERITY_TONE: Record<Severity, string> = {
  error: 'text-err border-err/40',
  warning: 'text-warn border-warn/40',
  info: 'text-teal border-teal/40',
};

export function DrcPanel({ report, onIssueClick }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const counts = useMemo(() => tally(report.issues), [report.issues]);
  const grouped = useMemo(() => groupBySeverity(report.issues), [report.issues]);

  return (
    <div className="absolute bottom-[24px] left-0 right-0 z-10 border-t border-line bg-surface-1 font-tech-mono text-[10px] text-fg-soft">
      <button
        type="button"
        className="flex w-full items-center justify-between border-b border-line px-3 py-1 hover:bg-surface-3"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t('drc.title')}
      >
        <span className="flex items-center gap-3">
          <span className="font-display text-[10px] uppercase tracking-[1.5px] text-fg-faint">
            {t('drc.title')}
          </span>
          {report.issues.length === 0 ? (
            <span className="text-good">{t('drc.clean')}</span>
          ) : (
            <span>
              <span className="text-err">
                {counts.error.toString()} {t('drc.severity.error')}
              </span>
              <span className="px-1 text-fg-faint">·</span>
              <span className="text-warn">
                {counts.warning.toString()} {t('drc.severity.warning')}
              </span>
              <span className="px-1 text-fg-faint">·</span>
              <span className="text-teal">
                {counts.info.toString()} {t('drc.severity.info')}
              </span>
            </span>
          )}
          {report.skipped.length > 0 && (
            <span className="text-fg-faint">({report.skipped.length.toString()} skipped)</span>
          )}
        </span>
        <span className="text-fg-faint">{open ? '▾' : '▴'}</span>
      </button>
      {open && (
        <div className="max-h-[240px] overflow-y-auto px-3 py-2">
          {report.issues.length === 0 && (
            <div className="py-4 text-center text-fg-faint">{t('drc.clean')}</div>
          )}
          {(['error', 'warning', 'info'] as const).map((sev) => {
            const items = grouped[sev];
            if (items.length === 0) return null;
            return (
              <section key={sev} className="mb-2">
                <h3
                  className={`mb-1 text-[9px] uppercase tracking-[1.5px] ${SEVERITY_TONE[sev]} border-l-2 pl-1.5`}
                >
                  {t(`drc.severity.${sev}`)} · {items.length.toString()}
                </h3>
                <ul className="space-y-0.5">
                  {items.map((iss, idx) => (
                    <li key={`${iss.rule_id}-${idx.toString()}`}>
                      <button
                        type="button"
                        onClick={() => onIssueClick(iss)}
                        className="flex w-full gap-2 rounded-[2px] border border-transparent px-1.5 py-0.5 text-left hover:border-line hover:bg-surface-3"
                      >
                        <span className="font-display text-[9px] uppercase tracking-[1px] text-fg-faint">
                          {iss.rule_id}
                        </span>
                        <span className="font-cn text-[10px] text-fg">{iss.message_zh_hans}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {report.skipped.length > 0 && <SkippedDrawer skipped={report.skipped} />}
        </div>
      )}
    </div>
  );
}

function SkippedDrawer({ skipped }: { skipped: readonly SkippedRule[] }) {
  const { t } = useI18n();
  return (
    <details className="mt-2 border-t border-line-faint pt-2">
      <summary className="cursor-pointer font-display text-[9px] uppercase tracking-[1.5px] text-fg-faint">
        {t('drc.skipped.title')} ({skipped.length.toString()})
      </summary>
      <ul className="mt-1 space-y-0.5 pl-3">
        {skipped.map((s) => (
          <li key={s.rule_id} className="flex gap-2">
            <span className="font-display text-[9px] uppercase tracking-[1px] text-fg-faint">
              {s.rule_id}
            </span>
            <span className="font-tech-mono text-[10px] text-fg-dim">
              missing: {s.missing.join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function tally(issues: readonly Issue[]): Record<Severity, number> {
  const out = { error: 0, warning: 0, info: 0 };
  for (const i of issues) out[i.severity]++;
  return out;
}

function groupBySeverity(issues: readonly Issue[]): Record<Severity, Issue[]> {
  const out: Record<Severity, Issue[]> = { error: [], warning: [], info: [] };
  for (const i of issues) out[i.severity].push(i);
  return out;
}
