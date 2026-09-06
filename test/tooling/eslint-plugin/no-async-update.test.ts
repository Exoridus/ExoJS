import { RuleTester } from 'eslint';

import { noAsyncUpdate } from '../../../packages/exojs-config/eslint/plugin/rules/no-async-update.js';

// RuleTester registers its own `describe`/`it` blocks (via the vitest
// globals this project enables) - it must run at the top level, not nested
// inside another `it()`.
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

ruleTester.run('no-async-update', noAsyncUpdate, {
  valid: [
    // Synchronous System/Scene phases and the transition hook, in every
    // shape the frame loop is actually invoked against.
    'class MyScene extends Scene { update(delta) {} }',
    'class MyScene extends Scene { fixedUpdate(step) {} }',
    'class MyScene extends Scene { draw(context) {} }',
    'class MySession { render(context, frame) {} }',
    'class MySystem { preUpdate(delta) {} }',
    'const sys = { update(delta) { return; } };',
    'const sys = { update: (delta) => {} };',
    'class MyScene extends Scene { update = (delta) => {}; }',
    // `load()`/`unload()` are genuinely asynchronous hooks - not in this
    // rule's name set.
    'class MyScene extends Scene { async load() {} }',
    'class MyScene extends Scene { async unload() {} }',
    // `init()` is covered by the existing, separate `no-restricted-syntax`
    // entry - not duplicated here.
    'class MyScene extends Scene { async init() {} }',
    // Unrelated async methods never match the covered name set.
    'class Loader { async fetchData() {} }',
    // Documented limitation: a computed key's name is not known
    // syntactically, so it is not checked.
    "class MySystem { async ['update']() {} }",
  ],
  invalid: [
    {
      code: 'class MyScene extends Scene { async update(delta) { await something(); } }',
      errors: [{ messageId: 'asyncHook', data: { name: 'update' } }],
    },
    {
      code: 'class MyScene extends Scene { async fixedUpdate(step) {} }',
      errors: [{ messageId: 'asyncHook', data: { name: 'fixedUpdate' } }],
    },
    {
      code: 'class MyScene extends Scene { async draw(context) {} }',
      errors: [{ messageId: 'asyncHook', data: { name: 'draw' } }],
    },
    {
      code: 'class MySession { async render(context, frame) {} }',
      errors: [{ messageId: 'asyncHook', data: { name: 'render' } }],
    },
    {
      code: 'class MySystem { async preUpdate(delta) {} }',
      errors: [{ messageId: 'asyncHook', data: { name: 'preUpdate' } }],
    },
    {
      code: 'const sys = { async update(delta) {} };',
      errors: [{ messageId: 'asyncHook', data: { name: 'update' } }],
    },
    {
      code: 'const sys = { update: async function (delta) {} };',
      errors: [{ messageId: 'asyncHook', data: { name: 'update' } }],
    },
    {
      code: 'const sys = { update: async (delta) => {} };',
      errors: [{ messageId: 'asyncHook', data: { name: 'update' } }],
    },
    {
      code: 'class MyScene extends Scene { update = async (delta) => {}; }',
      errors: [{ messageId: 'asyncHook', data: { name: 'update' } }],
    },
  ],
});
