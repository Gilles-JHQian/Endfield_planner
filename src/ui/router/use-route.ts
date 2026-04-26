/** Minimal hash router. Three views in the SPA:
 *  #editor (default), #device-editor, #solver.
 *
 *  Hash routing keeps the app static-deployable on GitHub Pages without
 *  server-side rewrites. Upgrade to react-router only when view count > 5.
 */
import { useEffect, useState } from 'react';

export const ROUTES = ['editor', 'device-editor', 'solver'] as const;
export type Route = (typeof ROUTES)[number];
export const DEFAULT_ROUTE: Route = 'editor';

function parseHash(): Route {
  if (typeof window === 'undefined') return DEFAULT_ROUTE;
  const raw = window.location.hash.replace(/^#/, '');
  return (ROUTES as readonly string[]).includes(raw) ? (raw as Route) : DEFAULT_ROUTE;
}

export function useRoute(): { route: Route; setRoute: (r: Route) => void } {
  const [route, setRouteState] = useState<Route>(parseHash);

  useEffect(() => {
    const onHashChange = (): void => setRouteState(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setRoute = (r: Route): void => {
    window.location.hash = r;
  };

  return { route, setRoute };
}
