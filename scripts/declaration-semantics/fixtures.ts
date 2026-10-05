/**
 * Scene fixtures for the public type-surface contracts.
 *
 * The point of the consumer that compiles this file is the *shape* of these two
 * classes, so it stays deliberately close to a template scene: `Scene<void>` for
 * both, differing only in how much a subclass contributes. What the shipped
 * declarations must preserve is the activation-data type, so the fixtures exist
 * in both flavours - no data, and data. The asset types pin the descriptor
 * contracts: leaf-policy branding and required option bags. The components pin
 * exact-class lookup, the host constraint and typed query rows.
 */
import { type AssetFactory, AssetType, BehaviorComponent, Component, Scene, type Seconds, type Sprite } from '@codexo/exojs';

export interface PlayerData {
  readonly hp: number;
  readonly name: string;
}

/** A scene that takes no activation data, like every starter template's scene. */
export class BareScene extends Scene {}

/** A scene that requires activation data. */
export class DataScene extends Scene<PlayerData> {}

/** An asset type with an object payload that keeps the default `'ref'` leaf. */
export class MetaAssetType extends AssetType<unknown, { readonly hp: number }> {
  public readonly id = 'com.example.meta';

  public createFactory(): AssetFactory<unknown, { readonly hp: number }> {
    return { create: () => Promise.resolve({ hp: 1 }) };
  }
}

/** An asset type whose option bag has a required field. */
export class LocalizedAssetType extends AssetType<unknown, string, { readonly locale: string }> {
  public readonly id = 'com.example.localized';

  public createFactory(): AssetFactory<unknown, string, { readonly locale: string }> {
    return { create: () => Promise.resolve('text') };
  }
}

/** A component any node can carry. */
export class Health extends Component {
  public current = 100;
}

/** A second component, for multi-class queries. */
export class Armor extends Component {
  public value = 5;
}

/** A behaviour that requires a sprite as its host. */
export class Spin extends BehaviorComponent<Sprite> {
  public override update(delta: Seconds): void {
    this.node.rotate(delta);
  }
}
