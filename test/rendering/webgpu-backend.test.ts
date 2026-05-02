import type { Application } from '@/core/Application';
import { Color } from '@/core/Color';
import { ParticleSystem } from '@/particles/ParticleSystem';
import { Drawable } from '@/rendering/Drawable';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { Text } from '@/rendering/text/Text';
import { TextStyle } from '@/rendering/text/TextStyle';
import { Graphics } from '@/rendering/primitives/Graphics';
import { Container } from '@/rendering/Container';
import { Rectangle } from '@/math/Rectangle';
import { ColorFilter } from '@/rendering/filters/ColorFilter';
import { Sprite } from '@/rendering/sprite/Sprite';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { Texture } from '@/rendering/texture/Texture';
import { Video } from '@/rendering/video/Video';
import type { Renderer } from '@/rendering/Renderer';
import { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';
import { BlendModes, ScaleModes } from '@/rendering/types';

interface MockWebGpuEnvironment {
    readonly canvas: HTMLCanvasElement;
    readonly context: GPUCanvasContext;
    readonly encoder: {
        beginRenderPass: jest.Mock;
        finish: jest.Mock;
    };
    readonly pass: {
        setPipeline: jest.Mock;
        setBindGroup: jest.Mock;
        setVertexBuffer: jest.Mock;
        setIndexBuffer: jest.Mock;
        setScissorRect: jest.Mock;
        draw: jest.Mock;
        drawIndexed: jest.Mock;
        end: jest.Mock;
    };
    readonly queue: {
        writeBuffer: jest.Mock;
        submit: jest.Mock;
        copyExternalImageToTexture: jest.Mock;
    };
    readonly createBindGroupLayout: jest.Mock;
    readonly createTexture: jest.Mock;
    readonly createSampler: jest.Mock;
    readonly createRenderPipeline: jest.Mock;
    readonly pipelineDescriptors: Array<GPURenderPipelineDescriptor>;
    readonly buffers: Array<{ destroy: jest.Mock<void, []>; }>;
    readonly textures: Array<{ destroy: jest.Mock<void, []>; createView: jest.Mock<GPUTextureView, []>; }>;
    restore(): void;
}

interface MockTextCanvas {
    readonly canvas: HTMLCanvasElement;
    readonly context: CanvasRenderingContext2D & {
        clearRect: jest.Mock;
        fillText: jest.Mock;
        strokeText: jest.Mock;
        measureText: jest.Mock;
    };
}

interface MockVideoElement {
    readonly video: HTMLVideoElement;
    setDimensions(width: number, height: number): void;
    setCurrentTime(time: number): void;
}

class CustomDrawableA extends Drawable {
    public override render(backend: WebGpuBackend): this {
        backend.draw(this);

        return this;
    }
}

class CustomDrawableB extends Drawable {
    public override render(backend: WebGpuBackend): this {
        backend.draw(this);

        return this;
    }
}

const createMockWebGpuEnvironment = (): MockWebGpuEnvironment => {
    const previousGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
    const previousBufferUsage = Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage');
    const previousShaderStage = Object.getOwnPropertyDescriptor(globalThis, 'GPUShaderStage');
    const previousColorWrite = Object.getOwnPropertyDescriptor(globalThis, 'GPUColorWrite');
    const previousTextureUsage = Object.getOwnPropertyDescriptor(globalThis, 'GPUTextureUsage');
    const pass = {
        setPipeline: jest.fn(),
        setBindGroup: jest.fn(),
        setVertexBuffer: jest.fn(),
        setIndexBuffer: jest.fn(),
        setScissorRect: jest.fn(),
        draw: jest.fn(),
        drawIndexed: jest.fn(),
        end: jest.fn(),
    };
    const encoder = {
        beginRenderPass: jest.fn(() => pass),
        finish: jest.fn(() => ({ label: 'command-buffer' } as unknown as GPUCommandBuffer)),
    };
    const queue = {
        writeBuffer: jest.fn(),
        submit: jest.fn(),
        copyExternalImageToTexture: jest.fn(),
    };
    const pipelineDescriptors: Array<GPURenderPipelineDescriptor> = [];
    const createRenderPipeline = jest.fn((descriptor: GPURenderPipelineDescriptor) => {
        pipelineDescriptors.push(descriptor);

        return {} as GPURenderPipeline;
    });
    const createBindGroupLayout = jest.fn(() => ({}) as GPUBindGroupLayout);
    const createTexture = jest.fn(() => {
        const texture = {
            destroy: jest.fn(),
            createView: jest.fn(() => ({}) as GPUTextureView),
        };

        textures.push(texture);

        return texture as unknown as GPUTexture;
    });
    const createSampler = jest.fn(() => ({}) as GPUSampler);
    const buffers: Array<{ destroy: jest.Mock<void, []>; }> = [];
    const textures: Array<{ destroy: jest.Mock<void, []>; createView: jest.Mock<GPUTextureView, []>; }> = [];
    const device = {
        createShaderModule: jest.fn(() => ({}) as GPUShaderModule),
        createBindGroupLayout,
        createPipelineLayout: jest.fn(() => ({}) as GPUPipelineLayout),
        createBindGroup: jest.fn(() => ({}) as GPUBindGroup),
        createRenderPipeline,
        createCommandEncoder: jest.fn(() => encoder as unknown as GPUCommandEncoder),
        createBuffer: jest.fn(() => {
            const buffer = {
                destroy: jest.fn(),
            };

            buffers.push(buffer);

            return buffer as unknown as GPUBuffer;
        }),
        createTexture,
        createSampler,
        queue,
    } as unknown as GPUDevice;
    const context = {
        configure: jest.fn(),
        unconfigure: jest.fn(),
        getCurrentTexture: jest.fn(() => ({
            createView: jest.fn(() => ({}) as GPUTextureView),
        }) as unknown as GPUTexture),
    } as unknown as GPUCanvasContext;
    const gpu = {
        requestAdapter: jest.fn(async () => ({
            requestDevice: jest.fn(async () => device),
        }) as unknown as GPUAdapter),
        getPreferredCanvasFormat: jest.fn(() => 'bgra8unorm' as GPUTextureFormat),
    } as unknown as GPU;
    const canvas = document.createElement('canvas');

    Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: gpu,
    });
    Object.defineProperty(globalThis, 'GPUBufferUsage', {
        configurable: true,
        value: {
            COPY_DST: 1,
            INDEX: 2,
            UNIFORM: 4,
            VERTEX: 8,
        },
    });
    Object.defineProperty(globalThis, 'GPUShaderStage', {
        configurable: true,
        value: {
            VERTEX: 1,
            FRAGMENT: 2,
        },
    });
    Object.defineProperty(globalThis, 'GPUColorWrite', {
        configurable: true,
        value: {
            ALL: 0xF,
        },
    });
    Object.defineProperty(globalThis, 'GPUTextureUsage', {
        configurable: true,
        value: {
            COPY_DST: 1,
            TEXTURE_BINDING: 2,
            RENDER_ATTACHMENT: 4,
        },
    });
    Object.defineProperty(canvas, 'getContext', {
        configurable: true,
        value: jest.fn((contextType: string) => contextType === 'webgpu' ? context : null),
    });

    return {
        canvas,
        context,
        encoder,
        pass,
        queue,
        createBindGroupLayout,
        createTexture,
        createSampler,
        createRenderPipeline,
        pipelineDescriptors,
        buffers,
        textures,
        restore: (): void => {
            if (previousGpu) {
                Object.defineProperty(navigator, 'gpu', previousGpu);
            } else {
                Object.defineProperty(navigator, 'gpu', {
                    configurable: true,
                    value: undefined,
                });
            }

            if (previousBufferUsage) {
                Object.defineProperty(globalThis, 'GPUBufferUsage', previousBufferUsage);
            } else {
                Object.defineProperty(globalThis, 'GPUBufferUsage', {
                    configurable: true,
                    value: undefined,
                });
            }

            if (previousShaderStage) {
                Object.defineProperty(globalThis, 'GPUShaderStage', previousShaderStage);
            } else {
                Object.defineProperty(globalThis, 'GPUShaderStage', {
                    configurable: true,
                    value: undefined,
                });
            }

            if (previousColorWrite) {
                Object.defineProperty(globalThis, 'GPUColorWrite', previousColorWrite);
            } else {
                Object.defineProperty(globalThis, 'GPUColorWrite', {
                    configurable: true,
                    value: undefined,
                });
            }

            if (previousTextureUsage) {
                Object.defineProperty(globalThis, 'GPUTextureUsage', previousTextureUsage);
            } else {
                Object.defineProperty(globalThis, 'GPUTextureUsage', {
                    configurable: true,
                    value: undefined,
                });
            }
        },
    };
};

const createMockTextCanvas = (width = 0, height = 0): MockTextCanvas => {
    const canvas = document.createElement('canvas');
    const context = {
        font: '',
        fillStyle: 'black',
        strokeStyle: 'black',
        lineWidth: 1,
        textBaseline: 'alphabetic',
        lineJoin: 'miter',
        miterLimit: 10,
        clearRect: jest.fn(),
        fillText: jest.fn(),
        strokeText: jest.fn(),
        measureText: jest.fn((text: string) => ({
            width: text.length * 10,
            actualBoundingBoxLeft: 0,
            actualBoundingBoxAscent: 10,
        })),
    } as unknown as CanvasRenderingContext2D & {
        clearRect: jest.Mock;
        fillText: jest.Mock;
        strokeText: jest.Mock;
        measureText: jest.Mock;
    };

    canvas.width = width;
    canvas.height = height;

    Object.defineProperty(canvas, 'getContext', {
        configurable: true,
        value: jest.fn((contextType: string) => contextType === '2d' ? context : null),
    });

    return {
        canvas,
        context,
    };
};

const createMockVideoElement = (): MockVideoElement => {
    const video = document.createElement('video');
    let videoWidth = 0;
    let videoHeight = 0;
    let currentTime = 0;

    Object.defineProperty(video, 'videoWidth', {
        configurable: true,
        get: () => videoWidth,
    });
    Object.defineProperty(video, 'videoHeight', {
        configurable: true,
        get: () => videoHeight,
    });
    Object.defineProperty(video, 'duration', {
        configurable: true,
        value: 12,
    });
    Object.defineProperty(video, 'volume', {
        configurable: true,
        writable: true,
        value: 1,
    });
    Object.defineProperty(video, 'playbackRate', {
        configurable: true,
        writable: true,
        value: 1,
    });
    Object.defineProperty(video, 'loop', {
        configurable: true,
        writable: true,
        value: false,
    });
    Object.defineProperty(video, 'muted', {
        configurable: true,
        writable: true,
        value: false,
    });
    Object.defineProperty(video, 'currentTime', {
        configurable: true,
        get: () => currentTime,
        set: (value: number) => {
            currentTime = value;
        },
    });

    return {
        video,
        setDimensions: (width: number, height: number): void => {
            videoWidth = width;
            videoHeight = height;
        },
        setCurrentTime: (time: number): void => {
            currentTime = time;
        },
    };
};

const createCustomRenderer = <Target extends Drawable>(): Renderer<WebGpuBackend, Target> => ({
    backendType: RenderBackendType.WebGpu,
    connect: jest.fn(),
    disconnect: jest.fn(),
    render: jest.fn(),
    flush: jest.fn(),
});

describe('WebGpuBackend', () => {
    test('flushes the active renderer when switching renderer types', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 320,
                    height: 240,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const firstRenderer = createCustomRenderer<CustomDrawableA>();
            const secondRenderer = createCustomRenderer<CustomDrawableB>();

            await manager.initialize();

            manager.rendererRegistry.registerRenderer(CustomDrawableA, firstRenderer);
            manager.rendererRegistry.registerRenderer(CustomDrawableB, secondRenderer);

            manager.draw(new CustomDrawableA());
            manager.draw(new CustomDrawableB());

            expect(firstRenderer.render).toHaveBeenCalledTimes(1);
            expect(firstRenderer.flush).toHaveBeenCalledTimes(1);
            expect(secondRenderer.render).toHaveBeenCalledTimes(1);
        } finally {
            environment.restore();
        }
    });

    test('flushes the active renderer before execute(pass)', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 320,
                    height: 240,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const renderer = createCustomRenderer<CustomDrawableA>();
            const pass = {
                execute: jest.fn(),
            };

            await manager.initialize();

            manager.rendererRegistry.registerRenderer(CustomDrawableA, renderer);
            manager.draw(new CustomDrawableA());
            manager.execute(pass);

            expect(renderer.flush).toHaveBeenCalledTimes(1);
            expect(pass.execute).toHaveBeenCalledWith(manager);
        } finally {
            environment.restore();
        }
    });

    test('flushes the active renderer during flush()', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 320,
                    height: 240,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const renderer = createCustomRenderer<CustomDrawableA>();

            await manager.initialize();

            manager.rendererRegistry.registerRenderer(CustomDrawableA, renderer);
            manager.draw(new CustomDrawableA());
            manager.flush();

            expect(renderer.flush).toHaveBeenCalledTimes(1);
        } finally {
            environment.restore();
        }
    });

    test('initializes the WebGPU canvas/backbuffer from the application size', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 640,
                    height: 360,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);

            expect(environment.canvas.width).toBe(640);
            expect(environment.canvas.height).toBe(360);

            await manager.initialize();

            expect(environment.canvas.width).toBe(640);
            expect(environment.canvas.height).toBe(360);
            expect(manager.view.width).toBe(640);
            expect(manager.view.height).toBe(360);
        } finally {
            environment.restore();
        }
    });

    test('exposes the current RenderTarget for explicit view management on WebGPU', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 640,
                    height: 360,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);

            await manager.initialize();

            expect(manager.renderTarget).toBeDefined();
            expect(manager.renderTarget.view).toBe(manager.view);
            expect(typeof manager.renderTarget.setView).toBe('function');
        } finally {
            environment.restore();
        }
    });

    test('renders Graphics through the built-in WebGPU mesh path', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const graphics = new Graphics();

            graphics.fillColor = Color.red;
            graphics.drawRectangle(0, 0, 32, 32);

            await manager.initialize();

            manager.clear();
            graphics.render(manager);
            manager.flush();
            manager.destroy();

            expect(environment.encoder.beginRenderPass).toHaveBeenCalled();
            expect(environment.pass.drawIndexed).toHaveBeenCalled();
            expect(environment.queue.submit).toHaveBeenCalled();
            expect(environment.context.configure).toHaveBeenCalledTimes(1);
            expect(environment.context.unconfigure).toHaveBeenCalledTimes(1);
            expect(environment.buffers.length).toBeGreaterThan(0);
            expect(environment.buffers.every((buffer) => buffer.destroy.mock.calls.length > 0)).toBe(true);
        } finally {
            environment.restore();
        }
    });

    test('supports additive blending for the built-in WebGPU primitive path', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const graphics = new Graphics();

            graphics.fillColor = Color.red;
            graphics.drawRectangle(0, 0, 32, 32);
            graphics.getChildAt(0).blendMode = BlendModes.Additive;

            await manager.initialize();

            manager.clear();
            graphics.render(manager);
            manager.flush();

            const additiveTarget = environment.pipelineDescriptors.find((descriptor) =>
                Array.from(descriptor.fragment?.targets ?? []).some((target) =>
                    target?.blend?.color.srcFactor === 'one'
                    && target.blend.color.dstFactor === 'one'
                    && target.blend.alpha.srcFactor === 'one'
                    && target.blend.alpha.dstFactor === 'one')
            );

            expect(additiveTarget).toBeDefined();
            manager.destroy();
        } finally {
            environment.restore();
        }
    });

    test('supports subtract blending for the built-in WebGPU primitive path', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const graphics = new Graphics();

            graphics.fillColor = Color.red;
            graphics.drawRectangle(0, 0, 32, 32);
            graphics.getChildAt(0).blendMode = BlendModes.Subtract;

            await manager.initialize();

            manager.clear();
            graphics.render(manager);
            manager.flush();

            const subtractTarget = environment.pipelineDescriptors.find((descriptor) =>
                Array.from(descriptor.fragment?.targets ?? []).some((target) =>
                    target?.blend?.color.srcFactor === 'zero'
                    && target.blend.color.dstFactor === 'one-minus-src'
                    && target.blend.alpha.srcFactor === 'zero'
                    && target.blend.alpha.dstFactor === 'one-minus-src-alpha')
            );

            expect(subtractTarget).toBeDefined();
            manager.destroy();
        } finally {
            environment.restore();
        }
    });

    test('renders Sprite through the built-in WebGPU sprite path', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const sprite = new Sprite(texture);

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();
            sprite.x = 12;
            sprite.y = 16;

            await manager.initialize();

            manager.clear();
            sprite.render(manager);
            manager.flush();
            manager.destroy();

            expect(environment.pass.drawIndexed).toHaveBeenCalledWith(6, 1, 0, 0, 0);
            expect(environment.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
            expect(environment.textures.length).toBeGreaterThan(0);
            expect(environment.textures.every((gpuTexture) => gpuTexture.destroy.mock.calls.length > 0)).toBe(true);
        } finally {
            environment.restore();
        }
    });

    test('batches contiguous same-texture WebGPU sprites into one indexed draw', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const firstSprite = new Sprite(texture);
            const secondSprite = new Sprite(texture);

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();
            secondSprite.x = 20;

            await manager.initialize();

            manager.clear();
            firstSprite.render(manager);
            secondSprite.render(manager);
            manager.flush();

            expect(environment.pass.drawIndexed).toHaveBeenCalledTimes(1);
            expect(environment.pass.drawIndexed).toHaveBeenCalledWith(6, 2, 0, 0, 0);
            expect(environment.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
        } finally {
            environment.restore();
        }
    });

    test('batches WebGPU sprites across texture changes when blend mode matches', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const firstCanvas = document.createElement('canvas');
            const secondCanvas = document.createElement('canvas');
            const firstTexture = new Texture(firstCanvas);
            const secondTexture = new Texture(secondCanvas);
            const firstSprite = new Sprite(firstTexture);
            const secondSprite = new Sprite(secondTexture);

            firstCanvas.width = 16;
            firstCanvas.height = 16;
            secondCanvas.width = 16;
            secondCanvas.height = 16;
            firstTexture.updateSource();
            secondTexture.updateSource();

            await manager.initialize();

            manager.clear();
            firstSprite.render(manager);
            secondSprite.render(manager);
            manager.flush();

            expect(environment.pass.drawIndexed).toHaveBeenCalledTimes(1);
            expect(environment.pass.drawIndexed).toHaveBeenCalledWith(6, 2, 0, 0, 0);
            expect(environment.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
        } finally {
            environment.restore();
        }
    });

    test('keeps same-texture WebGPU sprite batching even when sampler settings are non-default', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const firstCanvas = document.createElement('canvas');
            const texture = new Texture(firstCanvas);
            const firstSprite = new Sprite(texture);
            const secondSprite = new Sprite(texture);

            firstCanvas.width = 16;
            firstCanvas.height = 16;
            texture.updateSource();
            texture.scaleMode = ScaleModes.Nearest;

            await manager.initialize();

            manager.clear();
            firstSprite.render(manager);
            secondSprite.render(manager);
            manager.flush();

            expect(environment.pass.drawIndexed).toHaveBeenCalledTimes(1);
            expect(environment.pass.drawIndexed).toHaveBeenCalledWith(6, 2, 0, 0, 0);
        } finally {
            environment.restore();
        }
    });

    test('batches interleaved multi-texture WebGPU sprites into one draw when within texture slot budget', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const firstCanvas = document.createElement('canvas');
            const secondCanvas = document.createElement('canvas');
            const firstTexture = new Texture(firstCanvas);
            const secondTexture = new Texture(secondCanvas);
            const firstSprite = new Sprite(firstTexture);
            const secondSprite = new Sprite(secondTexture);
            const thirdSprite = new Sprite(firstTexture);

            firstCanvas.width = 16;
            firstCanvas.height = 16;
            secondCanvas.width = 16;
            secondCanvas.height = 16;
            firstTexture.updateSource();
            secondTexture.updateSource();

            await manager.initialize();

            manager.clear();
            firstSprite.render(manager);
            secondSprite.render(manager);
            thirdSprite.render(manager);
            manager.flush();

            expect(environment.pass.drawIndexed).toHaveBeenCalledTimes(1);
            expect(environment.pass.drawIndexed).toHaveBeenCalledWith(6, 3, 0, 0, 0);
        } finally {
            environment.restore();
        }
    });

    test('splits WebGPU sprite batches when the texture slot budget is exceeded', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sprites: Array<Sprite> = [];

            for (let index = 0; index < 9; index++) {
                const canvas = document.createElement('canvas');

                canvas.width = 16;
                canvas.height = 16;

                const texture = new Texture(canvas);
                const sprite = new Sprite(texture);

                texture.updateSource();
                sprite.x = index * 4;
                sprites.push(sprite);
            }

            await manager.initialize();

            manager.clear();

            for (const sprite of sprites) {
                sprite.render(manager);
            }

            manager.flush();

            expect(environment.pass.drawIndexed).toHaveBeenCalledTimes(2);
            expect(environment.pass.drawIndexed.mock.calls[0][1]).toBe(8);
            expect(environment.pass.drawIndexed.mock.calls[1][1]).toBe(1);
        } finally {
            environment.restore();
        }
    });

    test('flushes WebGPU sprite batches when blend mode changes', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const firstSprite = new Sprite(texture);
            const secondSprite = new Sprite(texture);

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();
            secondSprite.blendMode = BlendModes.Additive;

            await manager.initialize();

            manager.clear();
            firstSprite.render(manager);
            secondSprite.render(manager);
            manager.flush();

            expect(environment.pass.drawIndexed).toHaveBeenCalledTimes(2);
            expect(environment.pass.drawIndexed.mock.calls[0][1]).toBe(1);
            expect(environment.pass.drawIndexed.mock.calls[1][1]).toBe(1);
        } finally {
            environment.restore();
        }
    });

    test('supports additive blending for the built-in WebGPU sprite path', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const sprite = new Sprite(texture);

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();
            sprite.blendMode = BlendModes.Additive;

            await manager.initialize();

            manager.clear();
            sprite.render(manager);
            manager.flush();

            const additiveTarget = environment.pipelineDescriptors.find((descriptor) =>
                descriptor.primitive?.topology === 'triangle-list'
                && Array.from(descriptor.fragment?.targets ?? []).some((target) =>
                    target?.blend?.color.srcFactor === 'one'
                    && target.blend.color.dstFactor === 'one'
                    && target.blend.alpha.srcFactor === 'one'
                    && target.blend.alpha.dstFactor === 'one')
            );

            expect(additiveTarget).toBeDefined();
        } finally {
            environment.restore();
        }
    });

    test('supports multiply blending for the built-in WebGPU sprite path', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const sprite = new Sprite(texture);

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();
            sprite.blendMode = BlendModes.Multiply;

            await manager.initialize();

            manager.clear();
            sprite.render(manager);
            manager.flush();

            const multiplyTarget = environment.pipelineDescriptors.find((descriptor) =>
                descriptor.primitive?.topology === 'triangle-list'
                && Array.from(descriptor.fragment?.targets ?? []).some((target) =>
                    target?.blend?.color.srcFactor === 'dst'
                    && target.blend.color.dstFactor === 'one-minus-src-alpha'
                    && target.blend.alpha.srcFactor === 'dst-alpha'
                    && target.blend.alpha.dstFactor === 'one-minus-src-alpha')
            );

            expect(multiplyTarget).toBeDefined();
        } finally {
            environment.restore();
        }
    });

    test('configures real WebGPU mipmap state for mipmapped sprite textures', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const sprite = new Sprite(texture);

            sourceCanvas.width = 16;
            sourceCanvas.height = 8;
            texture.scaleMode = ScaleModes.LinearMipmapLinear;
            texture.generateMipMap = true;
            texture.updateSource();

            await manager.initialize();

            manager.clear();
            sprite.render(manager);
            manager.flush();

            expect(environment.createTexture.mock.calls.some(([descriptor]) =>
                descriptor.mipLevelCount === 5
                && (descriptor.usage & GPUTextureUsage.RENDER_ATTACHMENT) === GPUTextureUsage.RENDER_ATTACHMENT
            )).toBe(true);
            expect(environment.createSampler.mock.calls.some(([descriptor]) =>
                descriptor.minFilter === 'linear'
                && descriptor.magFilter === 'linear'
                && descriptor.mipmapFilter === 'linear'
            )).toBe(true);
            expect(environment.encoder.beginRenderPass.mock.calls.length).toBeGreaterThan(1);
        } finally {
            environment.restore();
        }
    });

    test('does not premultiply WebGPU sprite samples when premultiplyAlpha is disabled', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const sprite = new Sprite(texture);

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.premultiplyAlpha = false;
            texture.updateSource();

            await manager.initialize();

            manager.clear();
            sprite.render(manager);
            manager.flush();

            const vertexWrite = environment.queue.writeBuffer.mock.calls[environment.queue.writeBuffer.mock.calls.length - 1];
            const data = new Uint32Array(vertexWrite[2] as ArrayBuffer);

            expect(data[5]).toBe(0);
        } finally {
            environment.restore();
        }
    });

    test('renders Text through the built-in WebGPU mesh path', async () => {
        const environment = createMockWebGpuEnvironment();

        // Install a full canvas2d mock so DynamicGlyphAtlas can rasterize glyphs.
        const glyphCtx = {
            font: '',
            textBaseline: 'alphabetic',
            fillStyle: '#ffffff',
            measureText: (_text: string) => ({
                width: 10,
                actualBoundingBoxLeft: 0,
                actualBoundingBoxRight: 9,
                actualBoundingBoxAscent: 13,
                actualBoundingBoxDescent: 3,
                fontBoundingBoxAscent: 14,
                fontBoundingBoxDescent: 4,
            } as TextMetrics),
            fillText: jest.fn(),
            clearRect: jest.fn(),
        } as unknown as CanvasRenderingContext2D;

        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: (type: string) => type === '2d' ? glyphCtx : null,
        });

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);

            // "Hi" → 2 glyphs → 2 quads → 12 indices, batched into 1 drawIndexed
            const text = new Text('Hi', new TextStyle({ fontSize: 16 }));

            await manager.initialize();

            manager.clear();
            text.render(manager);
            manager.flush();
            manager.destroy();

            // Text renders its internal Mesh child through the mesh renderer.
            expect(environment.pass.drawIndexed).toHaveBeenCalled();
        } finally {
            Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
                configurable: true,
                value: () => ({ fillStyle: '', fillRect: () => undefined, drawImage: () => undefined }),
            });
            environment.restore();
        }
    });

    test('re-renders Text after setText rebuilds the internal mesh', async () => {
        const environment = createMockWebGpuEnvironment();

        const glyphCtx = {
            font: '',
            textBaseline: 'alphabetic',
            fillStyle: '#ffffff',
            measureText: (_text: string) => ({
                width: 10,
                actualBoundingBoxLeft: 0,
                actualBoundingBoxRight: 9,
                actualBoundingBoxAscent: 13,
                actualBoundingBoxDescent: 3,
                fontBoundingBoxAscent: 14,
                fontBoundingBoxDescent: 4,
            } as TextMetrics),
            fillText: jest.fn(),
            clearRect: jest.fn(),
        } as unknown as CanvasRenderingContext2D;

        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: (type: string) => type === '2d' ? glyphCtx : null,
        });

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const text = new Text('Hi', new TextStyle({ fontSize: 16 }));
            const firstMesh = text.children[0];

            await manager.initialize();

            manager.clear();
            text.render(manager);
            manager.flush();

            // Changing text rebuilds the internal mesh.
            text.setText('Bye');

            expect(text.children[0]).not.toBe(firstMesh);

            text.render(manager);
            manager.flush();

            // drawIndexed should have been called for both render passes.
            expect(environment.pass.drawIndexed.mock.calls.length).toBeGreaterThanOrEqual(2);
        } finally {
            Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
                configurable: true,
                value: () => ({ fillStyle: '', fillRect: () => undefined, drawImage: () => undefined }),
            });
            environment.restore();
        }
    });

    test('Text setStyle rebuilds the internal mesh with updated properties', async () => {
        const environment = createMockWebGpuEnvironment();

        const glyphCtx = {
            font: '',
            textBaseline: 'alphabetic',
            fillStyle: '#ffffff',
            measureText: (_text: string) => ({
                width: 10,
                actualBoundingBoxLeft: 0,
                actualBoundingBoxRight: 9,
                actualBoundingBoxAscent: 13,
                actualBoundingBoxDescent: 3,
                fontBoundingBoxAscent: 14,
                fontBoundingBoxDescent: 4,
            } as TextMetrics),
            fillText: jest.fn(),
            clearRect: jest.fn(),
        } as unknown as CanvasRenderingContext2D;

        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: (type: string) => type === '2d' ? glyphCtx : null,
        });

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const text = new Text('Hi', new TextStyle({ fontSize: 16 }));
            const firstMesh = text.children[0];

            await manager.initialize();

            manager.clear();
            text.render(manager);
            manager.flush();

            // Changing style rebuilds the mesh.
            text.setStyle(new TextStyle({ fontSize: 32 }));

            expect(text.children[0]).not.toBe(firstMesh);

            text.render(manager);
            manager.flush();

            expect(environment.pass.drawIndexed.mock.calls.length).toBeGreaterThanOrEqual(2);
        } finally {
            Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
                configurable: true,
                value: () => ({ fillStyle: '', fillRect: () => undefined, drawImage: () => undefined }),
            });
            environment.restore();
        }
    });

    test('does not upload WebGPU video textures before video dimensions are available', async () => {
        const environment = createMockWebGpuEnvironment();
        const mockVideo = createMockVideoElement();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const video = new Video(mockVideo.video);

            await manager.initialize();

            manager.clear();
            video.render(manager);
            manager.flush();
            video.destroy();
            manager.destroy();

            expect(environment.queue.copyExternalImageToTexture).not.toHaveBeenCalled();
            expect(environment.pass.drawIndexed).not.toHaveBeenCalled();
        } finally {
            environment.restore();
        }
    });

    test('renders Video through the built-in WebGPU sprite path once video dimensions are available', async () => {
        const environment = createMockWebGpuEnvironment();
        const mockVideo = createMockVideoElement();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const video = new Video(mockVideo.video);

            await manager.initialize();

            mockVideo.setDimensions(64, 32);
            manager.clear();
            video.render(manager);
            manager.flush();
            video.destroy();
            manager.destroy();

            expect(environment.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
            expect(environment.pass.drawIndexed).toHaveBeenCalledWith(6, 1, 0, 0, 0);
            expect(video.textureFrame.width).toBe(64);
            expect(video.textureFrame.height).toBe(32);
        } finally {
            environment.restore();
        }
    });

    test('re-uploads WebGPU video textures as frames advance', async () => {
        const environment = createMockWebGpuEnvironment();
        const mockVideo = createMockVideoElement();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const video = new Video(mockVideo.video);

            await manager.initialize();

            mockVideo.setDimensions(48, 48);
            mockVideo.setCurrentTime(0);
            manager.clear();
            video.render(manager);
            manager.flush();

            mockVideo.setCurrentTime(0.033);
            video.render(manager);
            manager.flush();
            video.destroy();
            manager.destroy();

            expect(environment.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
            expect(environment.pass.drawIndexed).toHaveBeenCalledWith(6, 1, 0, 0, 0);
        } finally {
            environment.restore();
        }
    });

    test('preserves explicit Video display size while syncing intrinsic frame size on WebGPU', async () => {
        const environment = createMockWebGpuEnvironment();
        const mockVideo = createMockVideoElement();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);

            mockVideo.setDimensions(64, 32);

            const video = new Video(mockVideo.video);
            video.width = 256;
            video.height = 128;

            await manager.initialize();

            manager.clear();
            video.render(manager);
            manager.flush();

            video.render(manager);
            manager.flush();

            expect(video.width).toBe(256);
            expect(video.height).toBe(128);
            expect(video.textureFrame.width).toBe(64);
            expect(video.textureFrame.height).toBe(32);
            expect(environment.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
        } finally {
            environment.restore();
        }
    });

    test('renders ParticleSystem through the built-in WebGPU particle path', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const system = new ParticleSystem(texture);
            const particle = system.requestParticle();

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();

            particle.position.set(10, 12);
            particle.scale.set(2, 3);
            particle.rotation = 45;
            particle.tint = Color.red;

            system.emitParticle(particle);

            await manager.initialize();

            manager.clear();
            system.render(manager);
            manager.flush();
            manager.destroy();

            expect(environment.pass.drawIndexed).toHaveBeenCalledWith(6, 1, 0, 0, 0);
            expect(environment.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
            expect(environment.queue.submit).toHaveBeenCalled();
        } finally {
            environment.restore();
        }
    });

    test('renders WebGPU particles with one instanced draw per system', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const system = new ParticleSystem(texture);
            const firstParticle = system.requestParticle();
            const secondParticle = system.requestParticle();

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();

            firstParticle.position.set(10, 12);
            secondParticle.position.set(20, 24);
            secondParticle.rotation = 20;
            secondParticle.scale.set(2, 2);
            secondParticle.tint = Color.red;

            system.emitParticle(firstParticle);
            system.emitParticle(secondParticle);

            await manager.initialize();

            manager.clear();
            system.render(manager);
            manager.flush();

            expect(environment.pass.drawIndexed).toHaveBeenCalledTimes(1);
            expect(environment.pass.drawIndexed).toHaveBeenCalledWith(6, 2, 0, 0, 0);
        } finally {
            environment.restore();
        }
    });

    test('supports additive blending for the built-in WebGPU particle path', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const system = new ParticleSystem(texture);
            const particle = system.requestParticle();

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();

            particle.tint = Color.red;
            system.emitParticle(particle);
            system.blendMode = BlendModes.Additive;

            await manager.initialize();

            manager.clear();
            system.render(manager);
            manager.flush();

            const additiveTarget = environment.pipelineDescriptors.find((descriptor) =>
                descriptor.primitive?.topology === 'triangle-list'
                && Array.from(descriptor.fragment?.targets ?? []).some((target) =>
                    target?.blend?.color.srcFactor === 'one'
                    && target.blend.color.dstFactor === 'one'
                    && target.blend.alpha.srcFactor === 'one'
                    && target.blend.alpha.dstFactor === 'one')
            );

            expect(additiveTarget).toBeDefined();
        } finally {
            environment.restore();
        }
    });

    test('supports screen blending for the built-in WebGPU particle path', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const system = new ParticleSystem(texture);
            const particle = system.requestParticle();

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();

            particle.tint = Color.red;
            system.emitParticle(particle);
            system.blendMode = BlendModes.Screen;

            await manager.initialize();

            manager.clear();
            system.render(manager);
            manager.flush();

            const screenTarget = environment.pipelineDescriptors.find((descriptor) =>
                descriptor.primitive?.topology === 'triangle-list'
                && Array.from(descriptor.fragment?.targets ?? []).some((target) =>
                    target?.blend?.color.srcFactor === 'one'
                    && target.blend.color.dstFactor === 'one-minus-src'
                    && target.blend.alpha.srcFactor === 'one'
                    && target.blend.alpha.dstFactor === 'one-minus-src-alpha')
            );

            expect(screenTarget).toBeDefined();
        } finally {
            environment.restore();
        }
    });

    test('uses fragment-visible particle uniforms for the built-in WebGPU particle path', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const system = new ParticleSystem(texture);
            const particle = system.requestParticle();

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();
            system.emitParticle(particle);

            await manager.initialize();

            manager.clear();
            system.render(manager);
            manager.flush();

            expect(environment.createBindGroupLayout).toHaveBeenCalledWith(expect.objectContaining({
                entries: expect.arrayContaining([
                    expect.objectContaining({
                        binding: 0,
                        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    }),
                ]),
            }));
        } finally {
            environment.restore();
        }
    });

    test('renders into a WebGPU RenderTexture and displays it through the built-in Sprite path', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const renderTexture = new RenderTexture(64, 64);
            const graphics = new Graphics();
            const sprite = new Sprite(renderTexture);

            graphics.fillColor = Color.red;
            graphics.drawRectangle(0, 0, 32, 32);
            sprite.x = 24;
            sprite.y = 18;

            await manager.initialize();

            manager.setRenderTarget(renderTexture);
            manager.clear(Color.cornflowerBlue);
            graphics.render(manager);
            manager.setRenderTarget(null);
            manager.clear(Color.black);
            sprite.render(manager);
            manager.flush();
            manager.destroy();

            const vertexWrite = environment.queue.writeBuffer.mock.calls[environment.queue.writeBuffer.mock.calls.length - 1];
            const data = new Uint32Array(vertexWrite[2] as ArrayBuffer);

            expect(environment.encoder.beginRenderPass.mock.calls.length).toBeGreaterThanOrEqual(2);
            expect(environment.pass.drawIndexed).toHaveBeenCalled();
            expect(environment.queue.submit.mock.calls.length).toBeGreaterThanOrEqual(2);
            expect(environment.textures.length).toBeGreaterThan(0);
            expect(data[5]).toBe(0);
        } finally {
            environment.restore();
        }
    });

    test('creates separate WebGPU pipelines for root and RenderTexture attachment formats', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const renderTexture = new RenderTexture(64, 64);
            const graphics = new Graphics();
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const sprite = new Sprite(texture);

            graphics.fillColor = Color.red;
            graphics.drawRectangle(0, 0, 32, 32);
            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();

            await manager.initialize();

            manager.setRenderTarget(renderTexture);
            manager.clear(Color.cornflowerBlue);
            graphics.render(manager);
            manager.setRenderTarget(null);
            manager.clear(Color.black);
            sprite.render(manager);
            manager.flush();

            const targetFormats = environment.pipelineDescriptors
                .flatMap((descriptor) => Array.from(descriptor.fragment?.targets ?? []))
                .map((target) => target?.format)
                .filter((format): format is GPUTextureFormat => format !== undefined);

            expect(targetFormats).toContain('rgba8unorm');
            expect(targetFormats).toContain('bgra8unorm');
        } finally {
            environment.restore();
        }
    });

    test('applies WebGPU filters through render-target passes', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const sprite = new Sprite(texture);

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();
            sprite.addFilter(new ColorFilter(Color.red));

            await manager.initialize();

            manager.clear();
            sprite.render(manager);
            manager.flush();

            expect(environment.encoder.beginRenderPass.mock.calls.length).toBeGreaterThanOrEqual(3);
            expect(environment.pass.drawIndexed.mock.calls.length).toBeGreaterThanOrEqual(3);
            sprite.destroy();
            manager.destroy();
        } finally {
            environment.restore();
        }
    });

    test('applies WebGPU scissor state for masked drawables', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const sprite = new Sprite(texture);

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();

            sprite.mask = new Rectangle(4, 5, 8, 8);

            await manager.initialize();

            manager.clear();
            sprite.render(manager);
            manager.flush();

            expect(environment.pass.setScissorRect).toHaveBeenCalled();
            const scissorCall = environment.pass.setScissorRect.mock.calls[0];

            expect(scissorCall[2]).toBeGreaterThan(0);
            expect(scissorCall[3]).toBeGreaterThan(0);
            sprite.destroy();
            manager.destroy();
        } finally {
            environment.restore();
        }
    });

    test('reuses WebGPU cache-as-bitmap output until invalidated', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const container = new Container();
            const sprite = new Sprite(texture);

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();

            container.cacheAsBitmap = true;
            container.addChild(sprite);

            await manager.initialize();

            manager.clear();
            container.render(manager);
            manager.flush();
            const firstFrameDrawCalls = environment.pass.drawIndexed.mock.calls.length;

            environment.pass.drawIndexed.mockClear();
            environment.encoder.beginRenderPass.mockClear();

            manager.clear();
            container.render(manager);
            manager.flush();

            expect(firstFrameDrawCalls).toBeGreaterThanOrEqual(2);
            expect(environment.encoder.beginRenderPass).toHaveBeenCalledTimes(1);
            expect(environment.pass.drawIndexed).toHaveBeenCalledTimes(1);
            sprite.destroy();
            container.destroy();
            manager.destroy();
        } finally {
            environment.restore();
        }
    });

    test('tracks sprite batching and draw statistics per frame', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const first = new Sprite(texture);
            const second = new Sprite(texture);

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();
            second.x = 20;

            await manager.initialize();

            manager.resetStats();
            manager.clear();
            first.render(manager);
            second.render(manager);
            manager.flush();

            expect(manager.stats.submittedNodes).toBe(2);
            expect(manager.stats.culledNodes).toBe(0);
            expect(manager.stats.batches).toBe(1);
            expect(manager.stats.drawCalls).toBe(1);
            expect(manager.stats.renderPasses).toBeGreaterThanOrEqual(1);
        } finally {
            environment.restore();
        }
    });

    test('resetStats clears counters and advances frame', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);
            const sourceCanvas = document.createElement('canvas');
            const texture = new Texture(sourceCanvas);
            const sprite = new Sprite(texture);
            const target = new RenderTexture(32, 32);

            sourceCanvas.width = 16;
            sourceCanvas.height = 16;
            texture.updateSource();

            await manager.initialize();

            manager.resetStats();
            const frame = manager.stats.frame;

            manager.setRenderTarget(target);
            manager.setRenderTarget(null);
            manager.clear();
            sprite.render(manager);
            manager.flush();

            expect(manager.stats.renderTargetChanges).toBe(2);
            expect(manager.stats.drawCalls).toBeGreaterThan(0);
            expect(manager.stats.batches).toBeGreaterThan(0);

            manager.resetStats();

            expect(manager.stats.frame).toBe(frame + 1);
            expect(manager.stats.submittedNodes).toBe(0);
            expect(manager.stats.culledNodes).toBe(0);
            expect(manager.stats.drawCalls).toBe(0);
            expect(manager.stats.batches).toBe(0);
            expect(manager.stats.renderPasses).toBe(0);
            expect(manager.stats.renderTargetChanges).toBe(0);
        } finally {
            environment.restore();
        }
    });

    test('reports a clear initialization error when preferred canvas format is unavailable', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const gpuNavigator = navigator as Navigator & { gpu?: Partial<GPU>; };

            if (gpuNavigator.gpu) {
                Object.assign(gpuNavigator.gpu, {
                    getPreferredCanvasFormat: undefined,
                });
            }

            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);

            await expect(manager.initialize()).rejects.toThrow('getPreferredCanvasFormat');
        } finally {
            environment.restore();
        }
    });

    test('reports a clear initialization error when requesting a WebGPU device fails', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const gpuNavigator = navigator as Navigator & { gpu?: Partial<GPU>; };

            if (gpuNavigator.gpu) {
                Object.assign(gpuNavigator.gpu, {
                    requestAdapter: jest.fn(async () => ({
                        requestDevice: jest.fn(async () => {
                            throw new Error('device request denied');
                        }),
                    }) as unknown as GPUAdapter),
                });
            }

            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);

            await expect(manager.initialize()).rejects.toThrow('Failed to request a WebGPU device.');
        } finally {
            environment.restore();
        }
    });

    test('allows retrying WebGPU initialization after a transient adapter failure', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const gpuNavigator = navigator as Navigator & { gpu?: Partial<GPU>; };
            const originalRequestAdapter = gpuNavigator.gpu?.requestAdapter;
            let shouldFail = true;

            if (gpuNavigator.gpu && originalRequestAdapter) {
                Object.assign(gpuNavigator.gpu, {
                    requestAdapter: jest.fn(async () => {
                        if (shouldFail) {
                            shouldFail = false;

                            return null;
                        }

                        return originalRequestAdapter.call(gpuNavigator.gpu);
                    }),
                });
            }

            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);

            await expect(manager.initialize()).rejects.toThrow('Could not acquire a WebGPU adapter.');
            await expect(manager.initialize()).resolves.toBe(manager);
        } finally {
            environment.restore();
        }
    });

    test('still rejects unknown WebGPU blend modes explicitly', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
            const app = {
                canvas: environment.canvas,
                options: {
                    width: 128,
                    height: 128,
                    clearColor: Color.black,
                },
            } as unknown as Application;
            const manager = new WebGpuBackend(app);

            await manager.initialize();

            expect(() => manager.setBlendMode(999 as BlendModes)).toThrow('WebGPU blend mode');
        } finally {
            environment.restore();
        }
    });
});
