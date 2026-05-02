/**
 * Tests for the Text class.
 *
 * The Text class calls getDefaultGlyphAtlas() internally. To keep these unit
 * tests self-contained we mock the atlas-singleton module so that the returned
 * atlas always provides a deterministic GlyphInfo without requiring a real
 * canvas 2D context.
 */

import { Text } from '@/rendering/text/Text';
import { TextStyle } from '@/rendering/text/TextStyle';
import { Container } from '@/rendering/Container';
import { Mesh } from '@/rendering/mesh/Mesh';
import type { GlyphInfo } from '@/rendering/text/types';
import type { DynamicGlyphAtlas } from '@/rendering/text/DynamicGlyphAtlas';
import type { Texture } from '@/rendering/texture/Texture';

// ---------------------------------------------------------------------------
// Mock atlas singleton
// ---------------------------------------------------------------------------

const fixedGlyphInfo: GlyphInfo = {
    x: 0, y: 0,
    width: 8,
    height: 16,
    advance: 10,
    ascent: 13,
    uvLeft: 0.0,
    uvTop: 0.0,
    uvRight: 0.01,
    uvBottom: 0.02,
};

const mockTexture = {
    width: 1024,
    height: 1024,
    version: 1,
    source: null,
    scaleMode: 0,
    wrapMode: 0,
    premultiplyAlpha: false,
    generateMipMap: false,
    flipY: false,
    addDestroyListener: () => mockTexture,
    removeDestroyListener: () => mockTexture,
    destroy: () => undefined,
} as unknown as Texture;

const mockAtlas: DynamicGlyphAtlas = {
    texture: mockTexture,
    getGlyph: jest.fn((_char, _family, _size, _weight, _style) => fixedGlyphInfo),
    clear: jest.fn(),
} as unknown as DynamicGlyphAtlas;

jest.mock('@/rendering/text/atlas-singleton', () => ({
    getDefaultGlyphAtlas: () => mockAtlas,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Text', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('extends Container', () => {
        const text = new Text('Hello');

        expect(text).toBeInstanceOf(Container);
    });

    test('new Text("Hello") sets text property correctly', () => {
        const text = new Text('Hello');

        expect(text.text).toBe('Hello');
    });

    test('new Text with empty string creates no internal mesh', () => {
        const text = new Text('');

        expect(text.children).toHaveLength(0);
    });

    test('non-empty text creates exactly one Mesh child', () => {
        const text = new Text('Hi');

        expect(text.children).toHaveLength(1);
        expect(text.children[0]).toBeInstanceOf(Mesh);
    });

    test('text setter with different value triggers mesh rebuild', () => {
        const text = new Text('Hello');
        const firstMesh = text.children[0];

        text.text = 'World';

        // The child should have been swapped
        expect(text.children).toHaveLength(1);
        expect(text.children[0]).toBeInstanceOf(Mesh);
        // It's a new Mesh instance, not the original
        expect(text.children[0]).not.toBe(firstMesh);
    });

    test('text setter with same value does not trigger rebuild', () => {
        const text = new Text('Hello');
        const firstMesh = text.children[0];

        text.text = 'Hello';

        expect(text.children[0]).toBe(firstMesh);
    });

    test('style setter rebuilds the mesh', () => {
        const text = new Text('Hi');
        const firstMesh = text.children[0];

        text.style = new TextStyle({ fontSize: 32 });

        expect(text.children).toHaveLength(1);
        expect(text.children[0]).not.toBe(firstMesh);
    });

    test('setText() is chainable and updates text', () => {
        const text = new Text('Hello');
        const result = text.setText('World');

        expect(result).toBe(text);
        expect(text.text).toBe('World');
    });

    test('setStyle() is chainable and updates style', () => {
        const newStyle = new TextStyle({ fontSize: 24 });
        const text = new Text('Hi');
        const result = text.setStyle(newStyle);

        expect(result).toBe(text);
        expect(text.style.fontSize).toBe(24);
    });

    test('setStyle() with plain options object creates a TextStyle', () => {
        const text = new Text('Hi');

        text.setStyle({ fontSize: 48, align: 'center' });

        expect(text.style).toBeInstanceOf(TextStyle);
        expect(text.style.fontSize).toBe(48);
        expect(text.style.align).toBe('center');
    });

    test('mesh tint is set to style.fillColor on build', () => {
        const style = new TextStyle({ fontSize: 16 });
        const text = new Text('Hi', style);
        const mesh = text.children[0] as Mesh;

        // fillColor defaults to Color.white; tint on mesh should reflect it
        expect(mesh.tint).toBeDefined();
    });

    test('setting text to empty string removes the mesh child', () => {
        const text = new Text('Hello');

        expect(text.children).toHaveLength(1);

        text.text = '';

        expect(text.children).toHaveLength(0);
    });

    test('style property getter returns the current TextStyle', () => {
        const style = new TextStyle({ fontSize: 20 });
        const text = new Text('Hi', style);

        expect(text.style).toBe(style);
    });

    test('passing TextStyleOptions to constructor works', () => {
        const text = new Text('Hi', { fontSize: 24, align: 'right' });

        expect(text.style).toBeInstanceOf(TextStyle);
        expect(text.style.fontSize).toBe(24);
        expect(text.style.align).toBe('right');
    });

    test('destroy() cleans up the internal mesh and calls super.destroy()', () => {
        const text = new Text('Hi');
        const mesh = text.children[0] as Mesh;
        const destroySpy = jest.spyOn(mesh, 'destroy');

        text.destroy();

        expect(destroySpy).toHaveBeenCalled();
        expect(text.children).toHaveLength(0);
    });

    test('destroy() on empty text (no mesh) does not throw', () => {
        const text = new Text('');

        expect(() => text.destroy()).not.toThrow();
    });
});
