import { RuleTester } from 'eslint';

import { engineNoAllocationInHotHook } from '../src/rules/engine-no-allocation-in-hot-hook.ts';

// RuleTester registers its own `describe`/`it` blocks (via the vitest globals
// this project enables) - it must run at the top level, not nested inside
// another `it()`.
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

const options = [{ methods: ['getOutputBounds'] }];

ruleTester.run('engine/no-allocation-in-hot-hook', engineNoAllocationInHotHook, {
  valid: [
    // Writing into the caller's output is the whole point of the contract.
    { code: 'class Effect { getOutputBounds(input, output) { output.set(input.x, input.y, input.width, input.height); } }', options },
    {
      code: 'class Effect { getOutputBounds(input, output) { const r = this.radius; output.set(input.x - r, input.y - r, input.width + r * 2, input.height + r * 2); } }',
      options,
    },
    // A pooled scratch object is a field, not an allocation.
    { code: 'class Effect { getOutputBounds(input, output) { this._scratch.copy(input); output.copy(this._scratch); } }', options },
    // Allocation in an unnamed method is not this rule's business.
    { code: 'class Effect { apply(backend) { const buffer = new Float32Array(4); } }', options },
    // With no method named, the rule is inert - it is switched on by naming the
    // hooks whose documentation makes the promise.
    'class Effect { getOutputBounds(input, output) { return { x: 0 }; } }',
  ],
  invalid: [
    {
      code: 'class Effect { getOutputBounds(input, output) { const box = { x: 0, y: 0 }; output.copy(box); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'an object literal' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { const corners = [0, 0, 0, 0]; } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'an array literal' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { output.copy(new Rectangle(0, 0, 1, 1)); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a `new` expression' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { this.stages.forEach(s => s.expand(output)); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { const reach = this.stages.map(s => s.reach); } }',
      options,
      // The `.map` call and the arrow it is handed are two allocations.
      errors: [{ messageId: 'allocation' }, { messageId: 'allocation' }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { const names = Object.keys(this.uniforms); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: '`Object.keys`' } }],
    },
    // Nested inside a branch is still inside the hook.
    {
      code: 'class Effect { getOutputBounds(input, output) { if (this.dirty) { this._cache = { x: 0 }; } } }',
      options,
      errors: [{ messageId: 'allocation' }],
    },
    // A class field holding the hook.
    {
      code: 'class Effect { getOutputBounds = (input, output) => ({ x: input.x }); }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'an object literal' } }],
    },
    // A configured extra call.
    {
      code: 'class Effect { getOutputBounds(input, output) { const copy = cloneRect(input); } }',
      options: [{ methods: ['getOutputBounds'], allocatingCalls: ['cloneRect'] }],
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: '`cloneRect`' } }],
    },
  ],
});
