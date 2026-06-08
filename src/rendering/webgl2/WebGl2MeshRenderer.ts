import type { Geometry } from '#rendering/geometry/Geometry';
import type { Material, UniformValue } from '#rendering/material/Material';
import type { Mesh } from '#rendering/mesh/Mesh';
import { type DrawCommand, RenderEntryKind } from '#rendering/plan/RenderCommand';
import { Shader } from '#rendering/shader/Shader';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes, BufferTypes, BufferUsage, RenderingPrimitives } from '#rendering/types';

import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import fragmentSource from './glsl/mesh.frag';
import vertexSource from './glsl/mesh.vert';
import type { WebGl2Backend } from './WebGl2Backend';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import { createWebGl2ShaderProgram } from './WebGl2ShaderProgram';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';

// Per-vertex layout (20 bytes):
//   position: vec2 f32 (offset  0,  8 bytes)
//   texcoord: vec2 f32 (offset  8,  8 bytes)
//   color:    u8x4 norm (offset 16, 4 bytes)
const vertexStrideBytes = 20;
const vertexStrideWords = vertexStrideBytes / 4;
const initialVertexCapacity = 64;
const initialIndexCapacity = 192;
const initialNodeIndexCapacity = 64;
const defaultVertexColor = 0xffffffff; // white, full alpha
const maxCustomTextureSlots = 8;
const transformTextureUnit = 8;

interface MeshRendererConnection {
  readonly gl: WebGL2RenderingContext;
  readonly buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>;
  readonly dynamicVao: WebGl2VertexArrayObject;
  readonly dynamicVertexBuffer: WebGl2RenderBuffer;
  readonly dynamicIndexBuffer: WebGl2RenderBuffer;
  readonly dynamicNodeIndexBuffer: WebGl2RenderBuffer;
}

interface PendingMeshDraw {
  readonly mesh: Mesh;
  readonly command: DrawCommand | null;
  readonly material: Material | null;
  readonly shader: Shader;
  readonly blendMode: BlendModes;
  readonly texture: Texture | RenderTexture;
  readonly supportsInstancing: boolean;
}

interface StaticGeometryCacheEntry {
  readonly geometry: Geometry;
  readonly vertexBuffer: WebGl2RenderBuffer;
  readonly indexBuffer: WebGl2RenderBuffer;
  readonly vaos: Map<Shader, WebGl2VertexArrayObject>;
  readonly disposeListener: () => void;
  indexCount: number;
}

export class WebGl2MeshRenderer extends AbstractWebGl2Renderer<Mesh> {
  private readonly _defaultShader: Shader = new Shader(vertexSource, fragmentSource);
  private readonly _customShaders = new Map<Material, Shader>();
  private readonly _compatibilityCache = new Map<Shader, boolean>();
  private readonly _textureUnitScratch: Int32Array = new Int32Array([0]);
  private readonly _transformUnitScratch: Int32Array = new Int32Array([transformTextureUnit]);
  // Pre-built texture-unit indices used for custom-shader sampler bindings;
  // pre-allocated so the per-frame uniform path stays allocation-free.
  private readonly _slotScratches: Int32Array[] = Array.from(
    { length: Math.max(transformTextureUnit + 1, maxCustomTextureSlots + 1) },
    (_, i) => new Int32Array([i]),
  );

  private _vertexCapacity = initialVertexCapacity;
  private _indexCapacity = initialIndexCapacity;
  private _nodeIndexCapacity = initialNodeIndexCapacity;
  private _vertexData: ArrayBuffer = new ArrayBuffer(initialVertexCapacity * vertexStrideBytes);
  private _float32View: Float32Array = new Float32Array(this._vertexData);
  private _uint32View: Uint32Array = new Uint32Array(this._vertexData);
  private _indexData: Uint16Array = new Uint16Array(initialIndexCapacity);
  private _nodeIndexData: Uint32Array = new Uint32Array(initialNodeIndexCapacity);

  private readonly _pendingDraws: PendingMeshDraw[] = [];
  private readonly _staticGeometryCache = new Map<Geometry, StaticGeometryCacheEntry>();
  private _connection: MeshRendererConnection | null = null;
  private _currentBlendMode: BlendModes | null = null;

  public render(mesh: Mesh): void {
    const connection = this._connection;

    if (!connection) {
      throw new Error('WebGl2MeshRenderer is not connected to a backend.');
    }

    if (mesh.vertexCount === 0) {
      return;
    }

    const backend = this.getBackend();
    const material = mesh.material;
    const shader = material === null ? this._defaultShader : this._getOrCreateCustomShader(material, connection.gl);
    // The material owns its blend mode; the mesh's own blendMode overrides it
    // when set away from the default (Normal). Default-path meshes keep their
    // own blendMode verbatim.
    const blendMode = material !== null && mesh.blendMode === BlendModes.Normal ? material.blendMode : mesh.blendMode;
    const texture = mesh.texture ?? Texture.white;
    const command = backend.activeDrawCommand;
    const supportsInstancing = material === null ? true : this._isInstancingCompatible(shader);

    this._pendingDraws.push({
      mesh,
      command,
      material,
      shader,
      blendMode,
      texture,
      supportsInstancing,
    });
  }

  public flush(): void {
    const backend = this.getBackendOrNull();
    const connection = this._connection;

    if (backend === null || connection === null || this._pendingDraws.length === 0) {
      this._pendingDraws.length = 0;
      return;
    }

    for (let i = 0; i < this._pendingDraws.length; i++) {
      const draw = this._pendingDraws[i];

      if (this._canBatchStatic(draw)) {
        let end = i + 1;

        while (end < this._pendingDraws.length && this._isSameBatch(this._pendingDraws[end - 1], this._pendingDraws[end])) {
          end++;
        }

        if (end - i >= 2) {
          this._drawStaticBatch(this._pendingDraws.slice(i, end), backend, connection);
          i = end - 1;
          continue;
        }
      }

      this._drawSingle(draw, backend, connection);
    }

    this._pendingDraws.length = 0;
  }

  public destroy(): void {
    this.disconnect();
    this._defaultShader.destroy();
    for (const shader of this._customShaders.values()) {
      shader.destroy();
    }
    this._customShaders.clear();
    this._compatibilityCache.clear();
  }

  protected onConnect(backend: WebGl2Backend): void {
    const gl = backend.context;

    this._defaultShader.connect(createWebGl2ShaderProgram(gl));
    this._defaultShader.sync();

    // Custom shaders compiled before connect() get connected here too.
    for (const customShader of this._customShaders.values()) {
      customShader.connect(createWebGl2ShaderProgram(gl));
      customShader.sync();
    }

    const buffers = new Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>();
    const dynamicIndexBuffer = new WebGl2RenderBuffer(BufferTypes.ElementArrayBuffer, this._indexData, BufferUsage.DynamicDraw).connect(
      this._createBufferRuntime(gl, buffers),
    );
    const dynamicVertexBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._vertexData, BufferUsage.DynamicDraw).connect(
      this._createBufferRuntime(gl, buffers),
    );
    const dynamicNodeIndexBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._nodeIndexData, BufferUsage.DynamicDraw).connect(
      this._createBufferRuntime(gl, buffers),
    );

    const dynamicVaoHandle = gl.createVertexArray();

    if (dynamicVaoHandle === null) {
      throw new Error('Could not create vertex array object.');
    }

    const dynamicVao = new WebGl2VertexArrayObject()
      .addIndex(dynamicIndexBuffer)
      .addAttribute(dynamicVertexBuffer, this._defaultShader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, 0)
      .addAttribute(dynamicVertexBuffer, this._defaultShader.getAttribute('a_texcoord'), gl.FLOAT, false, vertexStrideBytes, 8)
      .addAttribute(dynamicVertexBuffer, this._defaultShader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, vertexStrideBytes, 16)
      .addAttribute(dynamicNodeIndexBuffer, this._defaultShader.getAttribute('a_nodeIndex'), gl.UNSIGNED_INT, false, Uint32Array.BYTES_PER_ELEMENT, 0, true, 1)
      .connect(this._createVaoRuntime(gl, dynamicVaoHandle));

    this._connection = {
      gl,
      buffers,
      dynamicVao,
      dynamicVertexBuffer,
      dynamicIndexBuffer,
      dynamicNodeIndexBuffer,
    };
  }

  protected onDisconnect(): void {
    const connection = this._connection;

    if (!connection) {
      return;
    }

    this._defaultShader.disconnect();
    for (const customShader of this._customShaders.values()) {
      customShader.disconnect();
    }

    for (const entry of this._staticGeometryCache.values()) {
      for (const vao of entry.vaos.values()) {
        vao.destroy();
      }

      entry.vaos.clear();
      entry.indexBuffer.destroy();
      entry.vertexBuffer.destroy();
    }

    this._staticGeometryCache.clear();
    connection.dynamicNodeIndexBuffer.destroy();
    connection.dynamicIndexBuffer.destroy();
    connection.dynamicVertexBuffer.destroy();
    connection.dynamicVao.destroy();

    this._connection = null;
    this._currentBlendMode = null;
    this._pendingDraws.length = 0;
  }

  private _drawSingle(draw: PendingMeshDraw, backend: WebGl2Backend, connection: MeshRendererConnection): void {
    if (this._canBatchStatic(draw)) {
      this._drawStaticBatch([draw], backend, connection);
      return;
    }

    if (draw.supportsInstancing && draw.material === null) {
      this._drawDynamicInstancedSingle(draw, backend, connection);
      return;
    }

    this._drawLegacyImmediate(draw, backend, connection);
  }

  private _drawDynamicInstancedSingle(draw: PendingMeshDraw, backend: WebGl2Backend, connection: MeshRendererConnection): void {
    this._setBlendMode(draw.blendMode, backend);
    this._bindInstancedShaderState(draw.shader, draw.texture, draw.material, backend, draw.command?.nodeIndex ?? 0);

    this._ensureVertexCapacity(draw.mesh.vertexCount);
    this._ensureIndexCapacity(draw.mesh.indexCount);
    this._ensureNodeIndexCapacity(1);

    this._packVertices(draw.mesh, 0);
    this._packIndices(draw.mesh, 0);

    const nodeIndex = draw.command?.nodeIndex ?? 0;

    if (draw.command === null) {
      // The synthetic, non-plan path does not arrive through a render-group
      // upload boundary, so write its transform into the shared buffer directly.
      backend._writeTransformCommand(this._createSyntheticCommand(draw.mesh, nodeIndex));
    }

    this._nodeIndexData[0] = nodeIndex >>> 0;

    backend.bindVertexArrayObject(connection.dynamicVao);
    connection.dynamicVertexBuffer.upload(this._float32View.subarray(0, draw.mesh.vertexCount * vertexStrideWords));
    connection.dynamicIndexBuffer.upload(this._indexData.subarray(0, draw.mesh.indexCount));
    connection.dynamicNodeIndexBuffer.upload(this._nodeIndexData.subarray(0, 1));
    connection.dynamicVao.drawInstanced(draw.mesh.indexCount, 0, 1, RenderingPrimitives.Triangles);

    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  private _drawStaticBatch(batch: PendingMeshDraw[], backend: WebGl2Backend, connection: MeshRendererConnection): void {
    const first = batch[0];
    const geometry = first.mesh.geometry!;
    const cacheEntry = this._getOrCreateStaticGeometryEntry(geometry, first.mesh, connection);
    const vao = this._getOrCreateStaticGeometryVao(cacheEntry, first.shader, connection.gl, connection.dynamicNodeIndexBuffer);

    this._setBlendMode(first.blendMode, backend);

    let maxNodeIndex = 0;

    this._ensureNodeIndexCapacity(batch.length);

    for (let i = 0; i < batch.length; i++) {
      const command = batch[i].command!;
      const nodeIndex = command.nodeIndex >>> 0;

      this._nodeIndexData[i] = nodeIndex;

      if (nodeIndex > maxNodeIndex) {
        maxNodeIndex = nodeIndex;
      }
    }

    this._bindInstancedShaderState(first.shader, first.texture, first.material, backend, maxNodeIndex);
    backend.bindVertexArrayObject(vao);
    connection.dynamicNodeIndexBuffer.upload(this._nodeIndexData.subarray(0, batch.length));
    vao.drawInstanced(cacheEntry.indexCount, 0, batch.length, RenderingPrimitives.Triangles);

    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  private _drawLegacyImmediate(draw: PendingMeshDraw, backend: WebGl2Backend, connection: MeshRendererConnection): void {
    const mesh = draw.mesh;
    const shader = draw.shader;

    this._setBlendMode(draw.blendMode, backend);

    if (shader.uniforms.has('u_projection')) {
      shader.getUniform('u_projection').setValue(backend.view.getTransform().toArray(false));
    }

    if (shader.uniforms.has('u_translation')) {
      shader.getUniform('u_translation').setValue(mesh.getGlobalTransform().toArray(false));
    }

    if (shader.uniforms.has('u_tint')) {
      shader.getUniform('u_tint').setValue(mesh.tint.toArray(false));
    }

    if (shader.uniforms.has('u_texture')) {
      shader.getUniform('u_texture').setValue(this._textureUnitScratch);
      backend.bindTexture(draw.texture, 0);
    }

    if (draw.material !== null) {
      this._bindCustomUniforms(shader, draw.material, backend);
    }

    this._ensureVertexCapacity(mesh.vertexCount);
    this._ensureIndexCapacity(mesh.indexCount);
    this._packVertices(mesh, 0);
    this._packIndices(mesh, 0);

    shader.sync();
    backend.bindVertexArrayObject(connection.dynamicVao);
    connection.dynamicVertexBuffer.upload(this._float32View.subarray(0, mesh.vertexCount * vertexStrideWords));
    connection.dynamicIndexBuffer.upload(this._indexData.subarray(0, mesh.indexCount));
    connection.dynamicVao.draw(mesh.indexCount, 0, RenderingPrimitives.Triangles);

    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  private _bindInstancedShaderState(
    shader: Shader,
    texture: Texture | RenderTexture,
    material: Material | null,
    backend: WebGl2Backend,
    maxNodeIndex: number,
  ): void {
    if (shader.uniforms.has('u_projection')) {
      shader.getUniform('u_projection').setValue(backend.view.getTransform().toArray(false));
    }

    if (shader.uniforms.has('u_transforms')) {
      backend.bindTransformBufferTexture(transformTextureUnit, maxNodeIndex + 1);
      shader.getUniform('u_transforms').setValue(this._transformUnitScratch);
    }

    if (shader.uniforms.has('u_texture')) {
      shader.getUniform('u_texture').setValue(this._textureUnitScratch);
      backend.bindTexture(texture, 0);
    }

    if (material !== null) {
      this._bindCustomUniforms(shader, material, backend);
    }

    shader.sync();
  }

  private _canBatchStatic(draw: PendingMeshDraw): boolean {
    if (!draw.supportsInstancing) {
      return false;
    }

    if (draw.command?.groupIndex === undefined) {
      return false;
    }

    const geometry = draw.mesh.geometry;

    if (geometry?.usage !== 'static') {
      return false;
    }

    return true;
  }

  private _isSameBatch(left: PendingMeshDraw, right: PendingMeshDraw): boolean {
    if (!this._canBatchStatic(left) || !this._canBatchStatic(right)) {
      return false;
    }

    return (
      left.command!.groupIndex === right.command!.groupIndex &&
      left.mesh.geometry === right.mesh.geometry &&
      left.shader === right.shader &&
      left.material === right.material &&
      left.blendMode === right.blendMode &&
      left.texture === right.texture &&
      left.command!.material.pipelineKey === right.command!.material.pipelineKey &&
      left.command!.material.bindKey === right.command!.material.bindKey
    );
  }

  private _isInstancingCompatible(shader: Shader): boolean {
    const cached = this._compatibilityCache.get(shader);

    if (cached !== undefined) {
      return cached;
    }

    const compatible =
      shader.attributes.has('a_nodeIndex') && shader.uniforms.has('u_transforms') && !shader.uniforms.has('u_translation') && !shader.uniforms.has('u_tint');

    this._compatibilityCache.set(shader, compatible);

    return compatible;
  }

  private _getOrCreateStaticGeometryEntry(geometry: Geometry, mesh: Mesh, connection: MeshRendererConnection): StaticGeometryCacheEntry {
    const existing = this._staticGeometryCache.get(geometry);

    if (existing !== undefined) {
      return existing;
    }

    const vertexCount = mesh.vertexCount;
    const indexCount = mesh.indexCount;
    const interleaved = new ArrayBuffer(vertexCount * vertexStrideBytes);
    const floatView = new Float32Array(interleaved);
    const uintView = new Uint32Array(interleaved);

    this._packVertices(mesh, 0, floatView, uintView);

    const indexData = new Uint16Array(indexCount);

    this._packIndices(mesh, 0, indexData);

    const vertexBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, floatView, BufferUsage.StaticDraw).connect(
      this._createBufferRuntime(connection.gl, connection.buffers),
    );
    const indexBuffer = new WebGl2RenderBuffer(BufferTypes.ElementArrayBuffer, indexData, BufferUsage.StaticDraw).connect(
      this._createBufferRuntime(connection.gl, connection.buffers),
    );

    vertexBuffer.upload(floatView);
    indexBuffer.upload(indexData);

    const disposeListener = (): void => {
      const entry = this._staticGeometryCache.get(geometry);

      if (entry === undefined) {
        return;
      }

      for (const vao of entry.vaos.values()) {
        vao.destroy();
      }

      entry.vaos.clear();
      entry.indexBuffer.destroy();
      entry.vertexBuffer.destroy();
      this._staticGeometryCache.delete(geometry);
    };

    geometry._onDispose(disposeListener);

    const created: StaticGeometryCacheEntry = {
      geometry,
      vertexBuffer,
      indexBuffer,
      vaos: new Map(),
      disposeListener,
      indexCount,
    };

    this._staticGeometryCache.set(geometry, created);

    return created;
  }

  private _getOrCreateStaticGeometryVao(
    entry: StaticGeometryCacheEntry,
    shader: Shader,
    gl: WebGL2RenderingContext,
    nodeIndexBuffer: WebGl2RenderBuffer,
  ): WebGl2VertexArrayObject {
    const existing = entry.vaos.get(shader);

    if (existing !== undefined) {
      return existing;
    }

    const vaoHandle = gl.createVertexArray();

    if (vaoHandle === null) {
      throw new Error('Could not create vertex array object.');
    }

    const nodeAttribute = shader.getAttribute('a_nodeIndex');
    const vao = new WebGl2VertexArrayObject()
      .addIndex(entry.indexBuffer)
      .addAttribute(entry.vertexBuffer, shader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, 0)
      .addAttribute(entry.vertexBuffer, shader.getAttribute('a_texcoord'), gl.FLOAT, false, vertexStrideBytes, 8)
      .addAttribute(entry.vertexBuffer, shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, vertexStrideBytes, 16)
      .addAttribute(nodeIndexBuffer, nodeAttribute, gl.UNSIGNED_INT, false, Uint32Array.BYTES_PER_ELEMENT, 0, true, 1)
      .connect(this._createVaoRuntime(gl, vaoHandle));

    entry.vaos.set(shader, vao);

    return vao;
  }

  private _setBlendMode(next: BlendModes, backend: WebGl2Backend): void {
    if (this._currentBlendMode !== next) {
      this._currentBlendMode = next;
      backend.setBlendMode(next);
    }
  }

  private _packVertices(mesh: Mesh, vertexStart: number, floatView: Float32Array = this._float32View, uintView: Uint32Array = this._uint32View): void {
    const positions = mesh.vertices;
    const uvs = mesh.uvs;
    const colors = mesh.colors;
    const vertexCount = mesh.vertexCount;

    for (let i = 0; i < vertexCount; i++) {
      const word = (vertexStart + i) * vertexStrideWords;
      const pair = i * 2;

      floatView[word] = positions[pair];
      floatView[word + 1] = positions[pair + 1];

      if (uvs !== null) {
        floatView[word + 2] = uvs[pair];
        floatView[word + 3] = uvs[pair + 1];
      } else {
        floatView[word + 2] = 0;
        floatView[word + 3] = 0;
      }

      uintView[word + 4] = colors !== null ? colors[i] : defaultVertexColor;
    }
  }

  private _packIndices(mesh: Mesh, indexStart: number, target: Uint16Array = this._indexData): void {
    const indexCount = mesh.indexCount;

    if (mesh.indices !== null) {
      target.set(mesh.indices, indexStart);
      return;
    }

    for (let i = 0; i < indexCount; i++) {
      target[indexStart + i] = i;
    }
  }

  private _ensureVertexCapacity(vertexCount: number): void {
    if (vertexCount <= this._vertexCapacity) {
      return;
    }

    while (this._vertexCapacity < vertexCount) {
      this._vertexCapacity *= 2;
    }

    this._vertexData = new ArrayBuffer(this._vertexCapacity * vertexStrideBytes);
    this._float32View = new Float32Array(this._vertexData);
    this._uint32View = new Uint32Array(this._vertexData);
  }

  private _ensureIndexCapacity(indexCount: number): void {
    if (indexCount <= this._indexCapacity) {
      return;
    }

    while (this._indexCapacity < indexCount) {
      this._indexCapacity *= 2;
    }

    this._indexData = new Uint16Array(this._indexCapacity);
  }

  private _ensureNodeIndexCapacity(instanceCount: number): void {
    if (instanceCount <= this._nodeIndexCapacity) {
      return;
    }

    while (this._nodeIndexCapacity < instanceCount) {
      this._nodeIndexCapacity *= 2;
    }

    this._nodeIndexData = new Uint32Array(this._nodeIndexCapacity);
  }

  private _createBufferRuntime(
    gl: WebGL2RenderingContext,
    buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>,
  ): WebGl2RenderBufferRuntime {
    const handle = gl.createBuffer();

    if (handle === null) {
      throw new Error('Could not create render buffer.');
    }

    return {
      bind: (buffer: WebGl2RenderBuffer): void => {
        gl.bindBuffer(buffer.type, handle);
      },
      upload: (buffer: WebGl2RenderBuffer, offset: number): void => {
        const state = buffers.get(buffer);
        const data = buffer.data;

        gl.bindBuffer(buffer.type, handle);

        if (state && state.dataByteLength >= data.byteLength) {
          gl.bufferSubData(buffer.type, offset, data);
          state.dataByteLength = data.byteLength;
        } else {
          gl.bufferData(buffer.type, data, buffer.usage);
          buffers.set(buffer, { handle, dataByteLength: data.byteLength });
        }
      },
      destroy: (buffer: WebGl2RenderBuffer): void => {
        gl.deleteBuffer(handle);
        buffers.delete(buffer);
        buffer.disconnect();
      },
    };
  }

  private _createVaoRuntime(gl: WebGL2RenderingContext, vaoHandle: WebGLVertexArrayObject): WebGl2VertexArrayObjectRuntime {
    let appliedVersion = -1;

    return {
      bind: (vao: WebGl2VertexArrayObject): void => {
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
        gl.bindVertexArray(null);
      },
      draw: (vao: WebGl2VertexArrayObject, size: number, start: number, type: number): void => {
        if (vao.indexBuffer) {
          gl.drawElements(type, size, gl.UNSIGNED_SHORT, start);
        } else {
          gl.drawArrays(type, start, size);
        }
      },
      drawInstanced: (vao: WebGl2VertexArrayObject, count: number, start: number, instanceCount: number, type: number): void => {
        if (vao.indexBuffer) {
          gl.drawElementsInstanced(type, count, gl.UNSIGNED_SHORT, start, instanceCount);
        } else {
          gl.drawArraysInstanced(type, start, count, instanceCount);
        }
      },
      destroy: (vao: WebGl2VertexArrayObject): void => {
        gl.deleteVertexArray(vaoHandle);
        vao.disconnect();
      },
    };
  }

  private _getOrCreateCustomShader(material: Material, gl: WebGL2RenderingContext): Shader {
    const cached = this._customShaders.get(material);
    if (cached !== undefined) {
      return cached;
    }

    const glsl = material.shader.glsl;

    if (glsl === null) {
      throw new Error('Mesh material shader has no `glsl` source; cannot render through the WebGL2 backend.');
    }

    const shader = new Shader(glsl.vertex, glsl.fragment);
    shader.connect(createWebGl2ShaderProgram(gl));
    // Force first finalize so getUniform()/uniforms.has() are usable below.
    shader.sync();

    this._customShaders.set(material, shader);

    // Wire material.destroy() through to evict + dispose the cached program.
    material._onDispose(() => {
      const stored = this._customShaders.get(material);
      if (stored !== undefined) {
        stored.destroy();
        this._customShaders.delete(material);
      }
    });

    return shader;
  }

  private _bindCustomUniforms(shader: Shader, material: Material, backend: WebGl2Backend): void {
    // Texture bindings take consecutive slots starting at 1 (slot 0 belongs to
    // the mesh's own `u_texture`). Texture-valued uniforms bind first, then the
    // entries of the material's dedicated `textures` map.
    let textureSlot = 1;

    const uniforms = material.uniforms;
    for (const name in uniforms) {
      if (!shader.uniforms.has(name)) {
        continue;
      }

      const value = uniforms[name];
      const uniform = shader.getUniform(name);

      if (value instanceof Texture || value instanceof RenderTexture) {
        if (textureSlot >= maxCustomTextureSlots) {
          throw new Error(`Mesh material requested more than ${maxCustomTextureSlots - 1} texture bindings.`);
        }
        backend.bindTexture(value, textureSlot);
        uniform.setValue(this._slotScratches[textureSlot]);
        textureSlot++;
      } else {
        uniform.setValue(this._marshalUniformValue(value));
      }
    }

    const textures = material.textures;
    for (const name in textures) {
      if (!shader.uniforms.has(name)) {
        continue;
      }

      if (textureSlot >= maxCustomTextureSlots) {
        throw new Error(`Mesh material requested more than ${maxCustomTextureSlots - 1} texture bindings.`);
      }

      backend.bindTexture(textures[name], textureSlot);
      shader.getUniform(name).setValue(this._slotScratches[textureSlot]);
      textureSlot++;
    }
  }

  private _marshalUniformValue(value: Exclude<UniformValue, Texture | RenderTexture>): Float32Array | Int32Array {
    if (value instanceof Float32Array || value instanceof Int32Array) {
      return value;
    }
    if (typeof value === 'number') {
      return new Float32Array([value]);
    }
    // readonly tuple [a, b], [a, b, c], [a, b, c, d]
    return new Float32Array(value as readonly number[]);
  }

  private _createSyntheticCommand(mesh: Mesh, nodeIndex: number): DrawCommand {
    return {
      kind: RenderEntryKind.Draw,
      drawable: mesh,
      nodeIndex,
      seq: 0,
      zIndex: mesh.zIndex,
      material: {
        rendererId: 0,
        blendMode: mesh.blendMode,
        textureId: -1,
        shaderId: -1,
        pipelineKey: 0,
        bindKey: 0,
      },
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      groupIndex: 0,
    };
  }
}
