import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom doesn't ship ResizeObserver; the editor's Canvas uses it to track
// container size. A minimal stub is enough for smoke tests — they don't
// exercise the actual resize callback. The empty methods are intentional.
if (typeof globalThis.ResizeObserver === 'undefined') {
  const noop = (): void => undefined;
  globalThis.ResizeObserver = class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  };
}
