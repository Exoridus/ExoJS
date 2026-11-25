import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';
import { expect, it, vi } from 'vitest';

const source = ts.createSourceFile(
  'Navigation.tsx',
  readFileSync('site/src/components/Navigation.tsx', 'utf8') + readFileSync('site/src/components/ExampleBrowser.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let callback!: ts.Expression;
let syncCallback!: ts.Expression;

const visit = (node: ts.Node): void => {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'focusFilter' && node.initializer) {
    callback = node.initializer;
  }

  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'syncBreakpoints' && node.initializer) {
    syncCallback = node.initializer;
  }

  ts.forEachChild(node, visit);
};

visit(source);
const code = ts.transpileModule(`const handler = ${callback.getText(source)}; handler;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

it.each([
  '<input type="search">',
  '<textarea></textarea>',
  '<select><option>Option</option></select>',
  '<div role="textbox" class="native-edit-context"></div>',
  '<div contenteditable=""><span></span></div>',
  '<div contenteditable="plaintext-only"><span></span></div>',
  '<div class="monaco-editor"><div></div></div>',
])('keeps slash typing inside editable widgets: %s', markup => {
  const container = document.createElement('div');
  container.innerHTML = markup;
  const focus = vi.fn();
  const event = { key: '/', target: container.querySelector('span') ?? container.lastElementChild, preventDefault: vi.fn() };
  const handler = runInNewContext(code, {
    setSearchRequest: focus,
    window: { matchMedia: () => ({ matches: false }) },
    setSidebarOpen: vi.fn(),
  }) as (event: object) => void;
  handler(event);
  expect(focus).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled();
});

it.each([{ isComposing: true }, { defaultPrevented: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }])(
  'ignores a reserved or composing key: %o',
  modifiers => {
    const focus = vi.fn();
    const handler = runInNewContext(code, {
      setSearchRequest: focus,
      window: { matchMedia: () => ({ matches: false }) },
      setSidebarOpen: vi.fn(),
    }) as (event: object) => void;
    handler({ key: '/', preventDefault: vi.fn(), ...modifiers });
    expect(focus).not.toHaveBeenCalled();
  },
);

it('focuses example search for an unmodified slash outside editable widgets', () => {
  const focus = vi.fn();
  const preventDefault = vi.fn();
  const handler = runInNewContext(code, {
    breakpointRef: { current: null },
    setIsDesktop: vi.fn(),
    setIsCompactMobile: vi.fn(),
    setSearchRequest: focus,
    window: { matchMedia: () => ({ matches: false }) },
    setSidebarOpen: vi.fn(),
  }) as (event: object) => void;
  handler({ key: '/', target: document.createElement('button'), preventDefault });
  expect(focus).toHaveBeenCalledOnce();
  expect(preventDefault).toHaveBeenCalledOnce();
});

it('opens the navigation before focusing the global search', () => {
  const setSidebarOpen = vi.fn();
  const handler = runInNewContext(code, {
    breakpointRef: { current: null },
    setIsDesktop: vi.fn(),
    setIsCompactMobile: vi.fn(),
    filterRef: { current: { focus: vi.fn() } },
    window: { matchMedia: () => ({ matches: false }) },
    setSidebarOpen,
    setSearchRequest: vi.fn(),
  }) as (event: object) => void;
  handler({ key: '/', target: document.createElement('button'), preventDefault: vi.fn() });
  expect(setSidebarOpen).toHaveBeenCalledWith(true);
});

it('uses the live narrow viewport when opening search during a breakpoint change', () => {
  const setExamplesSheetOpen = vi.fn();
  const handler = runInNewContext(code, {
    breakpointRef: { current: null },
    setIsDesktop: vi.fn(),
    setIsCompactMobile: vi.fn(),
    isCompactMobile: false,
    window: { matchMedia: () => ({ matches: true }) },
    document: { activeElement: null },
    setExamplesSheetOpen,
    setExamplesSheetOpener: vi.fn(),
    setSidebarOpen: vi.fn(),
    setSearchRequest: vi.fn(),
  }) as (event: object) => void;
  handler({ key: '/', preventDefault: vi.fn() });
  expect(setExamplesSheetOpen).toHaveBeenCalledWith(true);
});

it('does not close navigation for a delayed media event already applied by the shortcut', () => {
  const setSidebarOpen = vi.fn();
  const sync = runInNewContext(
    ts.transpileModule(`const sync = ${syncCallback.getText(source)}; sync;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      breakpointRef: { current: { desktop: false, compact: false } },
      desktopMediaQuery: { matches: false },
      compactMobileMediaQuery: { matches: false },
      setIsCompactMobile: vi.fn(),
      setSidebarOpen,
      setExamplesSheetOpen: vi.fn(),
    },
  ) as () => void;
  sync();
  expect(setSidebarOpen).not.toHaveBeenCalled();
});
