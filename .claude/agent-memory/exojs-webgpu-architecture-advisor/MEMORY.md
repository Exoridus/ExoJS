# ExoJS WebGPU Architecture Advisor Memory

## Renderer Architecture Overview
- RenderManager: Central orchestrator, owns WebGL2 context, manages state (shader, VAO, texture, blend mode, render target), holds renderer registry
- AbstractRenderer: Base batching renderer (SpriteRenderer, ParticleRenderer extend it); stores `gl: WebGL2RenderingContext` directly
- PrimitiveRenderer: Implements IRenderer directly (not AbstractRenderer), uses connection object pattern
- IRenderer interface: connect(RenderManager)/disconnect/bind/unbind/render(Drawable)/flush/destroy
- Shader/ShaderUniform/ShaderAttribute/ShaderBlock: All hold `WebGL2RenderingContext` and WebGL handles directly
- Texture/RenderTexture/Sampler/RenderBuffer/VertexArrayObject: All hold `WebGL2RenderingContext` directly
- RenderTarget: Holds `WebGL2RenderingContext`, manages framebuffers and viewports
- Drawable.render(renderManager: RenderManager) - scene graph nodes call renderManager directly

## Shared vs Backend-Specific Boundaries (confirmed)
- Backend-agnostic: View, Drawable, Container, Sprite (scene graph), Color, SceneNode, Geometry, Graphics, Text, Video, Spritesheet
- Backend-coupled (WebGL2 hardcoded): Shader, ShaderUniform, ShaderAttribute, ShaderBlock, ShaderMappings, Texture, RenderTexture, Sampler, RenderBuffer, VertexArrayObject, RenderTarget, RenderManager, AbstractRenderer, SpriteRenderer, ParticleRenderer, PrimitiveRenderer
- Enums in types/rendering.ts: ScaleModes/WrapModes/BufferTypes/BufferUsage/ShaderPrimitives use raw GL constants as values

## Key Coupling Points
- RenderManager constructor directly calls `canvas.getContext('webgl2')`
- IApplicationOptions includes `webglAttributes: WebGLContextAttributes`
- Drawable.render() takes concrete RenderManager, not an interface
- Sprite.render() casts `renderManager.getRenderer(RendererType.sprite) as SpriteRenderer`
- All GLSL shaders are #version 300 es (WebGL2); 3 shader pairs: sprite, particle, primitive
- Enum values (ScaleModes, WrapModes, etc.) are raw GL integer constants

## Shader Details
- 3 shader pairs, all simple GLSL 300 es
- sprite: u_projection mat3, u_texture sampler2D; position/texcoord/color attributes
- particle: u_projection/u_translation mat3, u_texture sampler2D; position/texcoord/translation/scale/rotation/color
- primitive: u_projection/u_translation mat3; position/color attributes
- All shaders are small and mechanically translatable to WGSL

## Public API Surface
- rendering/index.ts re-exports: Shader, ShaderAttribute, ShaderBlock, ShaderUniform, Sprite, SpriteRenderer, RenderTexture, Texture, Sampler, RenderBuffer, Container, Drawable, IRenderer, RenderManager, RenderTarget, Spritesheet, Text, TextStyle, VertexArrayObject, Video, View
- Application.renderManager is public readonly typed as RenderManager (concrete)
