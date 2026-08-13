import type { AttributeType, GeometryUsage, Material, Topology } from '@codexo/exojs';
import type { BlendModes } from '@codexo/exojs/renderer-sdk';
import type { Texture } from '@codexo/exojs/renderer-sdk';
import type { View } from '@codexo/exojs/renderer-sdk';
import type { WebGl2Backend } from '@codexo/exojs/renderer-sdk';
import { BufferTypes, BufferUsage, RenderingPrimitives } from '@codexo/exojs/renderer-sdk';
import { Shader } from '@codexo/exojs/renderer-sdk';
import { AbstractWebGl2Renderer } from '@codexo/exojs/renderer-sdk';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from '@codexo/exojs/renderer-sdk';
import { createWebGl2ShaderProgram } from '@codexo/exojs/renderer-sdk';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from '@codexo/exojs/renderer-sdk';

import type { ParticleSystem } from '#ParticleSystem';
import { assertVertexGeometryCompatible } from '#renderModes/ParticleBufferLayout';
import type { ParticleRenderMode } from '#renderModes/ParticleRenderMode';

const resolvePrimitive = (topology: Topology): RenderingPrimitives => {
  switch (topology) {
    case 'triangle-list':
      return RenderingPrimitives.Triangles;
    case 'triangle-strip':
      return RenderingPrimitives.TriangleStrip;
  }
};

const usageByGeometryUsage: Record<GeometryUsage, BufferUsage> = {
  static: BufferUsage.StaticDraw,
  dynamic: BufferUsage.DynamicDraw,
  stream: BufferUsage.StreamDraw,
};

/**
 * Attribute component types that reach the shader as raw integers rather than
 * as floats. Everything else — including normalised integer types such as the
 * quad mode's `u8x4` colour — goes through `vertexAttribPointer` and arrives as
 * a float, so only these two need `vertexAttribIPointer`.
 */
const integerAttributeTypes = new Set<AttributeType>(['u32', 'i32']);

const resolveAttributeType = (gl: WebGL2RenderingContext, type: AttributeType): number => {
  switch (type) {
    case 'f32':
      return gl.FLOAT;
    case 'u8':
      return gl.UNSIGNED_BYTE;
    case 'u16':
      return gl.UNSIGNED_SHORT;
    case 'u32':
      return gl.UNSIGNED_INT;
    case 'i32':
      return gl.INT;
  }
};

interface ParticleRendererConnection {
  readonly gl: WebGL2RenderingContext;
  readonly buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>;
}

/**
 * The GL-side realisation of one render mode: its compiled program, its vertex
 * array object and the buffers behind it. Cached per {@link Material} — the
 * mode's material is its stable identity, and its `destroy()` evicts the entry.
 */
interface ParticleModeResources {
  readonly shader: Shader;
  readonly vao: WebGl2VertexArrayObject;
  readonly vertexBuffer: WebGl2RenderBuffer;
  /** Per-vertex buffer for a mode that supplies its own geometry, else null. */
  readonly meshBuffer: WebGl2RenderBuffer | null;
  /** Geometry version last uploaded into {@link meshBuffer}; -1 when there is none. */
  meshVersion: number;
  readonly indexBuffer: WebGl2RenderBuffer | null;
  readonly stride: number;
  readonly primitive: RenderingPrimitives;
  readonly instanced: boolean;
  /** Indices (or vertices, when the geometry carries none) per drawn element. */
  readonly indexCount: number;
  /** Byte view over the mode's scratch buffer, rebuilt whenever the mode grows it. */
  bytes: Uint8Array;
  source: ArrayBuffer | null;
  view: View | null;
  viewId: number;
}

/**
 * Particle renderer for WebGL2.
 *
 * One ParticleSystem = one batch. The system's {@link ParticleRenderMode} owns
 * the *how* — vertex layout, shader pair, draw model and the loop that fills
 * the buffer — and this renderer is the executor: each `render(system)` flushes
 * any pending batch, sets the system-level uniforms (transform, local bounds,
 * texture) and asks the mode to build its vertex data. The next `flush()`
 * uploads that data and issues the single draw the mode declares.
 *
 * Everything mode-specific is read off the mode's `dataLayout`/`Material`, so a
 * new primitive is a new mode rather than a change here: the vertex array
 * object is wired from the layout's named attributes, the draw is instanced or
 * plain per `ParticleRenderMode.instanced`, and its primitive comes from the
 * topology.
 *
 * A mode declaring a `vertexGeometry` adds a second buffer to that vertex array
 * object, stepping per vertex (divisor 0) beside the per-instance one, and its
 * geometry supplies the topology and indices instead.
 */
export class WebGl2ParticleRenderer extends AbstractWebGl2Renderer<ParticleSystem> {
  /**
   * The particle system's transform is bound as a `u_systemTransform` uniform and
   * each particle is positioned system-locally, so this renderer never reads the
   * shared {@link TransformBuffer}; the render-group upload boundary skips writing
   * transform records for particle draws.
   * @internal
   */
  public readonly _consumesSharedTransform = false;

  /** Particles the GL-side vertex store is pre-sized for. A hint, not a limit. */
  private readonly _batchSize: number;
  private readonly _resources = new Map<Material, ParticleModeResources>();
  /**
   * Materials this renderer already registered a dispose listener on.
   *
   * `Material` has no unsubscribe, and a disconnect clears {@link _resources}
   * without clearing the material's callback set — so registering on every
   * resource creation would leave one dead closure per material behind on
   * every device-loss/reconnect cycle. The listener stays valid across those
   * cycles (it resolves the entry through the map when it fires), so it is
   * registered once and this set remembers that. Weak, so a material dropped
   * without `destroy()` stays collectable.
   */
  private readonly _disposeListenerRegistered = new WeakSet<Material>();

  private _drawCount = 0;
  private _pendingMode: ParticleRenderMode | null = null;
  private _pendingResources: ParticleModeResources | null = null;
  private _currentTexture: Texture | null = null;
  private _currentBlendMode: BlendModes | null = null;
  private _connection: ParticleRendererConnection | null = null;

  public constructor(batchSize: number) {
    super();

    this._batchSize = batchSize;
  }

  public render(system: ParticleSystem): this {
    const backend = this.getBackend();
    const { texture, blendMode } = system;
    const textureChanged = texture !== this._currentTexture;
    const blendModeChanged = blendMode !== this._currentBlendMode;

    // System transform / texture / UV / local-bounds are uniforms, so
    // mixing systems in one batch is invalid. Flush any prior system
    // before setting up this one.
    this.flush();

    if (textureChanged) {
      this._currentTexture = texture;
      backend.bindTexture(texture);
    }

    if (blendModeChanged) {
      this._currentBlendMode = blendMode;
      backend.setBlendMode(blendMode);
    }

    const mode = system.renderMode;
    const resources = this._getOrCreateResources(mode);
    const shader = resources.shader;

    // System-level uniforms are set before building so the eventual flush()
    // can sync them in one go. Guarded by declaration: they are offers to the
    // mode's shader, not requirements on it.
    if (shader.uniforms.has('u_systemTransform')) {
      shader.getUniform('u_systemTransform').setValue(system.getGlobalTransform().toArray(false));
    }

    if (shader.uniforms.has('u_localBounds')) {
      shader.getUniform('u_localBounds').setValue(system.vertices);
    }

    mode.build(system);

    this._pendingMode = mode;
    this._pendingResources = resources;
    this._drawCount = mode.count;

    return this;
  }

  public flush(): void {
    const backend = this.getBackendOrNull();
    const mode = this._pendingMode;
    const resources = this._pendingResources;

    if (this._drawCount === 0 || backend === null || mode === null || resources === null) {
      return;
    }

    const view = backend.view;

    if (resources.view !== view || resources.viewId !== view.updateId) {
      resources.view = view;
      resources.viewId = view.updateId;

      if (resources.shader.uniforms.has('u_projection')) {
        resources.shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
      }
    }

    resources.shader.sync();
    backend.bindVertexArrayObject(resources.vao);

    // Re-upload the mode's own geometry only when it was mutated since the last
    // draw. One integer comparison keeps an unchanging mesh off the bus.
    const meshGeometry = mode.vertexGeometry;

    if (meshGeometry !== null && resources.meshBuffer !== null && resources.meshVersion !== meshGeometry.version) {
      resources.meshVersion = meshGeometry.version;
      resources.meshBuffer.upload(meshGeometry.vertexData);
    }

    resources.vertexBuffer.upload(this._resolveUpload(mode, resources));

    const sampler = mode.material.sampler;

    if (sampler !== null) {
      backend.bindMaterialSampler(sampler, 0);
    }

    if (resources.instanced) {
      resources.vao.drawInstanced(resources.indexCount, 0, this._drawCount, resources.primitive);
    } else {
      resources.vao.draw(resources.indexBuffer !== null ? resources.indexCount : this._drawCount, 0, resources.primitive);
    }

    if (sampler !== null) {
      backend.unbindMaterialSampler(0);
    }

    backend.stats.batches++;
    backend.stats.drawCalls++;

    this._drawCount = 0;
    this._pendingMode = null;
    this._pendingResources = null;
  }

  protected onConnect(backend: WebGl2Backend): void {
    this._connection = { gl: backend.context, buffers: new Map() };
  }

  protected onDisconnect(): void {
    for (const resources of this._resources.values()) {
      this._destroyResources(resources);
    }

    this._resources.clear();
    this._connection = null;
    this._currentTexture = null;
    this._currentBlendMode = null;
    this._drawCount = 0;
    this._pendingMode = null;
    this._pendingResources = null;
  }

  public destroy(): void {
    this.disconnect();
  }

  /**
   * The slice of the mode's scratch buffer this draw uploads. The byte view is
   * cached and only rebuilt when the mode swaps in a larger backing buffer, so
   * a steady-state frame allocates nothing beyond the subarray itself.
   */
  private _resolveUpload(mode: ParticleRenderMode, resources: ParticleModeResources): Uint8Array {
    const data = mode.data;

    if (resources.source !== data) {
      resources.source = data;
      resources.bytes = new Uint8Array(data);
    }

    return resources.bytes.subarray(0, this._drawCount * resources.stride);
  }

  private _getOrCreateResources(mode: ParticleRenderMode): ParticleModeResources {
    const connection = this._connection;

    if (connection === null) {
      throw new Error('WebGl2ParticleRenderer is not connected to a backend.');
    }

    const material = mode.material;
    const cached = this._resources.get(material);

    if (cached !== undefined) {
      return cached;
    }

    const created = this._createResources(mode, material, connection);

    this._resources.set(material, created);

    if (!this._disposeListenerRegistered.has(material)) {
      this._disposeListenerRegistered.add(material);

      // A destroyed mode takes its GPU resources with it: `ParticleSystem.destroy`
      // destroys a mode it owns, which destroys the material.
      material._onDispose(() => {
        // `Material.destroy` drops its callbacks after firing them, so this
        // registration is gone — forget it, and the next creation re-registers.
        this._disposeListenerRegistered.delete(material);

        const stored = this._resources.get(material);

        if (stored === undefined) {
          return;
        }

        if (this._pendingResources === stored) {
          this._drawCount = 0;
          this._pendingMode = null;
          this._pendingResources = null;
        }

        this._destroyResources(stored);
        this._resources.delete(material);
      });
    }

    return created;
  }

  private _createResources(mode: ParticleRenderMode, material: Material, connection: ParticleRendererConnection): ParticleModeResources {
    const gl = connection.gl;
    const glsl = material.shader.glsl;

    if (glsl === null) {
      throw new Error('Particle material shader has no `glsl` source; cannot render through the WebGL2 backend.');
    }

    const layout = mode.dataLayout;
    const meshGeometry = mode.vertexGeometry;

    assertVertexGeometryCompatible(layout, meshGeometry, mode.instanced, mode.constructor.name);

    const shader = new Shader(glsl.vertex, glsl.fragment);

    shader.connect(createWebGl2ShaderProgram(gl));
    // Force the first finalize so the attribute/uniform maps read below are populated.
    shader.sync();

    // A mode with its own per-vertex geometry draws that geometry's topology
    // and indices; one without derives its vertices in the shader and carries
    // both on its layout instead.
    const indices = meshGeometry !== null ? meshGeometry.indices : layout.indices;
    const topology = meshGeometry !== null ? meshGeometry.topology : layout.topology;
    const indexCount = meshGeometry !== null ? meshGeometry.indexCount : layout.indexCount;
    const indexBuffer =
      indices !== null
        ? new WebGl2RenderBuffer(BufferTypes.ElementArrayBuffer, indices, BufferUsage.StaticDraw).connect(this._createBufferRuntime(connection))
        : null;

    // Pre-sized rather than capped: the mode grows its scratch buffer with the
    // live particle count and the GL store is re-sized from it on upload, so a
    // system drawing past the batch size still draws every particle.
    const vertexBuffer = new WebGl2RenderBuffer(
      BufferTypes.ArrayBuffer,
      new ArrayBuffer(this._batchSize * layout.stride),
      usageByGeometryUsage[layout.usage],
    ).connect(this._createBufferRuntime(connection));

    const meshBuffer =
      meshGeometry !== null
        ? new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, meshGeometry.vertexData, usageByGeometryUsage[meshGeometry.usage]).connect(
            this._createBufferRuntime(connection),
          )
        : null;

    const vaoHandle = gl.createVertexArray();

    if (vaoHandle === null) {
      throw new Error('WebGl2ParticleRenderer: could not create vertex array object.');
    }

    // Per-instance for an instanced mode, per-vertex otherwise — the same
    // interleaved layout serves both draw models.
    const divisor = mode.instanced ? 1 : 0;
    const vao = new WebGl2VertexArrayObject();

    if (indexBuffer !== null) {
      vao.addIndex(indexBuffer);
    }

    for (const attribute of layout.attributes) {
      vao.addAttribute(
        vertexBuffer,
        shader.getAttribute(attribute.name),
        resolveAttributeType(gl, attribute.type),
        attribute.normalized,
        layout.stride,
        attribute.offset,
        !attribute.normalized && integerAttributeTypes.has(attribute.type),
        divisor,
      );
    }

    // The mesh's own vertices step once per vertex (divisor 0) beside the
    // per-instance records above, which is what lets one instanced draw expand
    // a shared shape per particle.
    if (meshGeometry !== null && meshBuffer !== null) {
      for (const attribute of meshGeometry.attributes) {
        vao.addAttribute(
          meshBuffer,
          shader.getAttribute(attribute.name),
          resolveAttributeType(gl, attribute.type),
          attribute.normalized,
          meshGeometry.stride,
          attribute.offset,
          !attribute.normalized && integerAttributeTypes.has(attribute.type),
          0,
        );
      }
    }

    vao.connect(this._createVaoRuntime(connection, vaoHandle, indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT));

    return {
      shader,
      vao,
      vertexBuffer,
      meshBuffer,
      meshVersion: meshGeometry?.version ?? -1,
      indexBuffer,
      stride: layout.stride,
      primitive: resolvePrimitive(topology),
      instanced: mode.instanced,
      indexCount,
      bytes: new Uint8Array(0),
      source: null,
      view: null,
      viewId: -1,
    };
  }

  private _destroyResources(resources: ParticleModeResources): void {
    resources.vao.destroy();
    resources.vertexBuffer.destroy();
    resources.meshBuffer?.destroy();
    resources.indexBuffer?.destroy();
    resources.shader.destroy();
  }

  private _createBufferRuntime(connection: ParticleRendererConnection): WebGl2RenderBufferRuntime {
    const handle = connection.gl.createBuffer();

    if (handle === null) {
      throw new Error('WebGl2ParticleRenderer: could not create render buffer.');
    }

    return {
      bind: (buffer): void => {
        connection.gl.bindBuffer(buffer.type, handle);
      },
      upload: (buffer, offset): void => {
        const gl = connection.gl;
        const data = buffer.data;
        const state = connection.buffers.get(buffer);

        gl.bindBuffer(buffer.type, handle);

        if (state && state.dataByteLength >= data.byteLength) {
          gl.bufferSubData(buffer.type, offset, data);
          state.dataByteLength = data.byteLength;
        } else {
          gl.bufferData(buffer.type, data, buffer.usage);
          connection.buffers.set(buffer, { handle, dataByteLength: data.byteLength });
        }
      },
      destroy: (buffer): void => {
        connection.gl.deleteBuffer(handle);
        connection.buffers.delete(buffer);
        buffer.disconnect();
      },
    };
  }

  private _createVaoRuntime(connection: ParticleRendererConnection, vaoHandle: WebGLVertexArrayObject, indexType: number): WebGl2VertexArrayObjectRuntime {
    let appliedVersion = -1;

    return {
      bind: (vao): void => {
        const gl = connection.gl;

        gl.bindVertexArray(vaoHandle);

        if (appliedVersion !== vao.version) {
          let lastBuffer: WebGl2RenderBuffer | null = null;

          for (const attribute of vao.attributes) {
            if (lastBuffer !== attribute.buffer) {
              attribute.buffer.bind();
              lastBuffer = attribute.buffer;
            }

            if (attribute.integer) {
              gl.vertexAttribIPointer(attribute.location, attribute.size, attribute.type, attribute.stride, attribute.start);
            } else {
              gl.vertexAttribPointer(attribute.location, attribute.size, attribute.type, attribute.normalized, attribute.stride, attribute.start);
            }

            gl.enableVertexAttribArray(attribute.location);
            gl.vertexAttribDivisor(attribute.location, attribute.divisor);
          }

          if (vao.indexBuffer) {
            vao.indexBuffer.bind();
          }

          appliedVersion = vao.version;
        }
      },
      unbind: (): void => {
        connection.gl.bindVertexArray(null);
      },
      draw: (vao, size, start, type): void => {
        const gl = connection.gl;

        if (vao.indexBuffer) {
          gl.drawElements(type, size, indexType, start);
        } else {
          gl.drawArrays(type, start, size);
        }
      },
      drawInstanced: (vao, count, start, instanceCount, type): void => {
        const gl = connection.gl;

        if (vao.indexBuffer) {
          gl.drawElementsInstanced(type, count, indexType, start, instanceCount);
        } else {
          gl.drawArraysInstanced(type, start, count, instanceCount);
        }
      },
      destroy: (vao): void => {
        connection.gl.deleteVertexArray(vaoHandle);
        vao.disconnect();
      },
    };
  }
}
