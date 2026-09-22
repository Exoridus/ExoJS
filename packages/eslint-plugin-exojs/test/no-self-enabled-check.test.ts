import { RuleTester } from 'eslint';

import { noSelfEnabledCheck } from '../src/rules/no-self-enabled-check.ts';

// RuleTester registers its own `describe`/`it` blocks (via the vitest globals
// this project enables) - it must run at the top level, not nested inside
// another `it()`.
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

ruleTester.run('no-self-enabled-check', noSelfEnabledCheck, {
  valid: [
    'class Pass extends RenderPass { execute(context) { this.draw(context); } }',
    // The mechanism a pipeline uses: `enabled` read on a CHILD pass.
    'class Pipeline extends RenderPass { execute(context) { for (const pass of this.passes) { if (pass.enabled) pass.execute(context); } } }',
    'class Pass extends RenderPass { execute(context) { if (this.child.enabled) this.child.execute(context); } }',
    // Writing the flag is not the defect the rule describes.
    'class Pass extends RenderPass { execute(context) { this.enabled = false; } }',
    // Other methods of the same class are the pass's own business.
    'class Pass extends RenderPass { resize(w, h) { if (this.enabled) this.rebuild(w, h); } }',
    'class Pass extends RenderPass { destroy() { this.enabled = this.enabled && false; } }',
    // Not a render pass by its `extends` clause.
    'class Widget { execute(context) { if (!this.enabled) return; } }',
    'class Widget extends Container { execute(context) { if (!this.enabled) return; } }',
    // A nested `function` rebinds `this`, so the read is about something else.
    'class Pass extends RenderPass { execute(context) { const f = function () { return this.enabled; }; f.call(context); } }',
    // A computed key is not statically the hook.
    "class Pass extends RenderPass { ['execute'](context) { if (!this.enabled) return; } }",
  ],
  invalid: [
    // The shape the base class's doc comment forbids by name.
    {
      code: 'class Pass extends RenderPass { execute(context) { if (!this.enabled) return; this.draw(context); } }',
      errors: [{ messageId: 'selfEnabledCheck', data: { hook: 'execute' } }],
    },
    // A pattern check, not a position check: the same guard thirty lines down.
    {
      code: 'class Pass extends RenderPass { execute(context) { this.prepare(); this.measure(); if (this.enabled === false) return; this.draw(context); } }',
      errors: [{ messageId: 'selfEnabledCheck' }],
    },
    // Not a guard at all - any read counts.
    {
      code: 'class Pass extends RenderPass { execute(context) { context.setFlag(this.enabled); } }',
      errors: [{ messageId: 'selfEnabledCheck' }],
    },
    // A compound assignment reads before it writes.
    {
      code: 'class Pass extends RenderPass { execute(context) { this.enabled &&= context.ready; } }',
      errors: [{ messageId: 'selfEnabledCheck' }],
    },
    // Arrow functions are transparent to `this`, so an inline callback counts.
    {
      code: 'class Pass extends RenderPass { execute(context) { this.passes.forEach(p => { if (this.enabled) p.execute(context); }); } }',
      errors: [{ messageId: 'selfEnabledCheck' }],
    },
    // The hook as a class field holding an arrow.
    {
      code: 'class Pass extends RenderPass { execute = context => { if (!this.enabled) return; }; }',
      errors: [{ messageId: 'selfEnabledCheck' }],
    },
    // Two reads, two reports.
    {
      code: 'class Pass extends RenderPass { execute(context) { if (!this.enabled) return; log(this.enabled); } }',
      errors: [{ messageId: 'selfEnabledCheck' }, { messageId: 'selfEnabledCheck' }],
    },
    // A configured base class.
    {
      code: 'class Pass extends EffectPass { execute(context) { if (!this.enabled) return; } }',
      options: [{ baseClasses: ['EffectPass'] }],
      errors: [{ messageId: 'selfEnabledCheck' }],
    },
    // A configured hook name.
    {
      code: 'class Pass extends RenderPass { run(context) { if (!this.enabled) return; } }',
      options: [{ hook: 'run' }],
      errors: [{ messageId: 'selfEnabledCheck', data: { hook: 'run' } }],
    },
  ],
});
