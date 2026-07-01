import type { Texture } from '@codexo/exojs';

import type { TileProperties } from './types';

/** Construction options for an {@link ImageLayer}. */
export interface ImageLayerOptions {
  /** Layer id (unique within the map). */
  readonly id: number;
  /** Layer name. */
  readonly name?: string;
  /** Layer class string. */
  readonly class?: string;
  /** Resolved image URL. */
  readonly image: string;
  /** Loaded texture for the image, or `null` if unavailable. */
  readonly texture?: Texture | null;
  /** Whether the layer is visible. Default `true`. */
  readonly visible?: boolean;
  /** Layer opacity in `[0, 1]`. Default `1`. */
  readonly opacity?: number;
  /** Layer pixel offset X. Default `0`. */
  readonly offsetX?: number;
  /** Layer pixel offset Y. Default `0`. */
  readonly offsetY?: number;
  /** Horizontal parallax factor. Default `1`. */
  readonly parallaxX?: number;
  /** Vertical parallax factor. Default `1`. */
  readonly parallaxY?: number;
  /** Tint colour as `0xRRGGBB`, or `null`. Default `null`. */
  readonly tintColor?: number | null;
  /** Whether the image repeats horizontally. Default `false`. */
  readonly repeatX?: boolean;
  /** Whether the image repeats vertically. Default `false`. */
  readonly repeatY?: boolean;
  /** Layer properties (copied and frozen). */
  readonly properties?: TileProperties;
}

/**
 * A data-only image layer: a single image (texture + resolved URL) placed as a
 * background or foreground layer. Image layers are not rendered by the tile
 * renderer — they are exposed as data for a renderer or follow-up scene node to
 * consume.
 *
 * Parallax, opacity, tint, offset, and repeat flags are carried from the
 * source Tiled map.
 *
 * @advanced
 */
export class ImageLayer {
  /** Layer-kind discriminant. */
  public readonly kind = 'image' as const;

  /** Layer id (unique within the map). */
  public readonly id: number;
  /** Layer name. */
  public readonly name: string;
  /** Layer class string. */
  public readonly class: string;
  /** Resolved URL of the layer image. */
  public readonly image: string;
  /** Loaded texture for the image, or `null` if unavailable. */
  public readonly texture: Texture | null;
  /** Whether the layer is visible. */
  public readonly visible: boolean;
  /** Layer opacity in `[0, 1]`. */
  public readonly opacity: number;
  /** Layer pixel offset X. */
  public readonly offsetX: number;
  /** Layer pixel offset Y. */
  public readonly offsetY: number;
  /** Horizontal parallax factor. */
  public readonly parallaxX: number;
  /** Vertical parallax factor. */
  public readonly parallaxY: number;
  /** Tint colour as `0xRRGGBB`, or `null`. */
  public readonly tintColor: number | null;
  /** Whether the image repeats horizontally. */
  public readonly repeatX: boolean;
  /** Whether the image repeats vertically. */
  public readonly repeatY: boolean;
  /** Immutable layer properties. */
  public readonly properties: TileProperties;

  public constructor(options: ImageLayerOptions) {
    this.id = options.id;
    this.name = options.name ?? '';
    this.class = options.class ?? '';
    this.image = options.image;
    this.texture = options.texture ?? null;
    this.visible = options.visible ?? true;
    this.opacity = options.opacity ?? 1;
    this.offsetX = options.offsetX ?? 0;
    this.offsetY = options.offsetY ?? 0;
    this.parallaxX = options.parallaxX ?? 1;
    this.parallaxY = options.parallaxY ?? 1;
    this.tintColor = options.tintColor ?? null;
    this.repeatX = options.repeatX ?? false;
    this.repeatY = options.repeatY ?? false;
    this.properties = options.properties
      ? Object.freeze({ ...options.properties })
      : Object.freeze({});
  }
}
