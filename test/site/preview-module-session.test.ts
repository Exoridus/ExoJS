// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { configureUrls } from '../../site/src/lib/url-builder';

interface PreviewHandle {
  openPreviewInTab(): void;
}

interface PreviewProps {
  exampleMeta: null;
  selectedVersionId: string;
  sourceCode: string;
  executionModules?: Readonly<Record<string, string>>;
  runId?: number;
  ref: { current: PreviewHandle | null };
}

const siteRequire = createRequire(resolve('site/package.json'));
const { act, createElement, createRef } = siteRequire('react');
const { createRoot } = siteRequire('react-dom/client');
const { EditorPreview } = await vi.importActual<{ EditorPreview(props: PreviewProps): unknown }>('../../site/src/components/EditorPreview');

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mount = () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}

      disconnect() {}
    },
  );
  configureUrls({ baseUrl: new URL('/ExoJS/', window.location.href).href });
  const host = document.createElement('div');
  const root = createRoot(host);
  const ref = createRef() as { current: PreviewHandle | null };
  const props = { exampleMeta: null, selectedVersionId: 'current', sourceCode: 'console.log("run");', ref };

  return { host, root, ref, props };
};

it('snapshots edited helpers for the iframe and new tab, then clears them on reset', async () => {
  const { host, root, ref, props } = mount();
  const modules = { 'shared/runtime.ts': 'export const edited = 1;' };

  try {
    await act(async () => root.render(createElement(EditorPreview, { ...props, executionModules: modules })));
    const frameUrl = new URL(host.querySelector('iframe')!.src);
    const modulesKey = frameUrl.searchParams.get('modules-key');
    expect(modulesKey).toBeTruthy();
    expect(JSON.parse(window.sessionStorage.getItem(modulesKey!)!)).toEqual(modules);
    modules['shared/runtime.ts'] = 'export const edited = 2;';

    const tabStorage = new Map<string, string>();
    const link = { href: '', referrerPolicy: '', click: vi.fn() };
    const tab = {
      opener: window,
      sessionStorage: { setItem: (key: string, value: string) => tabStorage.set(key, value) },
      document: { createElement: () => link },
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    ref.current!.openPreviewInTab();
    const tabUrl = new URL(link.href);
    expect(tab.opener).toBeNull();
    expect(tabStorage.get(tabUrl.searchParams.get('source-key')!)).toBe(props.sourceCode);
    expect(JSON.parse(tabStorage.get(tabUrl.searchParams.get('modules-key')!)!)).toEqual({
      'shared/runtime.ts': 'export const edited = 1;',
    });
    expect(link.click).toHaveBeenCalledOnce();

    await act(async () => root.render(createElement(EditorPreview, { ...props, executionModules: {}, runId: 1 })));
    expect(new URL(host.querySelector('iframe')!.src).searchParams.has('modules-key')).toBe(false);
    expect(window.sessionStorage.getItem(modulesKey!)).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});

it('releases an unused helper snapshot on unmount and reports storage failures without running originals', async () => {
  const { host, root, props } = mount();
  const modules = { 'shared/runtime.ts': 'export const edited = true;' };

  try {
    await act(async () => root.render(createElement(EditorPreview, { ...props, executionModules: modules })));
    const key = new URL(host.querySelector('iframe')!.src).searchParams.get('modules-key')!;
    expect(window.sessionStorage.getItem(key)).not.toBeNull();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    await act(async () => root.render(createElement(EditorPreview, { ...props, executionModules: { ...modules }, runId: 1 })));
    expect(host.querySelector('iframe')).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not prepare edited helper modules');
    expect(window.sessionStorage.getItem(key)).toBeNull();
    write.mockRestore();
    await act(async () => root.render(createElement(EditorPreview, { ...props, executionModules: modules, runId: 2 })));
    const finalKey = new URL(host.querySelector('iframe')!.src).searchParams.get('modules-key')!;
    await act(async () => root.unmount());
    expect(window.sessionStorage.getItem(finalKey)).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
