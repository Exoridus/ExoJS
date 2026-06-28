// Side-effect-free public API for @codexo/exojs-aseprite.
// No registration is performed on import.

export { asepriteBinding,AsepriteFormatError } from './asepriteBinding';
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
export { asepriteExtension } from './asepriteExtension';
export { AsepriteSheet } from './AsepriteSheet';

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
