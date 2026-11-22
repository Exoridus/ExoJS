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

const visit = (node: ts.Node): void => {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'focusFilter' && node.initializer) {
    callback = node.initializer;
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
  const handler = runInNewContext(code, { setSearchRequest: focus, isCompactMobile: false, setSidebarOpen: vi.fn() }) as (
    event: object,
  ) => void;
  handler(event);
  expect(focus).not.toHaveBeenCalled();
  expect(event.preventDefault).not.toHaveBeenCalled();
});

it.each([{ isComposing: true }, { defaultPrevented: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }])(
  'ignores a reserved or composing key: %o',
  modifiers => {
    const focus = vi.fn();
    const handler = runInNewContext(code, { setSearchRequest: focus, isCompactMobile: false, setSidebarOpen: vi.fn() }) as (
      event: object,
    ) => void;
    handler({ key: '/', preventDefault: vi.fn(), ...modifiers });
    expect(focus).not.toHaveBeenCalled();
  },
);

it('focuses example search for an unmodified slash outside editable widgets', () => {
  const focus = vi.fn();
  const preventDefault = vi.fn();
  const handler = runInNewContext(code, { setSearchRequest: focus, isCompactMobile: false, setSidebarOpen: vi.fn() }) as (
    event: object,
  ) => void;
  handler({ key: '/', target: document.createElement('button'), preventDefault });
  expect(focus).toHaveBeenCalledOnce();
  expect(preventDefault).toHaveBeenCalledOnce();
});

it('opens the navigation before focusing the global search', () => {
  const setSidebarOpen = vi.fn();
  const handler = runInNewContext(code, {
    filterRef: { current: { focus: vi.fn() } },
    isCompactMobile: false,
    setSidebarOpen,
    setSearchRequest: vi.fn(),
  }) as (event: object) => void;
  handler({ key: '/', target: document.createElement('button'), preventDefault: vi.fn() });
  expect(setSidebarOpen).toHaveBeenCalledWith(true);
});
