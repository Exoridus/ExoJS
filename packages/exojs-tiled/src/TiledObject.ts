import type { TiledObjectData, TiledPointData, TiledPropertyData, TiledTextData } from './data';

/**
 * A parsed Tiled object, placed in an {@link TiledObjectLayer} or a tile's
 * collision `objectgroup`.
 *
 * The shape of the object is determined by which of {@link point},
 * {@link ellipse}, {@link polygon}, {@link polyline}, {@link text}, or
 * {@link gid} is set; if none are set, the object is a plain rectangle
 * spanning `[x, y, width, height]`.
 */
export class TiledObject {
  public readonly id: number;
  public readonly name: string;
  public readonly type: string;
  public readonly x: number;
  public readonly y: number;
  public readonly width: number;
  public readonly height: number;
  public readonly rotation: number;
  public readonly visible: boolean;
  public readonly gid?: number | undefined;
  public readonly point: boolean;
  public readonly ellipse: boolean;
  public readonly polygon?: readonly TiledPointData[] | undefined;
  public readonly polyline?: readonly TiledPointData[] | undefined;
  public readonly text?: TiledTextData | undefined;
  public readonly template?: string | undefined;
  public readonly properties: readonly TiledPropertyData[];

  public constructor(data: TiledObjectData) {
    this.id = data.id;
    this.name = data.name;
    this.type = data.type;
    this.x = data.x;
    this.y = data.y;
    this.width = data.width;
    this.height = data.height;
    this.rotation = data.rotation;
    this.visible = data.visible;
    this.gid = data.gid;
    this.point = data.point ?? false;
    this.ellipse = data.ellipse ?? false;
    this.polygon = data.polygon;
    this.polyline = data.polyline;
    this.text = data.text;
    this.template = data.template;
    this.properties = data.properties ?? [];
  }

  /** Looks up a custom property by name. */
  public getProperty(name: string): TiledPropertyData | undefined {
    return this.properties.find(property => property.name === name);
  }
}
