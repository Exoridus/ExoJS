import { type Application } from '@codexo/exojs';
import { renderHook } from '@testing-library/react';
import { type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExoContext, useExoContext } from '../src/ExoContext';
import { useExoApp } from '../src/useExoApp';

// A stand-in Application identity; these hooks only pass the value through the
// React context, so no behaviour is exercised on it.
const fakeApp = {} as Application;

function withProvider(app: Application | null): ({ children }: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <ExoContext.Provider value={app}>{children}</ExoContext.Provider>;
  };
}

describe('ExoContext / useExoContext', () => {
  it('useExoContext returns null when rendered outside any provider', () => {
    const { result } = renderHook(() => useExoContext());

    expect(result.current).toBeNull();
  });

  it('useExoContext returns the provided app when inside a provider', () => {
    const { result } = renderHook(() => useExoContext(), { wrapper: withProvider(fakeApp) });

    expect(result.current).toBe(fakeApp);
  });
});

describe('useExoApp', () => {
  it('returns the app from the nearest provider', () => {
    const { result } = renderHook(() => useExoApp(), { wrapper: withProvider(fakeApp) });

    expect(result.current).toBe(fakeApp);
  });

  it('throws an actionable error when used outside an <ExoCanvas> tree', () => {
    // React logs the thrown render error; silence it so the suite output stays clean.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      expect(() => renderHook(() => useExoApp())).toThrow('useExoApp must be used inside an <ExoCanvas> component.');
    } finally {
      consoleError.mockRestore();
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
