import { I18nProvider } from '@i18n/index.tsx';
import { Header } from '@ui/Header.tsx';
import { useRoute } from '@ui/router/use-route.ts';
import { EditorPage } from '@ui/editor/EditorPage.tsx';
import { DeviceEditorPage } from '@ui/device-editor/DeviceEditorPage.tsx';
import { SolverPanel } from '@ui/solver-panel/index.ts';

export function App() {
  return (
    <I18nProvider>
      <Shell />
    </I18nProvider>
  );
}

function Shell() {
  const { route, setRoute } = useRoute();
  return (
    <div className="grid h-screen grid-rows-[44px_1fr] overflow-hidden">
      <Header route={route} onRouteChange={setRoute} />
      {route === 'editor' && <EditorPage />}
      {route === 'device-editor' && <DeviceEditorPage />}
      {route === 'solver' && <SolverPanel />}
    </div>
  );
}
