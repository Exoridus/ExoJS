// Syntactic helpers shared by the rules. Everything here works on the parsed
// tree alone: no rule in this plugin asks the TypeScript type checker anything,
// because type information costs lint time in every consumer project and the
// mistakes these rules describe are visible in the source text.
//
// The consequence is a hard boundary at the file: whether an imported
// `RenderPass` is really the engine's, whether a base class three files up
// eventually extends one, and whether a class satisfies an interface are all
// out of reach. Each rule states what it therefore lets through.
import type { Rule } from 'eslint';
import type { ClassDeclaration, ClassExpression, Expression, MethodDefinition, Node, PrivateIdentifier, PropertyDefinition } from 'estree';

/** A class body's owning class node, in either of its two syntactic forms. */
export type ClassNode = ClassDeclaration | ClassExpression;

/** A class member that can hold a function: a method, or a field initialised with one. */
export type FunctionMember = MethodDefinition | PropertyDefinition;

/**
 * Static name of a (possibly computed) property/method key, or `undefined` when
 * the name cannot be determined without evaluating the key expression.
 */
export const staticKeyName = (key: Expression | PrivateIdentifier, computed: boolean): string | undefined => {
  if (computed) return undefined;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;

  return undefined;
};

/**
 * Name of the class's `extends` clause when it is a plain identifier.
 *
 * `extends someExpression()` and `extends ns.Base` return `undefined`: a mixin
 * factory or a namespaced base cannot be resolved without following it, and
 * guessing would report classes whose base is unrelated.
 */
export const superClassName = (node: ClassNode): string | undefined => (node.superClass?.type === 'Identifier' ? node.superClass.name : undefined);

/** The class a member belongs to. */
export const owningClass = (member: FunctionMember & Rule.NodeParentExtension): ClassNode | undefined => {
  const body = member.parent;

  return body.type === 'ClassBody' ? (body.parent as ClassNode) : undefined;
};

/** The function a method or class field holds, or `undefined` when the member holds no function. */
export const memberFunction = (member: FunctionMember): Extract<Node, { type: 'FunctionExpression' | 'ArrowFunctionExpression' }> | undefined => {
  const value = member.value;

  if (value === null || value === undefined) return undefined;

  return value.type === 'FunctionExpression' || value.type === 'ArrowFunctionExpression' ? value : undefined;
};

/** Whether `member` is a method or class field named `name` that holds a function. */
export const isFunctionMemberNamed = (member: FunctionMember, name: string): boolean =>
  staticKeyName(member.key, member.computed) === name && memberFunction(member) !== undefined;

/**
 * Every node in the subtree rooted at `node`, in traversal order.
 *
 * Rules use this to answer "does this method contain X anywhere", which is what
 * makes them pattern checks rather than position checks: a call on the last
 * line of a method counts exactly as much as one on the first.
 */
export function* walk(node: Node): Generator<Node> {
  yield node;

  for (const key of Object.keys(node)) {
    // `parent` is ESLint's back-reference, not a child: following it would walk
    // the whole program from any starting point.
    if (key === 'parent') continue;

    const value = (node as unknown as Record<string, unknown>)[key];

    for (const child of Array.isArray(value) ? value : [value]) {
      if (child !== null && typeof child === 'object' && typeof (child as Node).type === 'string') {
        yield* walk(child as Node);
      }
    }
  }
}
