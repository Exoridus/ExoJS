// A `destroy()` override that never chains to its base leaves the base's half
// of the teardown undone. In this engine that is not a tidy-up detail: a node's
// GPU lifetime is deterministic and not tied to garbage collection, so the
// buffers a render root owns stay resident until the base `destroy()` releases
// them, and the same override is what unlinks the node from its parent and
// raises the idempotence flag a second call relies on.
//
// The base classes are configured rather than inferred. Without a list the rule
// would have to guess whether a base has a `destroy()` at all, and it would
// report every subclass of every base that has none - the majority. With one,
// each entry is a claim that this base owns something a subclass cannot release
// on its own.
//
// Only a literal `extends <name>` clause is matched, so a subclass reached
// through an intermediate class is not seen. Add the intermediate class to the
// list when it starts owning resources of its own.
import type { Rule } from 'eslint';
import type { Node } from 'estree';

import { type FunctionMember, memberFunction, owningClass, staticKeyName, superClassName, walk } from '../ast.js';

/**
 * The ExoJS base classes whose `destroy()` releases something a subclass cannot
 * release for it - the engine's documented subclassing entry points for the
 * scene tree, the render pass list and the filter chain.
 *
 * `Scene` is deliberately absent: its `destroy()` is an empty hook for the
 * application's own cleanup, and the scene's engine-owned teardown runs
 * separately, so a scene subclass never needs to chain.
 */
export const EXO_DESTROY_BASE_CLASSES: readonly string[] = [
  'AbstractText',
  'AnimatedSprite',
  'CallbackRenderPass',
  'Container',
  'Drawable',
  'Filter',
  'Graphics',
  'HTMLText',
  'RenderNode',
  'RenderNodePass',
  'RenderPass',
  'RenderPipeline',
  'RetainedContainer',
  'SceneNode',
  'ShaderFilter',
  'Sprite',
  'Text',
  'ThemedContainer',
];

/** Options for {@link requireSuperDestroy}. */
export interface RequireSuperDestroyOptions {
  /** `extends` clause names whose `destroy()` a subclass override must chain to. */
  readonly baseClasses?: readonly string[];
  /** Teardown method name. */
  readonly method?: string;
}

/** Whether the subtree calls `super.<method>()` anywhere, at any depth. */
const callsSuperMethod = (root: Node, method: string): boolean => {
  for (const node of walk(root)) {
    if (node.type !== 'CallExpression') continue;

    const callee = node.callee;

    if (callee.type !== 'MemberExpression' || callee.object.type !== 'Super' || callee.computed) continue;
    if (callee.property.type === 'Identifier' && callee.property.name === method) return true;
  }

  return false;
};

export const requireSuperDestroy: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require a `destroy()` override to call `super.destroy()`.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          baseClasses: { type: 'array', items: { type: 'string' }, minItems: 1 },
          method: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingSuperCall:
        "'{{method}}()' overrides {{base}}.{{method}}() without calling `super.{{method}}()`, so the base's own teardown - unlinking, GPU resource release, the idempotence flag - never runs. Call it, usually first, and release this class's own resources around it.",
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as RequireSuperDestroyOptions;
    const baseClasses = new Set(options.baseClasses ?? EXO_DESTROY_BASE_CLASSES);
    const method = options.method ?? 'destroy';

    const check = (member: FunctionMember & Rule.NodeParentExtension): void => {
      if (staticKeyName(member.key, member.computed) !== method) return;

      const fn = memberFunction(member);

      if (fn === undefined) return;

      const owner = owningClass(member);
      const base = owner === undefined ? undefined : superClassName(owner);

      if (base === undefined || !baseClasses.has(base)) return;
      if (callsSuperMethod(fn, method)) return;

      context.report({ node: member.key, messageId: 'missingSuperCall', data: { method, base } });
    };

    return {
      MethodDefinition(node) {
        if (node.kind !== 'method' || node.static) return;

        check(node);
      },
      // `destroy = (): void => { ... }` - a class field holding the override.
      // `super` resolves through the field's home object, so the chain is
      // expressible here too and its absence is the same defect.
      PropertyDefinition(node) {
        if (node.static) return;

        check(node);
      },
    };
  },
};
