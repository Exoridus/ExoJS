import type {
  TiledChunkData,
  TiledGroupLayerData,
  TiledImageLayerData,
  TiledLayerData,
  TiledLayerDataBase,
  TiledObjectLayerData,
  TiledPropertyData,
  TiledTileLayerData,
} from './data';
import { TiledObject } from './TiledObject';

/** Discriminant shared by every {@link TiledLayer} subclass, mirroring {@link TiledLayerData}'s `type`. */
export type TiledLayerType = TiledLayerData['type'];

/**
 * Base class for the four parsed Tiled layer types. Holds the fields shared
 * by every layer (`tilelayer`, `objectgroup`, `imagelayer`, `group`).
 *
 * Use {@link TiledLayer.type} (or `instanceof`) to discriminate between
 * {@link TiledTileLayer}, {@link TiledObjectLayer}, {@link TiledImageLayer},
 * and {@link TiledGroupLayer}.
 */
export abstract class TiledLayer {
  public abstract readonly type: TiledLayerType;

  public readonly id: number;
  public readonly name: string;
  public readonly class: string;
  public readonly visible: boolean;
  public readonly opacity: number;
  public readonly x: number;
  public readonly y: number;
  public readonly offsetX: number;
  public readonly offsetY: number;
  public readonly parallaxX: number;
  public readonly parallaxY: number;
  public readonly tintColor?: string | undefined;
  public readonly properties: readonly TiledPropertyData[];

  protected constructor(data: TiledLayerDataBase) {
    this.id = data.id;
    this.name = data.name;
    this.class = data.class ?? '';
    this.visible = data.visible;
    this.opacity = data.opacity;
    this.x = data.x;
    this.y = data.y;
    this.offsetX = data.offsetx ?? 0;
    this.offsetY = data.offsety ?? 0;
    this.parallaxX = data.parallaxx ?? 1;
    this.parallaxY = data.parallaxy ?? 1;
    this.tintColor = data.tintcolor;
    this.properties = data.properties ?? [];
  }

  /** Looks up a custom property by name. */
  public getProperty(name: string): TiledPropertyData | undefined {
    return this.properties.find(property => property.name === name);
  }
}

/**
 * A tile layer. On a finite map, {@link data} holds the flat row-major array
 * of GIDs (`width * height` entries). On an infinite map, {@link chunks}
 * holds the sparse list of tile chunks instead; exactly one of the two is
 * defined, matching the owning {@link TiledMap}'s `infinite` flag.
 */
export class TiledTileLayer extends TiledLayer {
  public override readonly type = 'tilelayer' as const;

  public readonly width: number;
  public readonly height: number;
  public readonly data?: readonly number[] | undefined;
  public readonly chunks?: readonly TiledChunkData[] | undefined;

  public constructor(data: TiledTileLayerData) {
    super(data);
    this.width = data.width;
    this.height = data.height;
    this.data = data.data;
    this.chunks = data.chunks;
  }
}

/** An object layer: a flat list of {@link TiledObject}s. */
export class TiledObjectLayer extends TiledLayer {
  public override readonly type = 'objectgroup' as const;

  public readonly drawOrder: NonNullable<TiledObjectLayerData['draworder']>;
  public readonly objects: readonly TiledObject[];

  public constructor(data: TiledObjectLayerData) {
    super(data);
    this.drawOrder = data.draworder ?? 'topdown';
    this.objects = data.objects.map(object => new TiledObject(object));
  }
}

/**
 * An image layer. {@link image} is the path to the layer's image exactly as
 * written in the Tiled JSON (relative to the map's location); resolving it
 * against the owning {@link TiledMap}'s `source` is left to the consumer.
 */
export class TiledImageLayer extends TiledLayer {
  public override readonly type = 'imagelayer' as const;

  public readonly image: string;
  public readonly repeatX: boolean;
  public readonly repeatY: boolean;

  public constructor(data: TiledImageLayerData) {
    super(data);
    this.image = data.image;
    this.repeatX = data.repeatx ?? false;
    this.repeatY = data.repeaty ?? false;
  }
}

/** A group layer, recursively containing further parsed layers. */
export class TiledGroupLayer extends TiledLayer {
  public override readonly type = 'group' as const;

  public readonly layers: readonly TiledLayer[];

  public constructor(data: TiledGroupLayerData) {
    super(data);
    this.layers = data.layers.map(createTiledLayer);
  }
}

/** Constructs the appropriate {@link TiledLayer} subclass for `data.type`. */
export function createTiledLayer(data: TiledLayerData): TiledLayer {
  switch (data.type) {
    case 'tilelayer':
      return new TiledTileLayer(data);
    case 'objectgroup':
      return new TiledObjectLayer(data);
    case 'imagelayer':
      return new TiledImageLayer(data);
    case 'group':
      return new TiledGroupLayer(data);
  }
}
