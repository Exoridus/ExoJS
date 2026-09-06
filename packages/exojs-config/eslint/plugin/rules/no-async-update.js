// The frame loop dispatches these hooks synchronously and never awaits their
// result (see `SystemRegistry`'s phase loops and `SceneScope`'s frame-hook
// calls in the engine source). An `async` override still compiles - TypeScript
// only rejects it where the hook's return type is the branded `Synchronous`
// type, and a plain object/array literal or a hand-written subclass of
// `SceneTransitionSession` never asks for that annotation - so the mistake
// reaches runtime: the returned promise is dropped, the work lands a frame or
// more later out of order with the rest of the frame, and a rejection surfaces
// as an unhandled rejection instead of through the application's error
// pipeline.
//
// Purely syntactic: it matches on method/property name and `async`, with no
// check that the enclosing class or object actually implements `System`,
// extends `Scene`, or implements `SceneTransitionSession`. Measured against
// this repository, none of these five names carries an unrelated `async`
// method outside the type-level tests that deliberately demonstrate the
// runtime guard - see the rule's own tests for the fixtures that back that
// measurement. A heritage-aware (type-aware) version was rejected: resolving
// "does this class implement System" needs the type checker, which costs lint
// time in every consumer project for a mistake five distinctive names already
// catch without it.
//
// `init` is deliberately not in this set: an async override of `Scene.init()`
// is already an existing repository rule (`no-restricted-syntax` in the
// engine-source ESLint config), predating this plugin. `destroy()` is
// deliberately excluded too - it returns a bare `void`, not `Synchronous`, and
// is a teardown hook rather than a per-frame one; folding it in here would be
// scope creep beyond what was asked.
const SYNCHRONOUS_HOOK_NAMES = new Set([
  // System phases (`SystemMethods`) and the identical Scene frame hooks.
  'preUpdate',
  'fixedUpdate',
  'update',
  'draw',
  // `SceneTransitionSession.render` - the transition hook the frame loop
  // calls alongside its `update`, with no runtime guard at all (unlike the
  // System/Scene phases above, which at least throw instead of silently
  // dropping the promise).
  'render',
]);

/**
 * Static name of a (possibly computed) property/method key, or `undefined`
 * when the name cannot be determined without evaluating the key expression.
 * @param {*} key An `Identifier`, `Literal` or other property-key AST node.
 * @param {boolean} computed
 * @returns {string | undefined}
 */
const staticKeyName = (key, computed) => {
  if (computed) return undefined;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;

  return undefined;
};

/** @type {import('eslint').Rule.RuleModule} */
export const noAsyncUpdate = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow an async override of a lifecycle hook the frame loop calls synchronously.',
    },
    schema: [],
    messages: {
      asyncHook:
        "'{{name}}' must be synchronous - the frame loop never awaits it, so an async override drops the returned promise instead of running it in order. Start the asynchronous work here and track the promise yourself (an internal field awaited elsewhere), rather than marking this method async.",
    },
  },
  create(context) {
    /**
     * @param {*} key The node's property/method key, also used as the report location.
     * @param {boolean} computed
     * @param {*} value The node's assigned value (a function, for a method or a class field).
     */
    const check = (key, computed, value) => {
      if (value === undefined || value === null) return;
      if (value.type !== 'FunctionExpression' && value.type !== 'ArrowFunctionExpression') return;
      if (!value.async) return;

      const name = staticKeyName(key, computed);

      if (name === undefined || !SYNCHRONOUS_HOOK_NAMES.has(name)) return;

      context.report({ node: key, messageId: 'asyncHook', data: { name } });
    };

    return {
      // `class X { async update() {} }`
      MethodDefinition(node) {
        if (node.kind !== 'method') return;

        check(node.key, node.computed, node.value);
      },
      // `class X { update = async (delta) => {}; }`
      PropertyDefinition(node) {
        check(node.key, node.computed, node.value);
      },
      // `{ async update() {} }` / `{ update: async (delta) => {} }` - a system
      // or transition session is equally often a plain object literal.
      Property(node) {
        check(node.key, node.computed, node.value);
      },
    };
  },
};
