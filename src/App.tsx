import { SolverPanel } from '@ui/solver-panel/index.ts';
import { I18nProvider } from '@i18n/index.tsx';

export function App() {
  return (
    <I18nProvider>
      <SolverPanel />
    </I18nProvider>
  );
}
