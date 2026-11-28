import type { Color } from '#core/Color';
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
 * Nodes an element constructed that no element has adopted yet. Only these are
 * destroyed when an element they were passed to fails; everything else a
 * failing element was given belongs to the caller.
 */
const unadopted = new WeakSet<RenderNode>();

/**
 * Caller-owned nodes an element attached. Rolling back a constructed tree
 * detaches them first, so destroying the tree never destroys them.
 */
const borrowed = new WeakSet<RenderNode>();

type PropSetter<N> = (node: N, value: never) => void;

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

const detachBorrowed = (container: Container): void => {
  for (const child of [...container.children]) {
    if (borrowed.has(child)) {
      container.removeChild(child);
    } else if (child instanceof Container) {
      detachBorrowed(child);
    }
  }
};

/** Destroys a node an element constructed, sparing every caller-owned node inside it. */
const release = (node: RenderNode): void => {
  unadopted.delete(node);

  if (node instanceof Container) {
    detachBorrowed(node);
  }

  node.destroy();
};

/** Releases every node in `children` that an element constructed and nothing adopted. */
const discard = (children: unknown): void => {
  if (Array.isArray(children)) {
    for (const child of children) {
      discard(child);
    }
  } else if (children instanceof RenderNode && unadopted.has(children) && children.parent === null) {
    release(children);
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

const applyProp = (node: RenderNode, key: string, value: unknown, drawable: boolean, type: JsxNodeClass): void => {
  const setter = setterFor(key, drawable);

  if (setter !== undefined) {
    setter(node, value as never);
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

const attachChildren = (node: RenderNode, children: readonly RenderNode[], type: JsxNodeClass): void => {
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

    // A fragment's children already carry their ownership from when the fragment adopted them.
    if (!unadopted.delete(child) && child.parent === null) {
      borrowed.add(child);
    }

    node.addChild(child);
  }
};

const construct = (type: JsxNodeClass, props: Props): RenderNode => {
  const { children, ref } = props;
  const nodes: RenderNode[] = [];
  const drawable = type.prototype instanceof Drawable;
  const options: Record<string, unknown> = {};
  let assigns = false;
  let node: RenderNode;

  try {
    collect(children, nodes);

    for (const key in props) {
      if (Object.hasOwn(props, key) && key !== 'children' && key !== 'ref') {
        const value = props[key];

        if (setterFor(key, drawable) !== undefined || (typeof value === 'function' && isSignalKey(key))) {
          assigns = true;
        } else {
          options[key] = value;
        }
      }
    }

    node = jsxConstruct in type ? (type as unknown as AdaptedClass)[jsxConstruct](options) : new type(options as never);
  } catch (error) {
    discard(children);

    throw error;
  }

  try {
    if (assigns) {
      applyProps(node, props, drawable, type);
    }

    attachChildren(node, nodes, type);

    if (ref !== undefined) {
      (ref as (instance: RenderNode) => void)(node);
    }
  } catch (error) {
    release(node);
    discard(children);

    throw error;
  }

  unadopted.add(node);

  return node;
};

const call = (fn: (props: Props) => unknown, props: Props): RenderNode => {
  let result: unknown;

  try {
    result = fn(props);
  } catch (error) {
    discard(props.children);

    throw error;
  }

  if (!(result instanceof RenderNode)) {
    discard(props.children);

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
 * order, and finally its `ref`. When any step throws, the element destroys
 * what it constructed together with the unadopted JSX nodes it was given, and
 * detaches but never destroys nodes the caller constructed.
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
