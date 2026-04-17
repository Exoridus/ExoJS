/// <reference types="@webgpu/types" />

import { BlendModes } from 'rendering/types';

/**
 * Returns the GPUBlendState for a given ExoJS blend mode.
 * Shared by all WebGPU renderers to avoid duplication.
 */
export function getWebGpuBlendState(blendMode: BlendModes): GPUBlendState {
    switch (blendMode) {
        case BlendModes.Additive:
            return {
                color: {
                    operation: 'add',
                    srcFactor: 'one',
                    dstFactor: 'one',
                },
                alpha: {
                    operation: 'add',
                    srcFactor: 'one',
                    dstFactor: 'one',
                },
            };
        case BlendModes.Subtract:
            return {
                color: {
                    operation: 'add',
                    srcFactor: 'zero',
                    dstFactor: 'one-minus-src',
                },
                alpha: {
                    operation: 'add',
                    srcFactor: 'zero',
                    dstFactor: 'one-minus-src-alpha',
                },
            };
        case BlendModes.Multiply:
            return {
                color: {
                    operation: 'add',
                    srcFactor: 'dst',
                    dstFactor: 'one-minus-src-alpha',
                },
                alpha: {
                    operation: 'add',
                    srcFactor: 'dst-alpha',
                    dstFactor: 'one-minus-src-alpha',
                },
            };
        case BlendModes.Screen:
            return {
                color: {
                    operation: 'add',
                    srcFactor: 'one',
                    dstFactor: 'one-minus-src',
                },
                alpha: {
                    operation: 'add',
                    srcFactor: 'one',
                    dstFactor: 'one-minus-src-alpha',
                },
            };
        default:
            return {
                color: {
                    operation: 'add',
                    srcFactor: 'one',
                    dstFactor: 'one-minus-src-alpha',
                },
                alpha: {
                    operation: 'add',
                    srcFactor: 'one',
                    dstFactor: 'one-minus-src-alpha',
                },
            };
    }
}
