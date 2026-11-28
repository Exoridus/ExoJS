import { bindWith } from '#core/bindProperty';
import type { Color } from '#core/Color';
import { logger } from '#core/Logger';
import { isObservable, type ReadonlyObservable } from '#core/Observable';
import { Signal } from '#core/Signal';
import type { ObservableVector } from '#math/ObservableVector';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { RenderNode } from '#rendering/RenderNode';
import type { BlendModes } from '#rendering/types';

import { jsxConstruct } from './jsxConstruct';
import { JsxFragment } from './JsxFragment';
import type { JsxChildren, JsxNodeClass, JsxVectorInput } from './types';

type Props = Readonly<Record<string, unknown>>;

interface AdaptedClass {
  [jsxConstruct](props: Props): RenderNode;
}

/**
 * The open {@link jsxTransaction}: every node JSX constructed inside it and every
 * caller-owned child JSX attached inside it, so a failure can tell the two apart.
 */
interface Transaction {
  readonly constructed: RenderNode[];
  readonly attached: RenderNode[];
}

let transaction: Transaction | null = null;

type PropSetter<N> = (node: N, value: never) => void;

/** Fragments an element already took the children of; placing one again would silently add nothing. */
const consumedFragments = new WeakSet<JsxFragment>();

/**
 * The scene-graph properties every element accepts, each assigned through the
 * node's own property or setter. Only these keys are assigned; every other prop
 * goes to the constructor.
 */
const nodeSetters: Readonly<Record<string, PropSetter<RenderNode>>> = {
  name: (node, value: string | null) => (node.name = value),
  x: (node, value: number) => (node.x = value),
  y: (node, value: number) => (node.y = value),
  rotation: (node, value: number) => (node.rotation = value),
  scale: (node, value: JsxVectorInput) => setVector(node.scale, value),
  origin: (node, value: JsxVectorInput) => setVector(node.origin, value),
  skewX: (node, value: number) => (node.skewX = value),
  skewY: (node, value: number) => (node.skewY = value),
  visible: (node, value: boolean) => (node.visible = value),
  zIndex: (node, value: number) => (node.zIndex = value),
  interactive: (node, value: boolean) => (node.interactive = value),
  draggable: (node, value: boolean) => (node.draggable = value),
  cursor: (node, value: string | null) => (node.cursor = value),
  focusable: (node, value: boolean) => (node.focusable = value),
  tabIndex: (node, value: number) => (node.tabIndex = value),
  hitArea: (node, value: RenderNode['hitArea']) => (node.hitArea = value),
  filters: (node, value: RenderNode['filters']) => (node.filters = value),
  mask: (node, value: RenderNode['mask']) => (node.mask = value),
  cullable: (node, value: boolean) => (node.cullable = value),
};

/** The properties a {@link Drawable} element accepts in addition to {@link nodeSetters}. */
const drawableSetters: Readonly<Record<string, PropSetter<Drawable>>> = {
  tint: (node, value: Color) => (node.tint = value),
  blendMode: (node, value: BlendModes) => (node.blendMode = value),
  anchor: (node, value: JsxVectorInput) => setVector(node.anchor, value),
};

const setterFor = (key: string, drawable: boolean): PropSetter<RenderNode> | undefined => {
  if (Object.hasOwn(nodeSetters, key)) {
    return nodeSetters[key];
  }

  return drawable && Object.hasOwn(drawableSetters, key) ? (drawableSetters[key] as PropSetter<RenderNode>) : undefined;
};

/** `onClick`, `onPointerDown`: `on` followed by an uppercase letter. */
const isSignalKey = (key: string): boolean => key.length > 2 && key.startsWith('on') && key.charCodeAt(2) >= 65 && key.charCodeAt(2) <= 90;

const describe = (value: unknown): string => {
  if (value instanceof RenderNode) {
    return value.name === null ? value.constructor.name : `${value.constructor.name} "${value.name}"`;
  }

  return typeof value === 'string' ? `the string "${value}"` : `${typeof value} ${String(value)}`;
};

const tagOf = (type: { readonly name: string }): string => `<${type.name || 'anonymous'}>`;

const logTeardownError = (what: string, error: unknown): void => {
  logger.error(`JSX: destroying ${what} threw: ${String(error)}`);
};

/** Detaches the children an element attached, then destroys the node the element constructed. */
const release = (node: RenderNode, attached: readonly RenderNode[]): void => {
  for (const child of attached) {
    if (child.parent === node) {
      try {
        (node as Container).removeChild(child);
      } catch (error) {
        logTeardownError('a failed element', error);
      }
    }
  }

  try {
    node.destroy();
  } catch (error) {
    logTeardownError('a failed element', error);
  }
};

const collect = (children: unknown, out: RenderNode[]): void => {
  if (children === null || children === undefined || typeof children === 'boolean') {
    return;
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      collect(child, out);
    }

    return;
  }

  if (!(children instanceof RenderNode)) {
    throw new TypeError(
      `JSX: ${describe(children)} is not a valid child. Pass scene nodes, arrays of them, or null, undefined or a boolean.`,
    );
  }

  if (children.destroyed) {
    throw new TypeError(`JSX: ${describe(children)} has been destroyed and cannot be a child.`);
  }

  if (children.parent !== null) {
    throw new TypeError(`JSX: ${describe(children)} already has a parent. Remove it from its parent before passing it to an element.`);
  }

  if (children instanceof JsxFragment) {
    if (consumedFragments.has(children)) {
      throw new TypeError(
        'JSX: this fragment was already placed in an element, which took its children. Build a new fragment for each place.',
      );
    }

    consumedFragments.add(children);
    out.push(...children.children);
  } else {
    out.push(children);
  }
};

const setVector = (vector: ObservableVector, value: JsxVectorInput): void => {
  if (typeof value === 'number') {
    vector.set(value, value);
  } else {
    vector.set(value.x, value.y);
  }
};

/** Text properties whose observable numbers JSX converts with `String`; see {@link JsxTextKey}. */
const textKeys: ReadonlySet<string> = new Set(['text', 'label']);

const toOption = (key: string, value: unknown): unknown => (textKeys.has(key) && typeof value === 'number' ? String(value) : value);

/**
 * Whether instances of `type` have a property setter named `key`. Only such a
 * construction prop is bound; an observable for any other option is an
 * argument the constructor receives as it is.
 */
const hasSetter = (type: JsxNodeClass, key: string): boolean => {
  let prototype = type.prototype as object | null;

  for (; prototype !== null && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype) as object | null) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);

    if (descriptor !== undefined) {
      return descriptor.set !== undefined;
    }
  }

  return false;
};

const applyProp = (node: RenderNode, key: string, value: unknown, drawable: boolean, type: JsxNodeClass): void => {
  const setter = setterFor(key, drawable);

  if (setter !== undefined) {
    if (isObservable(value)) {
      bindWith(node, value, current => setter(node, current as never));
    } else {
      setter(node, value as never);
    }
  } else if (typeof value === 'function' && isSignalKey(key)) {
    const signal = (node as unknown as Readonly<Record<string, unknown>>)[key];

    if (!(signal instanceof Signal)) {
      throw new TypeError(`JSX: ${tagOf(type)} has no signal named "${key}".`);
    }

    (signal as Signal<unknown[]>).add(value as (...args: unknown[]) => void);
  }
};

/** Assigns the node properties and adds the signal handlers among `props`, after construction. */
const applyProps = (node: RenderNode, props: Props, drawable: boolean, type: JsxNodeClass): void => {
  for (const key in props) {
    if (Object.hasOwn(props, key) && props[key] !== undefined) {
      applyProp(node, key, props[key], drawable, type);
    }
  }
};

const attachChildren = (node: RenderNode, children: readonly RenderNode[], attached: RenderNode[], type: JsxNodeClass): void => {
  if (children.length === 0) {
    return;
  }

  if (!(node instanceof Container)) {
    throw new TypeError(`JSX: ${tagOf(type)} is not a Container and cannot have children.`);
  }

  for (const child of children) {
    if (child.parent === node) {
      throw new TypeError(`JSX: ${describe(child)} appears more than once among the children of ${tagOf(type)}.`);
    }

    node.addChild(child);
    attached.push(child);
    transaction?.attached.push(child);
  }
};

const construct = (type: JsxNodeClass, props: Props): RenderNode => {
  const { children, ref } = props;
  const nodes: RenderNode[] = [];
  const drawable = type.prototype instanceof Drawable;
  const options: Record<string, unknown> = {};
  const bound: Array<[key: string, source: ReadonlyObservable<unknown>, applied: { readonly value: unknown }]> = [];
  let assigns = false;

  // The compiler passes a literal key separately; one arriving in the props came through a spread and would reach the constructor.
  if (Object.hasOwn(props, 'key')) {
    throw new TypeError(
      `JSX: ${tagOf(type)} received a "key" prop. ExoJS does not reconcile, so key is reserved and never passed to a constructor.`,
    );
  }

  // Children are attached only after construction, so a failure up to here leaves every child untouched.
  collect(children, nodes);

  for (const key in props) {
    if (Object.hasOwn(props, key) && key !== 'children' && key !== 'ref') {
      const value = props[key];

      if (setterFor(key, drawable) !== undefined || (typeof value === 'function' && isSignalKey(key))) {
        assigns = true;
      } else if (isObservable(value) && hasSetter(type, key)) {
        const applied = { value: value.value };

        options[key] = toOption(key, applied.value);
        bound.push([key, value, applied]);
      } else {
        options[key] = value;
      }
    }
  }

  const node = jsxConstruct in type ? (type as unknown as AdaptedClass)[jsxConstruct](options) : new type(options as never);
  const attached: RenderNode[] = [];

  try {
    for (const [key, source, applied] of bound) {
      const record = node as unknown as Record<string, unknown>;

      bindWith(
        node,
        source,
        current => {
          record[key] = toOption(key, current);
        },
        applied,
      );
    }

    if (assigns) {
      applyProps(node, props, drawable, type);
    }

    attachChildren(node, nodes, attached, type);

    if (ref !== undefined) {
      (ref as (instance: RenderNode) => void)(node);
    }
  } catch (error) {
    release(node, attached);

    throw error;
  }

  transaction?.constructed.push(node);

  return node;
};

const call = (fn: (props: Props) => unknown, props: Props): RenderNode => {
  const result = fn(props);

  if (!(result instanceof RenderNode)) {
    throw new TypeError(`JSX: ${tagOf(fn)} returned ${describe(result)}; an element function must return a scene node.`);
  }

  return result;
};

/**
 * Builds one element: constructs a scene-node class, or calls an element
 * function, with the props the compiler collected. Emitted by the automatic
 * JSX transform; application code writes JSX instead of calling this.
 *
 * A class element is constructed from its props (see {@link jsxConstruct}),
 * then receives its node properties, signal handlers and children in that
 * order, and finally its `ref`. A node property holding an observable is
 * bound: the property receives the current value and every later change until
 * the node is destroyed. A construction prop holding an observable is bound the
 * same way when the class has a property setter of that name, and the
 * constructor receives the current value; otherwise the constructor receives
 * the observable itself. An element owns only the instance it
 * constructs. When a step after construction throws, the element detaches the
 * children it attached as JSX children and destroys its own instance; those
 * children are never destroyed, whether they were built with JSX or with
 * `new`. Destroying the instance destroys whatever else is attached to it at
 * that moment, such as a node a `ref` or a {@link jsxConstruct} adapter added
 * with `addChild`. Use {@link jsxTransaction} to destroy every node of a
 * failed tree.
 */
export const jsx = (type: unknown, props: Props): RenderNode => {
  if (typeof type !== 'function') {
    throw new TypeError(`JSX: ${describe(type)} is not an element type. Use a scene-node class or a function returning a node.`);
  }

  if (type === RenderNode || type.prototype instanceof RenderNode) {
    return construct(type as JsxNodeClass, props);
  }

  return call(type as (props: Props) => unknown, props);
};

/** The automatic transform's entry for elements with several static children; identical to {@link jsx}. */
export const jsxs = jsx;

/**
 * Groups children without adding a level to the hierarchy: `<>...</>`. See
 * {@link JsxFragment} for what a fragment becomes outside an element.
 */
export const Fragment = (props: { readonly children?: JsxChildren }): RenderNode => construct(JsxFragment, props);

/** Destroys a failed transaction's nodes after detaching every caller-owned child JSX attached to them. */
const abort = ({ constructed, attached }: Transaction): void => {
  const owned = new Set(constructed);

  for (const child of attached) {
    const parent = child.parent;

    if (!owned.has(child) && parent !== null && owned.has(parent)) {
      try {
        parent.removeChild(child);
      } catch (error) {
        logTeardownError('a failed tree', error);
      }
    }
  }

  // Reverse construction order reaches parents before their children; a destroyed container already took its subtree.
  for (const node of [...constructed].reverse()) {
    if (!node.destroyed) {
      try {
        node.destroy();
      } catch (error) {
        logTeardownError('a failed tree', error);
      }
    }
  }
};

/**
 * Runs `build` and returns its result. When `build` throws, every node JSX
 * constructed during the call is destroyed before the error propagates.
 * Without a transaction, a failing element destroys only its own instance, and
 * children built for it stay alive.
 *
 * The transaction knows only what JSX did. A node passed as a JSX child that
 * JSX did not construct in this transaction is detached first and never
 * destroyed. Everything else attached to a constructed node when `build`
 * throws is destroyed with it, as destroying a container destroys its
 * subtree, whoever created it: a node a `ref`, an element function or a
 * {@link jsxConstruct} adapter attached with `addChild` is not detached.
 * Attach such caller-owned nodes after the transaction returns, or detach
 * them yourself before rethrowing. Nodes created with `new` and never
 * attached to a constructed node are not touched.
 *
 * Use it where a failed tree must not keep resources, handlers or bindings
 * alive. Transactions nest: an inner transaction that completes hands its
 * nodes to the enclosing one. Construction must be synchronous; nodes built
 * after `build` returns are not covered.
 */
export const jsxTransaction = <T>(build: () => T): T => {
  const outer = transaction;
  const current: Transaction = { constructed: [], attached: [] };

  transaction = current;

  try {
    const result = build();

    if (outer !== null) {
      for (const node of current.constructed) {
        outer.constructed.push(node);
      }

      for (const node of current.attached) {
        outer.attached.push(node);
      }
    }

    return result;
  } catch (error) {
    abort(current);

    throw error;
  } finally {
    transaction = outer;
  }
};
