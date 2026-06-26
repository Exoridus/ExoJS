// Side-effect-free public API for @codexo/exojs-aseprite.
// No registration is performed on import.

export type {
  AsepriteArrayData,
  AsepriteData,
  AsepriteDirection,
  AsepriteFrameData,
  AsepriteFrameTag,
  AsepriteHashData,
  AsepriteLayer,
  AsepriteMeta,
  AsepriteRect,
  AsepriteSize,
  AsepriteSlice,
  AsepriteSliceKey,
} from './AsepriteData';
export { isAsepriteArrayData } from './AsepriteData';
export { AsepriteSheet } from './AsepriteSheet';
export { AsepriteFormatError, asepriteBinding } from './asepriteBinding';
export { asepriteExtension } from './asepriteExtension';

// ── Module augmentation — typed load calls ────────────────────────────────────
import type { AsepriteSheet } from './AsepriteSheet';

declare module '@codexo/exojs' {
  interface AssetDefinitions {
    asepriteSheet: {
      resource: AsepriteSheet;
      config: { source: string };
    };
  }
}
