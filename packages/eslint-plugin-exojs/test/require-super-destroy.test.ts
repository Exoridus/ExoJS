import { RuleTester } from 'eslint';

import { requireSuperDestroy } from '../src/rules/require-super-destroy.ts';

// RuleTester registers its own `describe`/`it` blocks (via the vitest globals
// this project enables) - it must run at the top level, not nested inside
// another `it()`.
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

ruleTester.run('require-super-destroy', requireSuperDestroy, {
  valid: [
    'class Node extends Container { destroy() { super.destroy(); } }',
    'class Node extends Container { destroy() { this.release(); super.destroy(); } }',
    // Position does not matter, only that the chain happens.
    'class Node extends Container { destroy() { if (this.destroyed) return; super.destroy(); this.free(); } }',
    // Chained inside a branch is still a chain the rule can see.
    'class Node extends Container { destroy(options) { if (options) { super.destroy(options); } else { super.destroy(); } } }',
    // No override at all: nothing to chain.
    'class Node extends Container { release() {} }',
    // `Scene.destroy()` is an empty application hook, so `Scene` is not in the
    // default base list and its subclasses need no chain.
    'class Menu extends Scene { destroy() { this.socket.close(); } }',
    // An unlisted base may well have no `destroy()` at all.
    'class Store extends EventTarget { destroy() { this.clear(); } }',
    'class Free { destroy() {} }',
    // A class field holding the override, chaining through the home object.
    'class Node extends Container { destroy = () => { super.destroy(); }; }',
    // Static members are not the instance teardown.
    'class Node extends Container { static destroy() {} destroy() { super.destroy(); } }',
    // A mixin factory base cannot be resolved syntactically.
    'class Node extends withLogging(Container) { destroy() {} }',
  ],
  invalid: [
    {
      code: 'class Node extends Container { destroy() { this.texture.destroy(); } }',
      errors: [{ messageId: 'missingSuperCall', data: { method: 'destroy', base: 'Container' } }],
    },
    // Calling the base's other members is not chaining to its teardown.
    {
      code: 'class Node extends RenderNode { destroy() { super.resize(0, 0); } }',
      errors: [{ messageId: 'missingSuperCall', data: { method: 'destroy', base: 'RenderNode' } }],
    },
    // Referencing `super.destroy` without calling it does not run it.
    {
      code: 'class Effect extends Filter { destroy() { const teardown = super.destroy; } }',
      errors: [{ messageId: 'missingSuperCall', data: { method: 'destroy', base: 'Filter' } }],
    },
    {
      code: 'class Pass extends RenderPass { destroy() { this.target.destroy(); } }',
      errors: [{ messageId: 'missingSuperCall', data: { method: 'destroy', base: 'RenderPass' } }],
    },
    // A class field holding the override.
    {
      code: 'class Node extends Sprite { destroy = () => { this.free(); }; }',
      errors: [{ messageId: 'missingSuperCall', data: { method: 'destroy', base: 'Sprite' } }],
    },
    // A class expression is the same class.
    {
      code: 'const Node = class extends Drawable { destroy() {} };',
      errors: [{ messageId: 'missingSuperCall', data: { method: 'destroy', base: 'Drawable' } }],
    },
    // A configured base list replaces the default one.
    {
      code: 'class Entity extends MyEntityBase { destroy() {} }',
      options: [{ baseClasses: ['MyEntityBase'] }],
      errors: [{ messageId: 'missingSuperCall', data: { method: 'destroy', base: 'MyEntityBase' } }],
    },
    // A configured teardown method name.
    {
      code: 'class Node extends Container { dispose() {} }',
      options: [{ baseClasses: ['Container'], method: 'dispose' }],
      errors: [{ messageId: 'missingSuperCall', data: { method: 'dispose', base: 'Container' } }],
    },
  ],
});
