/**
 * Scene fixtures for the public type-surface contracts.
 *
 * The point of the consumer that compiles this file is the *shape* of these two
 * classes, so it stays deliberately close to a template scene: `Scene<void>` for
 * both, differing only in how much a subclass contributes. What the shipped
 * declarations must preserve is the activation-data type, so the fixtures exist
 * in both flavours - no data, and data.
 */
import { Scene } from '@codexo/exojs';

export interface PlayerData {
  readonly hp: number;
  readonly name: string;
}

/** A scene that takes no activation data, like every starter template's scene. */
export class BareScene extends Scene {}

/** A scene that requires activation data. */
export class DataScene extends Scene<PlayerData> {}
