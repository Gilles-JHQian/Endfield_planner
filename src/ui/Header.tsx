/** Top app header per design/handoff/components.css `.topbar` + `.brand`.
 *  Brand block on the left, route tabs in the middle, locale toggle right.
 *  Decorative dashed amber stripe sits beneath the bar.
 */
import { useI18n, LOCALES } from '@i18n/index.tsx';
import { Button } from '@ui/components/index.ts';
import { ROUTES, type Route } from './router/use-route.ts';

interface Props {
  route: Route;
  onRouteChange: (r: Route) => void;
}

const ROUTE_LABEL_KEYS: Record<Route, { en: string; cn_key: string }> = {
  editor: { en: 'EDITOR', cn_key: 'route.editor' },
  'device-editor': { en: 'DEVICE EDITOR', cn_key: 'route.deviceEditor' },
  solver: { en: 'SOLVER', cn_key: 'route.solver' },
};

export function Header({ route, onRouteChange }: Props) {
  const { t, locale, setLocale } = useI18n();

  function nextLocale(): void {
    const idx = LOCALES.indexOf(locale);
    setLocale(LOCALES[(idx + 1) % LOCALES.length]!);
  }

  return (
    <>
      <header className="relative flex h-[44px] items-stretch border-b border-line bg-surface-1">
        <div className="flex min-w-[240px] items-center gap-3 border-r border-line bg-surface-2 px-4">
          <span
            className="grid h-[22px] w-[22px] place-items-center bg-amber font-display text-[14px] font-bold text-surface-0"
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% 70%, 70% 100%, 0 100%)' }}
          >
            E
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[14px] font-semibold uppercase tracking-[1.5px]">
              ENDFIELD
            </span>
            <span className="mt-px font-cn text-[10px] tracking-[2px] text-fg-faint">
              EDA · 终末地
            </span>
          </span>
        </div>

        <nav className="flex items-stretch">
          {ROUTES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRouteChange(r)}
              className={`border-r border-line-faint px-4 font-display text-[12px] font-medium uppercase tracking-[1px] transition-colors ${
                r === route
                  ? 'bg-surface-2 text-amber'
                  : 'text-fg-soft hover:bg-surface-2 hover:text-fg'
              }`}
            >
              {ROUTE_LABEL_KEYS[r].en}
              <span className="ml-2 font-cn text-[10px] normal-case text-fg-faint">
                {t(ROUTE_LABEL_KEYS[r].cn_key)}
              </span>
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-2 px-4">
          <Button intent="ghost" onClick={nextLocale}>
            {t('lang.toggle')}
          </Button>
        </div>

        {/* Decorative amber dashed stripe below the topbar — design/handoff/components.css `.topbar::after` */}
        <span
          aria-hidden
          className="absolute -bottom-[3px] left-0 right-0 h-[2px] opacity-25"
          style={{
            background:
              'repeating-linear-gradient(90deg, var(--color-amber) 0 8px, transparent 8px 16px)',
          }}
        />
      </header>
    </>
  );
}
