// `RenderPass.enabled` is evaluated by the CONTAINING pipeline, never by the
// pass itself: `RenderPipeline.execute` skips a pass whose `enabled` is false,
// and a pass executed directly is meant to run regardless. A pass that reads
// its own `enabled` inside `execute` therefore has two authorities for the same
// decision - the parent's, and its own - and the second one silently overrides
// a deliberate direct call.
//
// The check is on the PATTERN, not the position. An early `if (!this.enabled)
// return;` and a guard buried thirty lines down are the same defect, so any
// read of `this.enabled` anywhere in `execute` reports. Reading `enabled` on
// another pass (`pass.enabled`, `child.enabled`) stays legal - that is exactly
// the mechanism a pipeline uses to skip its children.
//
// Anchored on a literal `extends RenderPass` clause, because resolving what a
// base class really is needs the type checker. That means a pass whose base
// class sits behind another local class, or behind an alias, is not seen; the
// direct subclass that consumers actually write is.
import type { Rule } from 'eslint';
import type { MemberExpression } from 'estree';

import { type ClassNode, isFunctionMemberNamed, owningClass, superClassName } from '../ast.js';

const DEFAULT_BASE_CLASSES = ['RenderPass'];

/** Options for {@link noSelfEnabledCheck}. */
export interface NoSelfEnabledCheckOptions {
  /** `extends` clause names treated as a render pass. */
  readonly baseClasses?: readonly string[];
  /** Method whose body must not consult the pass's own `enabled`. */
  readonly hook?: string;
}

/** Whether the expression reads `this.enabled` rather than assigning to it. */
const isSelfEnabledRead = (node: MemberExpression & Rule.NodeParentExtension): boolean => {
  if (node.computed || node.object.type !== 'ThisExpression') return false;
  if (node.property.type !== 'Identifier' || node.property.name !== 'enabled') return false;

  // `this.enabled = value` writes; `this.enabled ||= value` and `this.enabled +=
  // 1` also read, so only the plain assignment target is exempt.
  return !(node.parent.type === 'AssignmentExpression' && node.parent.operator === '=' && node.parent.left === node);
};

export const noSelfEnabledCheck: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow a render pass from consulting its own `enabled` inside the hook its pipeline already gates.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          baseClasses: { type: 'array', items: { type: 'string' }, minItems: 1 },
          hook: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      selfEnabledCheck:
        "A pass must not read its own `enabled` in '{{hook}}' - the containing pipeline already skips a disabled pass, and a direct call is meant to run the pass regardless. Read `enabled` on a child pass instead, or drop the guard.",
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as NoSelfEnabledCheckOptions;
    const baseClasses = new Set(options.baseClasses ?? DEFAULT_BASE_CLASSES);
    const hook = options.hook ?? 'execute';

    const isRenderPass = (node: ClassNode | undefined): boolean => {
      const name = node === undefined ? undefined : superClassName(node);

      return name !== undefined && baseClasses.has(name);
    };

    /**
     * Whether `this` inside `node` is the instance of a render pass currently
     * running the gated hook.
     *
     * Walks outwards to the nearest binding of `this`. Arrow functions are
     * transparent, so a callback written inline in `execute` counts; a nested
     * `function` expression rebinds `this` and does not.
     */
    const isInsideHook = (node: Rule.Node): boolean => {
      let current: Rule.Node | null | undefined = node.parent;

      while (current !== null && current !== undefined) {
        if (current.type === 'MethodDefinition' || current.type === 'PropertyDefinition') {
          // A static member's `this` is the class, not the pass instance.
          return !current.static && isFunctionMemberNamed(current, hook) && isRenderPass(owningClass(current));
        }

        // `this` is rebound here - unless this function IS the hook, whose own
        // `this` is the pass instance.
        if (current.type === 'FunctionExpression' || current.type === 'FunctionDeclaration') {
          const owner: Rule.Node | null | undefined = (current as { parent?: Rule.Node | null }).parent;

          if (owner?.type !== 'MethodDefinition' && owner?.type !== 'PropertyDefinition') return false;
        }

        // A static block, or a field initialiser outside the hook.
        if (current.type === 'ClassBody' || current.type === 'StaticBlock') return false;

        current = (current as { parent?: Rule.Node | null }).parent;
      }

      return false;
    };

    return {
      MemberExpression(node) {
        if (!isSelfEnabledRead(node) || !isInsideHook(node)) return;

        context.report({ node, messageId: 'selfEnabledCheck', data: { hook } });
      },
    };
  },
};
