// Engine-internal. A handful of hooks in this engine carry a written promise
// that they allocate nothing - `Filter.getOutputBounds` runs once per frame for
// every filtered node, and the scene graph's transform notification runs on
// every own-transform mutation. Both write that prohibition into their doc
// comment, and both are the kind of promise that erodes one convenient object
// literal at a time.
//
// This is not a consumer rule and is not part of any consumer preset. A
// consumer's own `getOutputBounds` may allocate as much as their frame budget
// allows; telling them otherwise would be paternalism dressed as a lint error.
// It is in the `exo/engine/*` namespace for exactly that reason: the rules there
// enforce this repository's internal contracts, not anyone else's.
//
// What it reports is syntactic allocation - object and array literals, `new`,
// closures created per call, and the array-returning standard-library calls -
// inside a hook named in the configuration. It cannot see an allocation behind
// a helper call, and it does not try: the hooks it covers are short by design,
// and the escape hatch for a genuinely allocation-free helper is that the
// helper is not this hook.
import type { Rule } from 'eslint';
import type { Node } from 'estree';

import { type FunctionMember, memberFunction, staticKeyName, walk } from '../ast.js';

/** Array-returning calls common enough in this tree to be worth naming. */
const DEFAULT_ALLOCATING_CALLS = [
  'Array.from',
  'Array.of',
  'Object.assign',
  'Object.create',
  'Object.entries',
  'Object.fromEntries',
  'Object.keys',
  'Object.values',
  'JSON.parse',
  'structuredClone',
  '.concat',
  '.filter',
  '.flat',
  '.flatMap',
  '.map',
  '.slice',
  '.split',
  '.toReversed',
  '.toSorted',
];

/** Options for {@link engineNoAllocationInHotHook}. */
export interface EngineNoAllocationInHotHookOptions {
  /** Method names whose bodies must not allocate. Empty by default: the hooks are named where the rule is switched on. */
  readonly methods?: readonly string[];
  /** `Namespace.member` or `.method` names treated as allocating calls. */
  readonly allocatingCalls?: readonly string[];
}

/** The `Namespace.member` or `.method` name a call expression invokes, if it has one. */
const calleeName = (node: Node): string | undefined => {
  if (node.type !== 'CallExpression' || node.callee.type === 'Super') return undefined;

  const callee = node.callee;

  if (callee.type === 'Identifier') return callee.name;
  if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier') return undefined;

  const member = callee.property.name;

  return callee.object.type === 'Identifier' ? `${callee.object.name}.${member}` : `.${member}`;
};

export const engineNoAllocationInHotHook: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow syntactic allocation inside an engine hook documented as allocation-free.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          methods: { type: 'array', items: { type: 'string' }, minItems: 1 },
          allocatingCalls: { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      allocation:
        "'{{hook}}' is documented as allocation-free and runs once per frame per node, so {{what}} here costs a garbage collection the frame budget did not plan for. Hoist it into a field reused across frames, or write into a caller-provided output.",
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as EngineNoAllocationInHotHookOptions;
    const methods = new Set(options.methods ?? []);
    const allocatingCalls = new Set(options.allocatingCalls ?? DEFAULT_ALLOCATING_CALLS);

    if (methods.size === 0) return {};

    /** What kind of allocation `node` is, phrased for the message, or `undefined`. */
    const allocationKind = (node: Node): string | undefined => {
      switch (node.type) {
        case 'ObjectExpression':
          return 'an object literal';
        case 'ArrayExpression':
          return 'an array literal';
        case 'NewExpression':
          return 'a `new` expression';
        case 'ArrowFunctionExpression':
        case 'FunctionExpression':
          return 'a closure created per call';
        default: {
          const name = calleeName(node);

          return name !== undefined && allocatingCalls.has(name) ? `\`${name}\`` : undefined;
        }
      }
    };

    const check = (member: FunctionMember): void => {
      const hook = staticKeyName(member.key, member.computed);

      if (hook === undefined || !methods.has(hook)) return;

      const fn = memberFunction(member);

      if (fn === undefined) return;

      for (const node of walk(fn.body)) {
        const what = allocationKind(node);

        if (what !== undefined) {
          context.report({ node, messageId: 'allocation', data: { hook, what } });
        }
      }
    };

    return {
      MethodDefinition(node) {
        if (node.kind !== 'method') return;

        check(node);
      },
      PropertyDefinition(node) {
        check(node);
      },
    };
  },
};
