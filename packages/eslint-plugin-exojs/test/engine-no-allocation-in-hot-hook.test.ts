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
    // Calls to named helpers do not expose the helper's body to this rule.
    {
      code: 'function createBounds() { return { x: 1 }; } class Effect { getOutputBounds(input, output) { output.copy(createBounds()); } }',
      options,
    },
    // With no method named, the rule is inert - it is switched on by naming the
    // hooks whose documentation makes the promise.
    'class Effect { getOutputBounds(input, output) { return { x: 0 }; } }',
  ],
  invalid: [
    // The callback is created in the hook, but its body runs later.
    {
      code: 'class Effect { getOutputBounds(input, output) { queueMicrotask(() => { const v = { x: 1 }; }); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { setTimeout(function () { const v = { x: 1 }; }, 0); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { return () => ({ x: 1 }); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { this.deferred = () => ({ x: 1 }); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    // An immediate call inside a deferred body does not make that body immediate.
    {
      code: 'class Effect { getOutputBounds(input, output) { queueMicrotask(() => { (() => ({ x: 1 }))(); }); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    // Parameter defaults run when the callback is invoked, not when it is created.
    {
      code: 'class Effect { getOutputBounds(input, output) { queueMicrotask((value = { x: 1 }) => output.copy(value)); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    // Unknown callback APIs and named bindings keep their bodies opaque.
    {
      code: 'class Effect { getOutputBounds(input, output) { invokeCallback(() => ({ x: 1 })); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { const helper = function () { return { x: 1 }; }; helper(); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    // Local declarations also create a function during each hook call.
    {
      code: 'class Effect { getOutputBounds(input, output) { function helper() { return { x: 1 }; } } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { function helper() { return { x: 1 }; } helper(); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    // Binding a function or reading its call property does not execute its body.
    {
      code: 'class Effect { getOutputBounds(input, output) { const bound = (() => ({ x: 1 })).bind(this); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { const invoke = (() => ({ x: 1 })).call; } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    // Computed invocation forms are outside the syntactic recognition policy.
    {
      code: "class Effect { getOutputBounds(input, output) { (() => ({ x: 1 }))['call'](this); } }",
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    {
      code: "class Effect { getOutputBounds(input, output) { this.stages['forEach'](() => ({ x: 1 })); } }",
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
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
      errors: [
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: '`.map`' } },
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } },
      ],
    },
    // Direct synchronous invocations still execute their bodies during the hook.
    {
      code: 'class Effect { getOutputBounds(input, output) { (() => ({ x: 1 }))(); } }',
      options,
      errors: [
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } },
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'an object literal' } },
      ],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { (function () { const v = { x: 1 }; })(); } }',
      options,
      errors: [
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } },
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'an object literal' } },
      ],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { (function () { const v = { x: 1 }; }).call(this); } }',
      options,
      errors: [
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } },
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'an object literal' } },
      ],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { (function () { const v = { x: 1 }; }).apply(this, arguments); } }',
      options,
      errors: [
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } },
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'an object literal' } },
      ],
    },
    // Immediate calls also evaluate their parameter defaults.
    {
      code: 'class Effect { getOutputBounds(input, output) { ((value = { x: 1 }) => output.copy(value))(); } }',
      options,
      errors: [
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } },
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'an object literal' } },
      ],
    },
    // Standard iteration and comparison callbacks execute synchronously.
    ...(
      [
        ['forEach', null],
        ['map', '`.map`'],
        ['filter', '`.filter`'],
        ['flatMap', '`.flatMap`'],
        ['every', null],
        ['some', null],
        ['find', null],
        ['findIndex', null],
        ['findLast', null],
        ['findLastIndex', null],
        ['reduce', null],
        ['reduceRight', null],
        ['sort', null],
        ['toSorted', '`.toSorted`'],
      ] as const
    ).map(([method, callAllocation]) => ({
      code: `class Effect { getOutputBounds(input, output) { this.stages.${method}(() => { const v = { x: 1 }; return v.x; }); } }`,
      options,
      errors: [
        ...(callAllocation === null ? [] : [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: callAllocation } }]),
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } },
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'an object literal' } },
      ],
    })),
    {
      code: 'class Effect { getOutputBounds(input, output) { Array.from(input, () => ({ x: 1 })); } }',
      options,
      errors: [
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: '`Array.from`' } },
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } },
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'an object literal' } },
      ],
    },
    // A function passed as thisArg is created, but is not invoked as the callback.
    {
      code: 'class Effect { getOutputBounds(input, output) { this.stages.forEach(output.copy, () => ({ x: 1 })); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { Array.from(input, output.copy, () => ({ x: 1 })); } }',
      options,
      errors: [
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: '`Array.from`' } },
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } },
      ],
    },
    // A Promise executor runs immediately; a promise reaction runs later.
    {
      code: 'class Effect { getOutputBounds(input, output) { new Promise(resolve => { resolve({ x: 1 }); }); } }',
      options,
      errors: [
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a `new` expression' } },
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } },
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'an object literal' } },
      ],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { input.then(() => ({ x: 1 })); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { this.stages.forEach(() => { queueMicrotask(() => ({ x: 1 })); }); } }',
      options,
      errors: [
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } },
        { messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } },
      ],
    },
    // Async and generator bodies remain opaque even in immediate invocation forms.
    {
      code: 'class Effect { getOutputBounds(input, output) { (async () => { await input; return { x: 1 }; })(); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { (function* () { return { x: 1 }; })(); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { this.stages.forEach(async () => { await input; return { x: 1 }; }); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
    },
    {
      code: 'class Effect { getOutputBounds(input, output) { this.stages.forEach(function* () { return { x: 1 }; }); } }',
      options,
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'a closure created per call' } }],
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
      errors: [{ messageId: 'allocation', data: { hook: 'getOutputBounds', what: 'an object literal' } }],
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
