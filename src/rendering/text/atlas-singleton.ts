import { DynamicGlyphAtlas } from './DynamicGlyphAtlas';

let _defaultAtlas: DynamicGlyphAtlas | null = null;

/**
 * Returns the shared process-wide glyph atlas, creating it lazily on first
 * call.  All `Text` instances share this atlas so that identical glyph shapes
 * (same char + family + size + weight + style) are rasterized only once.
 */
export function getDefaultGlyphAtlas(): DynamicGlyphAtlas {
    if (_defaultAtlas === null) {
        _defaultAtlas = new DynamicGlyphAtlas();
    }

    return _defaultAtlas;
}
