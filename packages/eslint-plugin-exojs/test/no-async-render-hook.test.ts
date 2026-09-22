import { RuleTester } from 'eslint';

import { noAsyncRenderHook } from '../src/rules/no-async-render-hook.ts';

// RuleTester registers its own `describe`/`it` blocks (via the vitest globals
// this project enables) - it must run at the top level, not nested inside
// another `it()`.
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

ruleTester.run('no-async-render-hook', noAsyncRenderHook, {
  valid: [
    'class Pass extends RenderPass { execute(context) {} }',
    'class Effect extends Filter { apply(backend, input, output) {} }',
    'class Effect extends Filter { getOutputBounds(input, output) { output.set(0, 0, 0, 0); } }',
    // Asynchronous setup outside the frame hooks is what the engine expects.
    'class Effect extends Filter { async load() {} apply(backend, input, output) {} }',
    // The whole point of anchoring on `extends`: `execute` and `apply` are
    // ordinary words, and an unrelated class may well await inside one.
    'class Migration { async execute() {} }',
    'class Coupon { async apply(order) {} }',
    'class Layout { async getOutputBounds() {} }',
    'class Pass extends SomethingElse { async execute(context) {} }',
    // A hook name that belongs to the other base class.
    'class Pass extends RenderPass { async apply(backend) {} }',
    'class Effect extends Filter { async execute(context) {} }',
    // A mixin factory base cannot be resolved syntactically.
    'class Pass extends withLogging(RenderPass) { async execute(context) {} }',
    // A computed key is not statically the hook.
    "class Pass extends RenderPass { async ['execute'](context) {} }",
    // Static members are not the instance hook.
    'class Pass extends RenderPass { static async execute(context) {} }',
  ],
  invalid: [
    {
      code: 'class Pass extends RenderPass { async execute(context) { await this.upload(); } }',
      errors: [{ messageId: 'asyncRenderHook', data: { name: 'execute', base: 'RenderPass' } }],
    },
    {
      code: 'class Effect extends Filter { async apply(backend, input, output) {} }',
      errors: [{ messageId: 'asyncRenderHook', data: { name: 'apply', base: 'Filter' } }],
    },
    {
      code: 'class Effect extends Filter { async getOutputBounds(input, output) {} }',
      errors: [{ messageId: 'asyncRenderHook', data: { name: 'getOutputBounds', base: 'Filter' } }],
    },
    // The hook as a class field holding an async arrow.
    {
      code: 'class Pass extends RenderPass { execute = async context => {}; }',
      errors: [{ messageId: 'asyncRenderHook', data: { name: 'execute', base: 'RenderPass' } }],
    },
    {
      code: 'class Effect extends Filter { apply = async function (backend) {}; }',
      errors: [{ messageId: 'asyncRenderHook', data: { name: 'apply', base: 'Filter' } }],
    },
    // A class expression is the same class.
    {
      code: 'const Pass = class extends RenderPass { async execute(context) {} };',
      errors: [{ messageId: 'asyncRenderHook' }],
    },
    // Both filter hooks in one class.
    {
      code: 'class Effect extends Filter { async apply(b, i, o) {} async getOutputBounds(i, o) {} }',
      errors: [{ messageId: 'asyncRenderHook' }, { messageId: 'asyncRenderHook' }],
    },
    // A configured base class and hook set.
    {
      code: 'class Step extends MyEffectBase { async run(context) {} }',
      options: [{ hooks: { MyEffectBase: ['run'] } }],
      errors: [{ messageId: 'asyncRenderHook', data: { name: 'run', base: 'MyEffectBase' } }],
    },
  ],
});
