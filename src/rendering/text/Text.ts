import { Container } from '@/rendering/Container';
import { Mesh } from '@/rendering/mesh/Mesh';
import { getDefaultGlyphAtlas } from './atlas-singleton';
import { layoutText } from './TextLayout';
import type { TextStyleOptions } from './TextStyle';
import { TextStyle } from './TextStyle';
import type { GlyphPlacement } from './types';

function buildMesh(placements: ReadonlyArray<GlyphPlacement>, style: TextStyle): Mesh {
    const n = placements.length;
    const vertices = new Float32Array(n * 4 * 2);
    const uvs = new Float32Array(n * 4 * 2);
    const indices = new Uint16Array(n * 6);

    for (let i = 0; i < n; i++) {
        const p = placements[i];
        const v = i * 8;
        const u = i * 8;
        const idx = i * 6;
        const baseV = i * 4;

        // Vertices: TL, TR, BR, BL
        vertices[v + 0] = p.x;              vertices[v + 1] = p.y;
        vertices[v + 2] = p.x + p.width;    vertices[v + 3] = p.y;
        vertices[v + 4] = p.x + p.width;    vertices[v + 5] = p.y + p.height;
        vertices[v + 6] = p.x;              vertices[v + 7] = p.y + p.height;

        // UVs: TL, TR, BR, BL
        uvs[u + 0] = p.uvLeft;   uvs[u + 1] = p.uvTop;
        uvs[u + 2] = p.uvRight;  uvs[u + 3] = p.uvTop;
        uvs[u + 4] = p.uvRight;  uvs[u + 5] = p.uvBottom;
        uvs[u + 6] = p.uvLeft;   uvs[u + 7] = p.uvBottom;

        // Indices: [TL, TR, BR, TL, BR, BL]
        indices[idx + 0] = baseV + 0;
        indices[idx + 1] = baseV + 1;
        indices[idx + 2] = baseV + 2;
        indices[idx + 3] = baseV + 0;
        indices[idx + 4] = baseV + 2;
        indices[idx + 5] = baseV + 3;
    }

    const atlas = getDefaultGlyphAtlas();
    const mesh = new Mesh({
        vertices,
        uvs,
        indices,
        texture: atlas.texture,
    });

    mesh.tint = style.fillColor;

    return mesh;
}

/**
 * GPU-accelerated text node that rasterizes individual glyphs into a shared
 * atlas ({@link DynamicGlyphAtlas}) and renders them as a single quad-per-
 * glyph {@link Mesh} (one draw call per Text instance).
 *
 * Glyphs are always rasterized in white and tinted at runtime via
 * `Mesh.tint`; changing `style.fillColor` only updates the mesh tint —
 * no atlas re-rasterization is needed.
 *
 * The internal {@link Mesh} is the sole child of this {@link Container}.
 * All transform properties (position, rotation, scale, origin) are
 * inherited from {@link Container} → {@link RenderNode}.
 */
export class Text extends Container {

    private _text: string;
    private _style: TextStyle;
    private _mesh: Mesh | null = null;

    public constructor(text: string, style?: TextStyle | TextStyleOptions) {
        super();

        this._text = text;
        this._style = (style && style instanceof TextStyle) ? style : new TextStyle(style);

        this._rebuild();
    }

    public get text(): string {
        return this._text;
    }

    public set text(value: string) {
        this.setText(value);
    }

    public get style(): TextStyle {
        return this._style;
    }

    public set style(style: TextStyle | TextStyleOptions) {
        this.setStyle(style);
    }

    public setText(text: string): this {
        if (this._text !== text) {
            this._text = text;
            this._rebuild();
        }

        return this;
    }

    public setStyle(style: TextStyle | TextStyleOptions): this {
        this._style = (style instanceof TextStyle) ? style : new TextStyle(style);
        this._rebuild();

        return this;
    }

    public override destroy(): void {
        if (this._mesh !== null) {
            this._mesh.destroy();
            this._mesh = null;
        }

        super.destroy();
    }

    // -----------------------------------------------------------------------

    private _rebuild(): void {
        // Remove and discard the old mesh (if any).
        if (this._mesh !== null) {
            this.removeChild(this._mesh);
            this._mesh.destroy();
            this._mesh = null;
        }

        if (this._text.length === 0) {
            return;
        }

        const atlas = getDefaultGlyphAtlas();
        const placements = layoutText(this._text, this._style, atlas);

        if (placements.length === 0) {
            return;
        }

        this._mesh = buildMesh(placements, this._style);
        this.addChild(this._mesh);
    }
}
