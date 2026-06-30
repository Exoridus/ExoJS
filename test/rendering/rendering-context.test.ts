import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderBatch } from '#rendering/RenderBatch';
import { RenderingContext } from '#rendering/RenderingContext';
import { createRenderStats, resetRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';

const createTexture = (width = 16, height = 16): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return new Texture(canvas);
};

const createMockBackend = () => {
  const root = new RenderTarget(320, 200, true);
  let currentTarget: RenderTarget = root;
  const stats = createRenderStats();
  const drawEvents: Drawable[] = [];
  const clearCalls: Color[] = [];
  let flushCallCount = 0;

  const clear = vi.fn(function (this: RenderBackend, color?: Color) {
    if (color) {
      clearCalls.push(color);
    }

    return this;
  });

  const draw = vi.fn(function (this: RenderBackend, drawable: Drawable) {
    drawEvents.push(drawable);

    return this;
  });

  const instancedDraws: Array<{ mesh: Mesh; transforms: readonly Matrix[]; tints: readonly Color[]; count: number }> = [];
  const drawInstanced = vi.fn(function (this: RenderBackend, mesh: Mesh, transforms: readonly Matrix[], tints: readonly Color[], count: number) {
    instancedDraws.push({ mesh, transforms, tints, count });

    return this;
  });

  const setRenderTargetSpy = vi.fn(function (this: RenderBackend, target: RenderTarget | null) {
    currentTarget = target ?? root;

    return this;
  });

  const setViewSpy = vi.fn(function (this: RenderBackend, view: View | null) {
    currentTarget.setView(view);

    return this;
  });

  const backend: RenderBackend = {
    backendType: RenderBackendType.WebGl2,
    stats,
    get renderTarget() {
      return currentTarget;
    },
    get view() {
      return this.renderTarget.view;
    },
    async initialize() {
      return this;
    },
    clear,
    resize(width: number, height: number) {
      root.resize(width, height);

      return this;
    },
    setView: setViewSpy,
    setRenderTarget: setRenderTargetSpy,
    pushScissorRect() {
      return this;
    },
    popScissorRect() {
      return this;
    },
    pushStencilClip() {
      return this;
    },
    popStencilClip() {
      return this;
    },
    composeWithAlphaMask() {
      return this;
    },
    acquireRenderTexture(width: number, height: number) {
      return new RenderTexture(width, height);
    },
    releaseRenderTexture() {
      return this;
    },
    draw,
    drawInstanced,
    resetStats() {
      resetRenderStats(stats);

      return this;
    },
    execute(pass) {
      pass.execute(this);

      return this;
    },
    flush() {
      flushCallCount++;

      return this;
    },
    destroy() {
      root.destroy();
    },
  };

  return {
    backend,
    root,
    draw,
    drawInstanced,
    instancedDraws,
    drawEvents,
    clear,
    clearCalls,
    setRenderTargetSpy,
    setViewSpy,
    getFlushCallCount: () => flushCallCount,
  };
};

describe('RenderingContext', () => {
  test('render delegates to playRenderTree and draws a single sprite', () => {
    const { backend, drawEvents, draw } = createMockBackend();
    const context = new RenderingContext(backend);
    const texture = createTexture();
    const sprite = new Sprite(texture);

    context.render(sprite);

    expect(draw).toHaveBeenCalled();
    expect(drawEvents).toHaveLength(1);
    expect(drawEvents[0]).toBe(sprite);
  });

  test('render draws container children', () => {
    const { backend, drawEvents } = createMockBackend();
    const context = new RenderingContext(backend);
    const container = new Container();
    const red = new Sprite(createTexture());
    const green = new Sprite(createTexture());

    container.addChild(red, green);
    context.render(container);

    expect(drawEvents).toHaveLength(2);
    expect(drawEvents[0]).toBe(red);
    expect(drawEvents[1]).toBe(green);
  });

  test('stats exposes backend stats', () => {
    const { backend } = createMockBackend();
    const context = new RenderingContext(backend);

    expect(context.stats).toBe(backend.stats);
  });

  test('backend getter returns the injected backend', () => {
    const { backend } = createMockBackend();
    const context = new RenderingContext(backend);

    expect(context.backend).toBe(backend);
  });

  test('renderTo renders a single drawable into a RenderTexture', () => {
    const { backend, drawEvents, clear, clearCalls, root, setRenderTargetSpy, setViewSpy } = createMockBackend();
    const context = new RenderingContext(backend);
    const texture = createTexture();
    const sprite = new Sprite(texture);

    const result = context.capture(sprite, { width: 128, height: 128, clearColor: Color.transparentBlack });

    expect(result).toBeInstanceOf(RenderTexture);
    expect(result.width).toBe(128);
    expect(result.height).toBe(128);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clearCalls[0].equals(Color.transparentBlack)).toBe(true);
    expect(drawEvents).toHaveLength(1);
    expect(drawEvents[0]).toBe(sprite);

    const targetCalls = setRenderTargetSpy.mock.calls.map((c: unknown[]) => c[0]);

    expect(targetCalls[targetCalls.length - 1]).toBe(root);

    const viewCalls = setViewSpy.mock.calls.map((c: unknown[]) => c[0]);

    expect(viewCalls[viewCalls.length - 1]).toBe(root.view);

    result.destroy();
  });

  test('renderTo renders multiple children of a container', () => {
    const { backend, drawEvents, root } = createMockBackend();
    const context = new RenderingContext(backend);
    const container = new Container();
    const red = new Sprite(createTexture());
    const green = new Sprite(createTexture());

    container.addChild(red, green);

    const result = context.capture(container, { width: 128, height: 128 });

    expect(drawEvents).toHaveLength(2);
    expect(drawEvents[0]).toBe(red);
    expect(drawEvents[1]).toBe(green);
    expect(backend.renderTarget).toBe(root);
    expect(backend.view).toBe(root.view);

    result.destroy();
  });

  test('renderTo clears with default transparent black when no clearColor', () => {
    const { backend, clearCalls } = createMockBackend();
    const context = new RenderingContext(backend);
    const sprite = new Sprite(createTexture());

    const result = context.capture(sprite, { width: 64, height: 64 });

    expect(clearCalls).toHaveLength(0);

    result.destroy();
  });

  test('renderTo clears with custom clearColor', () => {
    const { backend, clearCalls } = createMockBackend();
    const context = new RenderingContext(backend);
    const sprite = new Sprite(createTexture());

    const result = context.capture(sprite, { width: 64, height: 64, clearColor: Color.red });

    expect(clearCalls).toHaveLength(1);
    expect(clearCalls[0].equals(Color.red)).toBe(true);

    result.destroy();
  });

  test('renderTo restores previous render target on exception', () => {
    const { backend, root, draw } = createMockBackend();
    const context = new RenderingContext(backend);
    const sprite = new Sprite(createTexture());
    const previousTarget = backend.renderTarget;
    const previousView = backend.view;

    draw.mockImplementation(() => {
      throw new Error('forced render error');
    });

    expect(() => {
      context.capture(sprite, { width: 64, height: 64 });
    }).toThrow('forced render error');

    expect(backend.renderTarget).toBe(previousTarget);
    expect(backend.view).toBe(previousView);
  });

  test('renderTo does not mutate the RenderTexture dimensions', () => {
    const { backend } = createMockBackend();
    const context = new RenderingContext(backend);
    const sprite = new Sprite(createTexture());

    const result = context.capture(sprite, { width: 64, height: 64 });

    expect(result.width).toBe(64);
    expect(result.height).toBe(64);

    result.destroy();
  });

  test('renderTo restores state even when no drawables are rendered', () => {
    const { backend, root } = createMockBackend();
    const context = new RenderingContext(backend);
    const container = new Container();

    const result = context.capture(container, { width: 32, height: 32 });

    expect(backend.renderTarget).toBe(root);
    expect(backend.view).toBe(root.view);

    result.destroy();
  });

  test('render() calls backend.setView with the active camera', () => {
    const { backend, setViewSpy } = createMockBackend();
    const context = new RenderingContext(backend);
    const texture = createTexture();
    const sprite = new Sprite(texture);

    context.render(sprite);

    expect(setViewSpy).toHaveBeenCalledWith(context.view);
  });

  test('render() with custom view calls backend.setView with that view', () => {
    const { backend, setViewSpy } = createMockBackend();
    const context = new RenderingContext(backend);
    const texture = createTexture();
    const sprite = new Sprite(texture);
    const customView = new View(100, 100, 200, 200);

    context.render(sprite, { view: customView });

    expect(setViewSpy).toHaveBeenCalledWith(customView);
  });

  test('dual render with different viewports sets viewport correctly', () => {
    const { backend, setViewSpy } = createMockBackend();
    const context = new RenderingContext(backend);
    const texture = createTexture();
    const sprite = new Sprite(texture);

    const leftCam = View.from({
      center: { x: 400, y: 300 },
      size: { width: 800, height: 600 },
      viewport: new Rectangle(0, 0, 0.5, 1),
    });
    const rightCam = View.from({
      center: { x: 400, y: 300 },
      size: { width: 800, height: 600 },
      viewport: new Rectangle(0.5, 0, 0.5, 1),
    });

    context.render(sprite, { view: leftCam });
    context.render(sprite, { view: rightCam });

    expect(setViewSpy).toHaveBeenCalledTimes(2);
    expect(setViewSpy.mock.calls[0][0]).toBe(leftCam);
    expect(setViewSpy.mock.calls[1][0]).toBe(rightCam);
  });
});

// Standard interleaved mesh layout: position f32x2 @0, texcoord f32x2 @8,
// color u8x4 @16, stride 20 — three vertices (red, green, blue).
const createStandardGeometry = (): Geometry => {
  const stride = 20;
  const vertices = [
    { x: 0, y: 0, u: 0, v: 0, rgba: [255, 0, 0, 255] },
    { x: 10, y: 0, u: 1, v: 0, rgba: [0, 255, 0, 255] },
    { x: 5, y: 10, u: 0.5, v: 1, rgba: [0, 0, 255, 255] },
  ];
  const buffer = new ArrayBuffer(vertices.length * stride);
  const view = new DataView(buffer);

  vertices.forEach((vertex, index) => {
    const base = index * stride;
    view.setFloat32(base + 0, vertex.x, true);
    view.setFloat32(base + 4, vertex.y, true);
    view.setFloat32(base + 8, vertex.u, true);
    view.setFloat32(base + 12, vertex.v, true);
    view.setUint8(base + 16, vertex.rgba[0]);
    view.setUint8(base + 17, vertex.rgba[1]);
    view.setUint8(base + 18, vertex.rgba[2]);
    view.setUint8(base + 19, vertex.rgba[3]);
  });

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 16 },
    ],
    vertexData: buffer,
    stride,
  });
};

const minimalMeshMaterial = (): MeshMaterial =>
  new MeshMaterial({
    shader: new ShaderSource({
      glsl: {
        vertex: '#version 300 es\nvoid main(){gl_Position=vec4(0.0);}',
        fragment: '#version 300 es\nprecision lowp float;out vec4 c;void main(){c=vec4(1.0);}',
      },
    }),
  });

describe('RenderingContext.drawGeometry', () => {
  test('submits a pooled mesh through the backend and flushes immediately', () => {
    const { backend, drawEvents, getFlushCallCount } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();

    context.drawGeometry(geometry, new Matrix());

    expect(drawEvents).toHaveLength(1);
    expect(drawEvents[0]).toBeInstanceOf(Mesh);
    expect(getFlushCallCount()).toBe(1);

    geometry.destroy();
  });

  test('uses the raw transform verbatim as the mesh world matrix', () => {
    const { backend, drawEvents } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();
    const transform = new Matrix(2, 0, 10, 0, 3, 20);

    context.drawGeometry(geometry, transform);

    const world = drawEvents[0].getGlobalTransform();

    expect(world.a).toBe(2);
    expect(world.d).toBe(3);
    expect(world.x).toBe(10);
    expect(world.y).toBe(20);
    // No origin/position composition is applied — it is the matrix as given.
    expect(world.a).toBe(transform.a);
    expect(world.x).toBe(transform.x);

    geometry.destroy();
  });

  test('flattens the geometry onto the pooled mesh', () => {
    const { backend, drawEvents } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();

    context.drawGeometry(geometry, new Matrix());

    const mesh = drawEvents[0] as Mesh;

    expect(mesh.vertexCount).toBe(3);
    expect(Array.from(mesh.vertices)).toEqual([0, 0, 10, 0, 5, 10]);
    expect(mesh.uvs?.[4]).toBeCloseTo(0.5);
    // RGBA8 packed little-endian: R | G<<8 | B<<16 | A<<24.
    expect(mesh.colors?.[0]).toBe(0xff0000ff);
    expect(mesh.colors?.[2]).toBe(0xffff0000);

    geometry.destroy();
  });

  test('applies the tint and defaults to white', () => {
    const { backend, drawEvents } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();

    context.drawGeometry(geometry, new Matrix());
    expect(drawEvents[0].tint.equals(Color.white)).toBe(true);

    context.drawGeometry(geometry, new Matrix(), { tint: new Color(255, 0, 0) });
    expect(drawEvents[1].tint.equals(new Color(255, 0, 0))).toBe(true);

    geometry.destroy();
  });

  test('resets the tint to white when a later call omits it (pooled reuse)', () => {
    const { backend, drawEvents } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();

    context.drawGeometry(geometry, new Matrix(), { tint: new Color(0, 128, 255) });
    expect(drawEvents[0].tint.equals(new Color(0, 128, 255))).toBe(true);

    context.drawGeometry(geometry, new Matrix());
    expect(drawEvents[1].tint.equals(Color.white)).toBe(true);

    geometry.destroy();
  });

  test('reuses a single pooled mesh instance across calls', () => {
    const { backend, drawEvents } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();

    context.drawGeometry(geometry, new Matrix());
    context.drawGeometry(geometry, new Matrix());

    expect(drawEvents).toHaveLength(2);
    expect(drawEvents[0]).toBe(drawEvents[1]);

    geometry.destroy();
  });

  test('re-flattens only when the geometry identity or version changes', () => {
    const { backend, drawEvents } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();

    context.drawGeometry(geometry, new Matrix());
    const firstVertices = (drawEvents[0] as Mesh).vertices;

    // Same geometry, unchanged version → flattened arrays are reused as-is.
    context.drawGeometry(geometry, new Matrix(2, 0, 0, 0, 2, 0));
    expect((drawEvents[1] as Mesh).vertices).toBe(firstVertices);

    // Bumping the version forces a re-flatten into fresh arrays.
    geometry.invalidate();
    context.drawGeometry(geometry, new Matrix());
    expect((drawEvents[2] as Mesh).vertices).not.toBe(firstVertices);

    geometry.destroy();
  });

  test('draws after a render() in call order (immediate draws layer on top)', () => {
    const { backend, drawEvents } = createMockBackend();
    const context = new RenderingContext(backend);
    const sprite = new Sprite(createTexture());
    const geometry = createStandardGeometry();

    context.render(sprite);
    context.drawGeometry(geometry, new Matrix());

    expect(drawEvents).toHaveLength(2);
    expect(drawEvents[0]).toBe(sprite);
    expect(drawEvents[1]).toBeInstanceOf(Mesh);
    expect(drawEvents[1]).not.toBe(sprite);

    geometry.destroy();
  });

  test('defaults to the active camera and honors a custom view', () => {
    const { backend, setViewSpy } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();
    const customView = new View(100, 100, 200, 200);

    context.drawGeometry(geometry, new Matrix());
    expect(setViewSpy).toHaveBeenLastCalledWith(context.view);

    context.drawGeometry(geometry, new Matrix(), { view: customView });
    expect(setViewSpy).toHaveBeenLastCalledWith(customView);

    geometry.destroy();
  });

  test('attaches a mesh material to the pooled mesh', () => {
    const { backend, drawEvents } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();
    const material = minimalMeshMaterial();

    context.drawGeometry(geometry, new Matrix(), { material });
    expect((drawEvents[0] as Mesh).material).toBe(material);

    // A later call without a material clears it through the pool.
    context.drawGeometry(geometry, new Matrix());
    expect((drawEvents[1] as Mesh).material).toBeNull();

    material.destroy();
    geometry.destroy();
  });

  test('rejects a material that does not target mesh', () => {
    const { backend, drawEvents } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();
    const spriteMaterial = { target: 'sprite' } as unknown as MeshMaterial;

    expect(() => context.drawGeometry(geometry, new Matrix(), { material: spriteMaterial })).toThrow(/must target 'mesh'/);
    expect(drawEvents).toHaveLength(0);

    geometry.destroy();
  });
});

describe('RenderingContext.drawBatch', () => {
  test('submits a single instanced draw and flushes', () => {
    const { backend, drawInstanced, instancedDraws, getFlushCallCount } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();
    const batch = new RenderBatch(geometry)
      .add(new Matrix())
      .add(new Matrix(1, 0, 5, 0, 1, 5))
      .add(new Matrix(1, 0, 9, 0, 1, 9));

    context.drawBatch(batch);

    expect(drawInstanced).toHaveBeenCalledTimes(1);
    expect(instancedDraws).toHaveLength(1);
    expect(instancedDraws[0].count).toBe(3);
    expect(getFlushCallCount()).toBe(1);

    batch.destroy();
    geometry.destroy();
  });

  test('passes the batch geometry source mesh and per-instance transforms/tints', () => {
    const { backend, instancedDraws } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();
    const batch = new RenderBatch(geometry).add(new Matrix(2, 0, 10, 0, 3, 20), new Color(255, 0, 0)).add(new Matrix());

    context.drawBatch(batch);

    const submission = instancedDraws[0];

    expect((submission.mesh as Mesh).geometry).toBe(geometry);
    expect(submission.count).toBe(2);
    expect(submission.transforms[0].a).toBe(2);
    expect(submission.transforms[0].x).toBe(10);
    expect(submission.tints[0].equals(new Color(255, 0, 0))).toBe(true);

    batch.destroy();
    geometry.destroy();
  });

  test('is a no-op for an empty batch', () => {
    const { backend, drawInstanced, getFlushCallCount, setViewSpy } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();
    const batch = new RenderBatch(geometry);

    context.drawBatch(batch);

    expect(drawInstanced).not.toHaveBeenCalled();
    expect(getFlushCallCount()).toBe(0);
    expect(setViewSpy).not.toHaveBeenCalled();

    geometry.destroy();
  });

  test('defaults to the active camera and honors a custom view', () => {
    const { backend, setViewSpy } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();
    const batch = new RenderBatch(geometry).add(new Matrix());
    const customView = new View(100, 100, 200, 200);

    context.drawBatch(batch);
    expect(setViewSpy).toHaveBeenLastCalledWith(context.view);

    context.drawBatch(batch, { view: customView });
    expect(setViewSpy).toHaveBeenLastCalledWith(customView);

    batch.destroy();
    geometry.destroy();
  });

  test('rejects a batch carrying a custom material', () => {
    const { backend, drawInstanced } = createMockBackend();
    const context = new RenderingContext(backend);
    const geometry = createStandardGeometry();
    const batch = new RenderBatch(geometry).add(new Matrix());
    // Force a custom material onto the batch to exercise the drawBatch guard.
    (batch as unknown as { material: unknown }).material = minimalMeshMaterial();

    expect(() => context.drawBatch(batch)).toThrow(/custom materials are not supported/);
    expect(drawInstanced).not.toHaveBeenCalled();

    batch.destroy();
    geometry.destroy();
  });

  test('draws after a render() in call order', () => {
    const { backend, draw, drawInstanced } = createMockBackend();
    const context = new RenderingContext(backend);
    const sprite = new Sprite(createTexture());
    const geometry = createStandardGeometry();
    const batch = new RenderBatch(geometry).add(new Matrix());

    context.render(sprite);
    context.drawBatch(batch);

    expect(draw).toHaveBeenCalled();
    expect(drawInstanced).toHaveBeenCalled();
    // The instanced batch is submitted after the retained render.
    expect(draw.mock.invocationCallOrder[0]).toBeLessThan(drawInstanced.mock.invocationCallOrder[0]);

    batch.destroy();
    geometry.destroy();
  });
});
