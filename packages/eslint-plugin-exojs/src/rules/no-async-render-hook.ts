// The render path is synchronous end to end. A pipeline plays its passes in a
// `for` loop and never awaits one; the effect resolver asks every filter for
// its output bounds while it is sizing this frame's capture target, and applies
// the chain into targets it releases as soon as the call returns. An `async`
// override of any of those hooks returns a promise nobody holds: the pass draws
// after the frame it belonged to, into a target that may already be back in the
// pool, and a rejection surfaces as an unhandled rejection rather than through
// the application's error pipeline.
//
// Separate from `no-async-update` rather than five more names in that rule's
// set, because `execute` and `apply` are ordinary words: an unrelated class
// with an `async apply()` is entirely plausible, where an `async fixedUpdate()`
// is not. This rule therefore pays for the specificity with an `extends`
// clause - it reports only inside a class that literally extends the named base.
//
// The clause is read syntactically, so a filter whose base sits behind an
// intermediate class in another file is not seen. That is the same boundary
// every rule here works within: resolving inheritance needs the type checker.
import type { Rule } from 'eslint';

import { type FunctionMember, memberFunction, owningClass, staticKeyName, superClassName } from '../ast.js';

/** Hook names that must stay synchronous, by the base class that declares them. */
const DEFAULT_HOOKS: Readonly<Record<string, readonly string[]>> = {
  RenderPass: ['execute'],
  Filter: ['apply', 'getOutputBounds'],
};

/** Options for {@link noAsyncRenderHook}. */
export interface NoAsyncRenderHookOptions {
  /** Base class name to the hooks that must stay synchronous in its subclasses. */
  readonly hooks?: Readonly<Record<string, readonly string[]>>;
}

export const noAsyncRenderHook: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow an async override of a render pass or filter hook the renderer calls synchronously.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          hooks: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' }, minItems: 1 },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      asyncRenderHook:
        "'{{name}}' must be synchronous - {{base}} calls it while the frame is being drawn and never awaits it, so an async override runs after the target it was given has been released. Prepare the asynchronous work elsewhere and let this hook use the result.",
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as NoAsyncRenderHookOptions;
    const hooks = options.hooks ?? DEFAULT_HOOKS;

    const check = (member: FunctionMember & Rule.NodeParentExtension): void => {
      const fn = memberFunction(member);

      if (!fn?.async) return;

      const owner = owningClass(member);
      const base = owner === undefined ? undefined : superClassName(owner);

      if (base === undefined || !Object.hasOwn(hooks, base)) return;

      const name = staticKeyName(member.key, member.computed);

      if (name === undefined || !hooks[base]!.includes(name)) return;

      context.report({ node: member.key, messageId: 'asyncRenderHook', data: { name, base } });
    };

    return {
      // `class Pass extends RenderPass { async execute(context) {} }`
      MethodDefinition(node) {
        if (node.kind !== 'method' || node.static) return;

        check(node);
      },
      // `class Pass extends RenderPass { execute = async (context) => {}; }`
      PropertyDefinition(node) {
        if (node.static) return;

        check(node);
      },
    };
  },
};
