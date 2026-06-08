import { Rectangle } from '#math/Rectangle';

import type { AttributeType, GeometryAttribute, GeometryOptions, GeometryUsage, Topology } from './GeometryAttribute';

const attributeTypeByteSizes: Record<AttributeType, number> = {
  f32: 4,
  u8: 1,
  u16: 2,
  u32: 4,
  i32: 4,
};

const validTopologies = new Set<Topology>(['triangle-list', 'triangle-strip']);
const validUsages = new Set<GeometryUsage>(['static', 'dynamic', 'stream']);
const positionAttributeNames = new Set<string>(['a_position', 'position']);

const geometryIds = new WeakMap<object, number>();
let nextGeometryId = 1;

const getOrCreateGeometryId = (geometry: object): number => {
  const cached = geometryIds.get(geometry);

  if (cached !== undefined) {
    return cached;
  }

  const id = nextGeometryId++;
  geometryIds.set(geometry, id);

  return id;
};

const getVertexCount = (vertexData: Float32Array | ArrayBuffer, stride: number): number => {
  const { byteLength } = vertexData;

  if (byteLength % stride !== 0) {
    throw new Error(`Geometry vertexData byteLength ${byteLength} must be divisible by stride ${stride}.`);
  }

  return byteLength / stride;
};

const readComponent = (view: DataView, type: AttributeType, offset: number, normalized: boolean): number => {
  switch (type) {
    case 'f32':
      return view.getFloat32(offset, true);
    case 'u8': {
      const value = view.getUint8(offset);
      return normalized ? value / 255 : value;
    }
    case 'u16': {
      const value = view.getUint16(offset, true);
      return normalized ? value / 65535 : value;
    }
    case 'u32': {
      const value = view.getUint32(offset, true);
      return normalized ? value / 4294967295 : value;
    }
    case 'i32': {
      const value = view.getInt32(offset, true);
      return normalized ? Math.max(value / 2147483647, -1) : value;
    }
    default:
      return 0;
  }
};

const cloneAttributes = (attributes: readonly GeometryAttribute[]): readonly GeometryAttribute[] => {
  return attributes.map(attribute => ({ ...attribute }));
};

const resolvePositionAttribute = (attributes: readonly GeometryAttribute[]): GeometryAttribute => {
  const directMatch = attributes.find(attribute => positionAttributeNames.has(attribute.name));

  if (directMatch) {
    return directMatch;
  }

  const fuzzyMatch = attributes.find(attribute => attribute.name.toLowerCase().includes('position'));

  if (fuzzyMatch) {
    return fuzzyMatch;
  }

  throw new Error('Geometry requires a position attribute named `a_position` or `position`.');
};

interface AttributeRange {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Non-renderable geometry data object used by advanced rendering paths.
 *
 * Geometry owns only vertex/index data and its layout metadata; it is not a
 * scene node, has no transform state, and cannot render itself.
 * @advanced
 */
export class Geometry {
  public readonly attributes: readonly GeometryAttribute[];
  public readonly stride: number;
  public readonly topology: Topology;
  public readonly usage: GeometryUsage;
  public readonly indices: Uint16Array | Uint32Array | null;

  public vertexData: Float32Array | ArrayBuffer;

  private _version = 0;
  private _localBounds = new Rectangle();
  private _localBoundsDirty = true;
  private readonly _positionAttribute: GeometryAttribute;
  private readonly _disposeCallbacks = new Set<() => void>();

  public constructor(options: GeometryOptions) {
    const { attributes, vertexData, stride, indices = null, topology = 'triangle-list', usage = 'static' } = options;

    if (attributes.length === 0) {
      throw new Error('Geometry attributes must be a non-empty array.');
    }

    if (!Number.isInteger(stride) || stride <= 0) {
      throw new Error(`Geometry stride must be a positive integer (got ${stride}).`);
    }

    if (!validTopologies.has(topology)) {
      throw new Error(`Geometry topology must be one of: triangle-list, triangle-strip (got ${String(topology)}).`);
    }

    if (!validUsages.has(usage)) {
      throw new Error(`Geometry usage must be one of: static, dynamic, stream (got ${String(usage)}).`);
    }

    const ranges: AttributeRange[] = [];
    const names = new Set<string>();

    for (const attribute of attributes) {
      if (typeof attribute.name !== 'string' || attribute.name.length === 0) {
        throw new Error('Geometry attribute name must be a non-empty string.');
      }
      if (names.has(attribute.name)) {
        throw new Error(`Geometry attribute "${attribute.name}" is declared more than once.`);
      }
      names.add(attribute.name);

      if (!Number.isInteger(attribute.size) || attribute.size < 1 || attribute.size > 4) {
        throw new Error(`Geometry attribute "${attribute.name}" size must be an integer in [1..4] (got ${attribute.size}).`);
      }
      if (!Number.isInteger(attribute.offset) || attribute.offset < 0) {
        throw new Error(`Geometry attribute "${attribute.name}" offset must be a non-negative integer (got ${attribute.offset}).`);
      }

      const byteSize = attributeTypeByteSizes[attribute.type];
      const end = attribute.offset + byteSize * attribute.size;

      if (end > stride) {
        throw new Error(`Geometry attribute "${attribute.name}" range [${attribute.offset}, ${end}) exceeds stride ${stride}.`);
      }

      for (const range of ranges) {
        if (attribute.offset < range.end && end > range.start) {
          throw new Error(`Geometry attribute "${attribute.name}" overlaps attribute "${range.name}" in the interleaved layout.`);
        }
      }

      ranges.push({ name: attribute.name, start: attribute.offset, end });
    }

    const positionAttribute = resolvePositionAttribute(attributes);

    if (positionAttribute.size < 2) {
      throw new Error(`Geometry position attribute "${positionAttribute.name}" must declare at least 2 components.`);
    }

    const vertexCount = getVertexCount(vertexData, stride);

    if (indices !== null) {
      for (let i = 0; i < indices.length; i++) {
        if (indices[i] >= vertexCount) {
          throw new Error(`Geometry index ${indices[i]} at position ${i} is out of range for vertex count ${vertexCount}.`);
        }
      }
    }

    this.attributes = cloneAttributes(attributes);
    this.vertexData = vertexData;
    this.stride = stride;
    this.indices = indices;
    this.topology = topology;
    this.usage = usage;
    this._positionAttribute = { ...positionAttribute };
  }

  public get vertexCount(): number {
    return getVertexCount(this.vertexData, this.stride);
  }

  public get indexCount(): number {
    return this.indices?.length ?? this.vertexCount;
  }

  public get version(): number {
    return this._version;
  }

  public get id(): number {
    return getOrCreateGeometryId(this);
  }

  /** Mark vertex data as mutated in place so backends can re-upload GPU buffers. */
  public invalidate(): this {
    this._version++;
    this._localBoundsDirty = true;

    return this;
  }

  /** Return local-space bounds; when `out` is provided it is populated and returned. */
  public getLocalBounds(out: Rectangle = this._localBounds): Rectangle {
    if (this._localBoundsDirty) {
      this.recomputeLocalBounds();
    }

    if (out === this._localBounds) {
      return this._localBounds;
    }

    return out.copy(this._localBounds);
  }

  /** Force local-space AABB recomputation from the current position attribute data. */
  public recomputeLocalBounds(): this {
    const vertexCount = this.vertexCount;

    if (vertexCount === 0) {
      this._localBounds.set(0, 0, 0, 0);
      this._localBoundsDirty = false;
      return this;
    }

    const view =
      this.vertexData instanceof Float32Array
        ? new DataView(this.vertexData.buffer, this.vertexData.byteOffset, this.vertexData.byteLength)
        : new DataView(this.vertexData);

    const componentByteSize = attributeTypeByteSizes[this._positionAttribute.type];

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
      const start = vertexIndex * this.stride + this._positionAttribute.offset;
      const x = readComponent(view, this._positionAttribute.type, start, this._positionAttribute.normalized);
      const y = readComponent(view, this._positionAttribute.type, start + componentByteSize, this._positionAttribute.normalized);

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    this._localBounds.set(minX, minY, maxX - minX, maxY - minY);
    this._localBoundsDirty = false;

    return this;
  }

  /** Release backend-owned resources associated with this geometry instance. */
  public destroy(): void {
    for (const callback of this._disposeCallbacks) {
      callback();
    }

    this._disposeCallbacks.clear();
  }

  /**
   * Internal backend hook used to register per-geometry cleanup callbacks.
   * @internal
   */
  public _onDispose(callback: () => void): void {
    this._disposeCallbacks.add(callback);
  }
}
