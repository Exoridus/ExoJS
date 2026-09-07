// A system does nothing until something drives it. `systems.add(system)` hands
// it to the scheduler, which then calls its phases every frame and destroys it
// with its owner; a system that is only constructed sits there fully configured
// and never runs, and the symptom is silence rather than an error.
//
// The rule reports a construction only when it can see the whole life of the
// binding. If the binding leaves the file - exported, returned, passed to
// anything, stored on an object - registration may well happen somewhere this
// rule cannot see, and reporting would be a guess. What remains is the case
// that is unambiguous from the source text alone: a local that is constructed,
// possibly configured through its own members, and then never handed anywhere
// and never stepped by hand.
//
// System-shaped is a name test (`...System` by default), not a type test. The
// alternative needs the checker, and a name is what the engine's own systems,
// the extension packages' systems and every consumer's systems already share.
import type { Rule } from 'eslint';
import type { Identifier, Node, VariableDeclarator } from 'estree';

const DEFAULT_PATTERN = 'System$';
const DEFAULT_REGISTRY = 'systems';
const DEFAULT_REGISTER_METHOD = 'add';
const DEFAULT_LIFECYCLE_METHODS = ['preUpdate', 'fixedUpdate', 'update', 'draw'];

/** Options for {@link noUnregisteredSystem}. */
export interface NoUnregisteredSystemOptions {
  /** Regular expression source matched against the constructed class's name. */
  readonly pattern?: string;
  /** Property the registry is reached through, as in `app.systems` / `this.systems`. */
  readonly registry?: string;
  /** Registry method that takes ownership of a system. */
  readonly registerMethod?: string;
  /** Phase calls that count as driving the system by hand. */
  readonly lifecycleMethods?: readonly string[];
}

/** Trailing name of `x`, `a.x` or `a.b.x`, or `undefined` for anything computed. */
const tailName = (node: Node): string | undefined => {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.type === 'ThisExpression') return 'this';

  return undefined;
};

/** How one reference to the binding is used. */
type Usage = 'registered' | 'escapes' | 'local';

export const noUnregisteredSystem: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow constructing a system that is never registered, never driven, and never leaves the file.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          registry: { type: 'string' },
          registerMethod: { type: 'string' },
          lifecycleMethods: { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unregistered:
        "'{{name}}' is constructed but never registered: nothing in this file passes it to `{{registry}}.{{registerMethod}}()` or calls a phase on it, and the binding never leaves the file, so its phases will never run. Register it, or drop the construction.",
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as NoUnregisteredSystemOptions;
    const pattern = new RegExp(options.pattern ?? DEFAULT_PATTERN, 'u');
    const registry = options.registry ?? DEFAULT_REGISTRY;
    const registerMethod = options.registerMethod ?? DEFAULT_REGISTER_METHOD;
    const lifecycleMethods = new Set(options.lifecycleMethods ?? DEFAULT_LIFECYCLE_METHODS);

    const { sourceCode } = context;
    const candidates: VariableDeclarator[] = [];

    const classify = (identifier: Identifier & Rule.NodeParentExtension): Usage => {
      const parent = identifier.parent;

      // `system.foo`, `system.foo()`, `system.update()`.
      if (parent.type === 'MemberExpression' && parent.object === identifier) {
        if (parent.computed || parent.property.type !== 'Identifier') return 'local';

        const isCall = parent.parent.type === 'CallExpression' && parent.parent.callee === parent;

        return isCall && lifecycleMethods.has(parent.property.name) ? 'registered' : 'local';
      }

      // `app.systems.add(system)` / `this.systems.add(system)`.
      if (parent.type === 'CallExpression' && parent.arguments.includes(identifier)) {
        const callee = parent.callee;
        const registered =
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.type === 'Identifier' &&
          callee.property.name === registerMethod &&
          tailName(callee.object) === registry;

        return registered ? 'registered' : 'escapes';
      }

      // Anything else - returned, exported, stored, spread, handed to a
      // function - could reach a registration this rule cannot see.
      return 'escapes';
    };

    const isExported = (declarator: VariableDeclarator & Rule.NodeParentExtension): boolean => {
      const declaration = declarator.parent;

      return declaration.type === 'VariableDeclaration' && declaration.parent.type.startsWith('Export');
    };

    return {
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier' || node.init?.type !== 'NewExpression') return;
        if (node.init.callee.type !== 'Identifier' || !pattern.test(node.init.callee.name)) return;
        if (isExported(node)) return;

        candidates.push(node);
      },

      // `parent` back-references are only complete once the traversal is, and
      // a registration may well sit above the declaration in source order.
      'Program:exit'(): void {
        for (const declarator of candidates) {
          const [variable] = sourceCode.getDeclaredVariables(declarator);

          if (variable === undefined) continue;

          let usage: Usage = 'local';

          for (const reference of variable.references) {
            // The declaration's own initialiser write.
            if (reference.init) continue;

            const classification = classify(reference.identifier as Identifier & Rule.NodeParentExtension);

            if (classification !== 'local') {
              usage = classification;
            }

            if (usage === 'registered') break;
          }

          if (usage !== 'local') continue;

          const init = declarator.init as { callee: Identifier };

          context.report({
            node: declarator.init as Node,
            messageId: 'unregistered',
            data: { name: init.callee.name, registry, registerMethod },
          });
        }
      },
    };
  },
};
