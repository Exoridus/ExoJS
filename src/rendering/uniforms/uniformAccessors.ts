/**
 * Typed accessors over a uniform block's CPU buffer.
 *
 * One accessor per declared field is built when the owning material or filter
 * is created and lives as long as it does, so a frame that only writes values
 * allocates nothing and never looks a name up. Each write compares the stored
 * component against what the buffer already holds and advances the block's
 * revision only when a byte actually changed, which is what lets a backend skip
 * the upload for an unchanged block.
 *
 * The accessor types are interfaces: instances come from the engine, so nothing
 * is gained by shipping their constructors.
 */

import type {
  UniformFields,
  UniformFieldTypeOf,
  UniformInput,
  UniformMat3Input,
  UniformMat4Input,
  UniformStructInput,
  UniformVec2Input,
  UniformVec3Input,
  UniformVec4Input,
} from './uniformDeclarations';
import type { UniformArray, UniformStruct } from './uniformDeclarations';
import type { UniformNodeLayout } from './uniformLayout';
import { UniformType } from './UniformType';

/** The three views of a block's single `ArrayBuffer`. @internal */
export interface UniformBufferViews {
  readonly f32: Float32Array;
  readonly i32: Int32Array;
  readonly u32: Uint32Array;
}

/** The block an accessor reports its writes to. @internal */
export interface UniformRevisionSink {
  _touch(): void;
}

/**
 * An accessor seen by the bulk-write path: writes a value into the block buffer
 * without advancing the revision, so a whole record advances it once. @internal
 */
export interface UniformWritable {
  _write(value: unknown): boolean;
}

/** A single `f32`, `i32` or `u32` field. */
export interface UniformScalar {
  value: number;
  set(value: number): void;
}

/** A `vec2<f32>` field. */
export interface UniformVector2 {
  x: number;
  y: number;
  set(x: number, y: number): void;
  set(value: UniformVec2Input): void;
}

/** A `vec3<f32>` field. */
export interface UniformVector3 {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): void;
  set(value: UniformVec3Input): void;
}

/** A `vec4<f32>` field. */
export interface UniformVector4 {
  x: number;
  y: number;
  z: number;
  w: number;
  set(x: number, y: number, z: number, w: number): void;
  set(value: UniformVec4Input): void;
}

/** A `mat3x3<f32>` field, stored as three 16-byte-aligned columns. */
export interface UniformMatrix3 {
  /** Nine components in column-major order, or a {@link Matrix}. */
  set(value: UniformMat3Input): void;
}

/** A `mat4x4<f32>` field. */
export interface UniformMatrix4 {
  /** Sixteen components in column-major order. */
  set(value: UniformMat4Input): void;
}

/** A fixed-length array field. Element accessors are built once and reused. */
export interface UniformArrayAccessor<Element, Input> {
  readonly length: number;
  /** The accessor for one element. The same object is returned on every call. */
  at(index: number): Element;
  /** Write the leading `values.length` elements, advancing the revision once. */
  set(values: readonly Input[]): void;
}

/** Bulk writer shared by a nested struct and a whole block. */
export interface UniformStructWriter<F extends UniformFields> {
  /** Write several fields at once, advancing the revision once. */
  set(values: UniformStructInput<F>): void;
}

/** One accessor per declared field, under the field's own name. */
export type UniformFieldAccessors<F extends UniformFields> = {
  readonly [K in keyof F]: UniformAccessorFor<UniformFieldTypeOf<F[K]>>;
};

/** A nested struct field: its own fields, plus a bulk writer. */
export type UniformStructAccessor<F extends UniformFields = UniformFields> = UniformFieldAccessors<F> & UniformStructWriter<F>;

/** The accessor a field of type `T` is read and written through. */
export type UniformAccessorFor<T> = T extends UniformType.Float | UniformType.Int | UniformType.Uint
  ? UniformScalar
  : T extends UniformType.Vec2
    ? UniformVector2
    : T extends UniformType.Vec3
      ? UniformVector3
      : T extends UniformType.Vec4
        ? UniformVector4
        : T extends UniformType.Mat3
          ? UniformMatrix3
          : T extends UniformType.Mat4
            ? UniformMatrix4
            : T extends UniformStruct<infer F>
              ? UniformStructAccessor<F>
              : T extends UniformArray<infer E>
                ? UniformArrayAccessor<UniformAccessorFor<E>, UniformInput<E>>
                : never;

type ComponentView = Float32Array | Int32Array | Uint32Array;

/**
 * Write one component and report whether the buffer changed.
 *
 * The comparison reads the component back rather than comparing the argument:
 * a `f32` view rounds what it stores and an `i32` view truncates it, so
 * comparing before the write would report a change on every call for a value
 * the buffer cannot represent exactly.
 */
const writeComponent = (view: ComponentView, index: number, value: number): boolean => {
  const previous = view[index];

  view[index] = value;

  return view[index] !== previous;
};

const describeValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `an array of length ${value.length}`;
  }

  if (ArrayBuffer.isView(value)) {
    return `a ${value.constructor.name} of length ${(value as unknown as ArrayLike<number>).length}`;
  }

  if (typeof value === 'object' && value !== null) {
    return `an object with keys [${Object.keys(value).join(', ')}]`;
  }

  return `${typeof value} \`${String(value)}\``;
};

const rejectValue = (path: string, expected: string, value: unknown): never => {
  throw new Error(`[ExoJS] Uniform \`${path}\` expects ${expected}, received ${describeValue(value)}.`);
};

/**
 * Components arrive as a real array or a typed array, never as an arbitrary
 * object carrying a `length`: `Vector.length` is its magnitude, so a duck-typed
 * check would read a vector's components as `undefined`.
 */
const isComponentList = (value: unknown): value is ArrayLike<number> => Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));

abstract class UniformAccessorBase implements UniformWritable {
  protected readonly _sink: UniformRevisionSink;
  protected readonly _path: string;

  protected constructor(sink: UniformRevisionSink, path: string) {
    this._sink = sink;
    this._path = path;
  }

  /** Write `value` without touching the revision; returns whether bytes changed. @internal */
  public abstract _write(value: unknown): boolean;
}

class ScalarAccessor extends UniformAccessorBase implements UniformScalar {
  private readonly _view: ComponentView;
  private readonly _index: number;

  public constructor(sink: UniformRevisionSink, path: string, view: ComponentView, index: number) {
    super(sink, path);
    this._view = view;
    this._index = index;
  }

  public get value(): number {
    return this._view[this._index]!;
  }

  public set value(value: number) {
    this.set(value);
  }

  public set(value: number): void {
    if (writeComponent(this._view, this._index, value)) {
      this._sink._touch();
    }
  }

  public _write(value: unknown): boolean {
    if (typeof value !== 'number') {
      if (__DEV__) {
        rejectValue(this._path, 'a number', value);
      }

      return false;
    }

    return writeComponent(this._view, this._index, value);
  }
}

abstract class VectorAccessor extends UniformAccessorBase {
  protected readonly _view: Float32Array;
  protected readonly _index: number;

  public constructor(sink: UniformRevisionSink, path: string, view: Float32Array, index: number) {
    super(sink, path);
    this._view = view;
    this._index = index;
  }

  protected _component(offset: number): number {
    return this._view[this._index + offset]!;
  }

  protected _setComponent(offset: number, value: number): void {
    if (writeComponent(this._view, this._index + offset, value)) {
      this._sink._touch();
    }
  }
}

class Vector2Accessor extends VectorAccessor implements UniformVector2 {
  public get x(): number {
    return this._component(0);
  }

  public set x(value: number) {
    this._setComponent(0, value);
  }

  public get y(): number {
    return this._component(1);
  }

  public set y(value: number) {
    this._setComponent(1, value);
  }

  public set(x: number, y: number): void;
  public set(value: UniformVec2Input): void;
  public set(x: number | UniformVec2Input, y?: number): void {
    const changed = typeof x === 'number' ? this._writeComponents(x, y!) : this._write(x);

    if (changed) {
      this._sink._touch();
    }
  }

  public _write(value: unknown): boolean {
    if (isComponentList(value)) {
      return this._writeComponents(value[0]!, value[1]!);
    }

    if (typeof value === 'object' && value !== null && 'x' in value && 'y' in value) {
      const point = value as { x: number; y: number };

      return this._writeComponents(point.x, point.y);
    }

    if (__DEV__) {
      rejectValue(this._path, 'two numbers, `[x, y]`, or a Vector', value);
    }

    return false;
  }

  private _writeComponents(x: number, y: number): boolean {
    let changed = writeComponent(this._view, this._index, x);

    if (writeComponent(this._view, this._index + 1, y)) {
      changed = true;
    }

    return changed;
  }
}

class Vector3Accessor extends VectorAccessor implements UniformVector3 {
  public get x(): number {
    return this._component(0);
  }

  public set x(value: number) {
    this._setComponent(0, value);
  }

  public get y(): number {
    return this._component(1);
  }

  public set y(value: number) {
    this._setComponent(1, value);
  }

  public get z(): number {
    return this._component(2);
  }

  public set z(value: number) {
    this._setComponent(2, value);
  }

  public set(x: number, y: number, z: number): void;
  public set(value: UniformVec3Input): void;
  public set(x: number | UniformVec3Input, y?: number, z?: number): void {
    const changed = typeof x === 'number' ? this._writeComponents(x, y!, z!) : this._write(x);

    if (changed) {
      this._sink._touch();
    }
  }

  public _write(value: unknown): boolean {
    if (isComponentList(value)) {
      return this._writeComponents(value[0]!, value[1]!, value[2]!);
    }

    if (__DEV__) {
      rejectValue(this._path, 'three numbers or `[x, y, z]`', value);
    }

    return false;
  }

  private _writeComponents(x: number, y: number, z: number): boolean {
    let changed = writeComponent(this._view, this._index, x);

    if (writeComponent(this._view, this._index + 1, y)) {
      changed = true;
    }
    if (writeComponent(this._view, this._index + 2, z)) {
      changed = true;
    }

    return changed;
  }
}

class Vector4Accessor extends VectorAccessor implements UniformVector4 {
  public get x(): number {
    return this._component(0);
  }

  public set x(value: number) {
    this._setComponent(0, value);
  }

  public get y(): number {
    return this._component(1);
  }

  public set y(value: number) {
    this._setComponent(1, value);
  }

  public get z(): number {
    return this._component(2);
  }

  public set z(value: number) {
    this._setComponent(2, value);
  }

  public get w(): number {
    return this._component(3);
  }

  public set w(value: number) {
    this._setComponent(3, value);
  }

  public set(x: number, y: number, z: number, w: number): void;
  public set(value: UniformVec4Input): void;
  public set(x: number | UniformVec4Input, y?: number, z?: number, w?: number): void {
    const changed = typeof x === 'number' ? this._writeComponents(x, y!, z!, w!) : this._write(x);

    if (changed) {
      this._sink._touch();
    }
  }

  public _write(value: unknown): boolean {
    if (isComponentList(value)) {
      return this._writeComponents(value[0]!, value[1]!, value[2]!, value[3]!);
    }

    // A Color carries its channels in 0..255 while a shader reads 0..1; the
    // alpha channel is already normalized.
    if (typeof value === 'object' && value !== null && 'r' in value && 'g' in value && 'b' in value && 'a' in value) {
      const color = value as { r: number; g: number; b: number; a: number };

      return this._writeComponents(color.r / 255, color.g / 255, color.b / 255, color.a);
    }

    if (__DEV__) {
      rejectValue(this._path, 'four numbers, `[r, g, b, a]`, or a Color', value);
    }

    return false;
  }

  private _writeComponents(x: number, y: number, z: number, w: number): boolean {
    let changed = writeComponent(this._view, this._index, x);

    if (writeComponent(this._view, this._index + 1, y)) {
      changed = true;
    }
    if (writeComponent(this._view, this._index + 2, z)) {
      changed = true;
    }
    if (writeComponent(this._view, this._index + 3, w)) {
      changed = true;
    }

    return changed;
  }
}

class Matrix3Accessor extends UniformAccessorBase implements UniformMatrix3 {
  private readonly _view: Float32Array;
  private readonly _index: number;

  public constructor(sink: UniformRevisionSink, path: string, view: Float32Array, index: number) {
    super(sink, path);
    this._view = view;
    this._index = index;
  }

  public set(value: UniformMat3Input): void {
    if (this._write(value)) {
      this._sink._touch();
    }
  }

  public _write(value: unknown): boolean {
    // A `Matrix` is read component-wise rather than through `toArray`: the
    // columns land in three 16-byte slots either way, and this path copies
    // nothing through an intermediate array.
    if (typeof value === 'object' && value !== null && 'a' in value && 'd' in value && 'z' in value) {
      const m = value as { a: number; b: number; c: number; d: number; e: number; f: number; x: number; y: number; z: number };

      return this._writeColumns(m.a, m.c, m.e, m.b, m.d, m.f, m.x, m.y, m.z);
    }

    if (isComponentList(value) && value.length >= 9) {
      return this._writeColumns(value[0]!, value[1]!, value[2]!, value[3]!, value[4]!, value[5]!, value[6]!, value[7]!, value[8]!);
    }

    if (__DEV__) {
      rejectValue(this._path, 'nine components in column-major order or a Matrix', value);
    }

    return false;
  }

  /** Arguments are the nine components in column-major order. */
  private _writeColumns(m0: number, m1: number, m2: number, m3: number, m4: number, m5: number, m6: number, m7: number, m8: number): boolean {
    const view = this._view;
    const base = this._index;
    // Each column occupies its own 16-byte slot, so the third column starts at
    // float index 8 and the last component sits at index 10, not 8.
    let changed = writeComponent(view, base, m0);

    if (writeComponent(view, base + 1, m1)) changed = true;
    if (writeComponent(view, base + 2, m2)) changed = true;
    if (writeComponent(view, base + 4, m3)) changed = true;
    if (writeComponent(view, base + 5, m4)) changed = true;
    if (writeComponent(view, base + 6, m5)) changed = true;
    if (writeComponent(view, base + 8, m6)) changed = true;
    if (writeComponent(view, base + 9, m7)) changed = true;
    if (writeComponent(view, base + 10, m8)) changed = true;

    return changed;
  }
}

class Matrix4Accessor extends UniformAccessorBase implements UniformMatrix4 {
  private readonly _view: Float32Array;
  private readonly _index: number;

  public constructor(sink: UniformRevisionSink, path: string, view: Float32Array, index: number) {
    super(sink, path);
    this._view = view;
    this._index = index;
  }

  public set(value: UniformMat4Input): void {
    if (this._write(value)) {
      this._sink._touch();
    }
  }

  public _write(value: unknown): boolean {
    if (isComponentList(value) && value.length >= 16) {
      let changed = false;

      for (let index = 0; index < 16; index++) {
        if (writeComponent(this._view, this._index + index, value[index]!)) {
          changed = true;
        }
      }

      return changed;
    }

    if (__DEV__) {
      rejectValue(this._path, 'sixteen components in column-major order', value);
    }

    return false;
  }
}

class ArrayAccessor extends UniformAccessorBase implements UniformArrayAccessor<unknown, unknown> {
  public readonly length: number;

  private readonly _elements: readonly UniformWritable[];

  public constructor(sink: UniformRevisionSink, path: string, elements: readonly UniformWritable[]) {
    super(sink, path);
    this.length = elements.length;
    this._elements = elements;
  }

  public at(index: number): unknown {
    const element = this._elements[index];

    if (element === undefined) {
      throw new RangeError(`[ExoJS] Uniform \`${this._path}\` has ${this.length} elements; index ${index} is out of range.`);
    }

    return element;
  }

  public set(values: readonly unknown[]): void {
    if (this._write(values)) {
      this._sink._touch();
    }
  }

  public _write(value: unknown): boolean {
    if (!isComponentList(value)) {
      if (__DEV__) {
        rejectValue(this._path, `up to ${this.length} array elements`, value);
      }

      return false;
    }

    const source = value as ArrayLike<unknown>;

    if (__DEV__ && source.length > this.length) {
      throw new Error(`[ExoJS] Uniform \`${this._path}\` holds ${this.length} elements; received ${source.length}.`);
    }

    const count = Math.min(source.length, this.length);
    let changed = false;

    for (let index = 0; index < count; index++) {
      if (this._elements[index]!._write(source[index])) {
        changed = true;
      }
    }

    return changed;
  }
}

class StructAccessor extends UniformAccessorBase {
  private readonly _members: ReadonlyMap<string, UniformWritable>;

  public constructor(sink: UniformRevisionSink, path: string, members: ReadonlyMap<string, UniformWritable>) {
    super(sink, path);
    this._members = members;

    for (const [name, accessor] of members) {
      Object.defineProperty(this, name, { value: accessor, enumerable: true, writable: false, configurable: false });
    }
  }

  public set(values: Record<string, unknown>): void {
    if (this._write(values)) {
      this._sink._touch();
    }
  }

  public _write(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) {
      if (__DEV__) {
        rejectValue(this._path, 'an object of field values', value);
      }

      return false;
    }

    let changed = false;

    for (const name of Object.keys(value)) {
      const member = this._members.get(name);

      if (member === undefined) {
        if (__DEV__) {
          throw new Error(`[ExoJS] Uniform \`${this._path}\` has no field \`${name}\`. Declared fields: ${[...this._members.keys()].join(', ')}.`);
        }

        continue;
      }

      if (member._write((value as Record<string, unknown>)[name])) {
        changed = true;
      }
    }

    return changed;
  }
}

const componentIndex = (byteOffset: number): number => byteOffset / 4;

const createLeafAccessor = (type: UniformType, sink: UniformRevisionSink, path: string, views: UniformBufferViews, index: number): UniformWritable => {
  switch (type) {
    case UniformType.Float:
      return new ScalarAccessor(sink, path, views.f32, index);
    case UniformType.Int:
      return new ScalarAccessor(sink, path, views.i32, index);
    case UniformType.Uint:
      return new ScalarAccessor(sink, path, views.u32, index);
    case UniformType.Vec2:
      return new Vector2Accessor(sink, path, views.f32, index);
    case UniformType.Vec3:
      return new Vector3Accessor(sink, path, views.f32, index);
    case UniformType.Vec4:
      return new Vector4Accessor(sink, path, views.f32, index);
    case UniformType.Mat3:
      return new Matrix3Accessor(sink, path, views.f32, index);
    case UniformType.Mat4:
      return new Matrix4Accessor(sink, path, views.f32, index);
  }
};

/**
 * Build the accessor for one layout node, offset by `byteDelta` (non-zero only
 * for array elements past the first). @internal
 */
export const createUniformAccessor = (
  node: UniformNodeLayout,
  byteDelta: number,
  views: UniformBufferViews,
  sink: UniformRevisionSink,
  path: string,
): UniformWritable => {
  if (node.kind === 'leaf') {
    return createLeafAccessor(node.type, sink, path, views, componentIndex(node.offset + byteDelta));
  }

  if (node.kind === 'array') {
    const array = node;
    const elements: UniformWritable[] = [];

    for (let index = 0; index < array.length; index++) {
      elements.push(createUniformAccessor(array.element, byteDelta + index * array.stride, views, sink, `${path}[${index}]`));
    }

    return new ArrayAccessor(sink, path, elements);
  }

  const struct = node;
  const members = new Map<string, UniformWritable>();

  for (const member of struct.members) {
    members.set(member.name, createUniformAccessor(member.node, byteDelta, views, sink, `${path}.${member.name}`));
  }

  return new StructAccessor(sink, path, members);
};

/** The bulk writer behind a whole block's `set(...)`. @internal */
export const createUniformFieldAccessors = (
  members: ReadonlyArray<{ readonly name: string; readonly node: UniformNodeLayout }>,
  views: UniformBufferViews,
  sink: UniformRevisionSink,
  path: string,
): Map<string, UniformWritable> => {
  const accessors = new Map<string, UniformWritable>();

  for (const member of members) {
    accessors.set(member.name, createUniformAccessor(member.node, 0, views, sink, `${path}${member.name}`));
  }

  return accessors;
};

/** Write a named value record into `accessors`; reports whether bytes changed. @internal */
export const writeUniformValues = (accessors: ReadonlyMap<string, UniformWritable>, values: Record<string, unknown>, path: string): boolean => {
  let changed = false;

  for (const name of Object.keys(values)) {
    const accessor = accessors.get(name);

    if (accessor === undefined) {
      if (__DEV__) {
        throw new Error(`[ExoJS] Uniform block \`${path}\` has no field \`${name}\`. Declared fields: ${[...accessors.keys()].join(', ')}.`);
      }

      continue;
    }

    if (accessor._write(values[name])) {
      changed = true;
    }
  }

  return changed;
};
