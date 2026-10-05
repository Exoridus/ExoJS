/// <reference types="@webgpu/types" />

import { BlendModes } from '#rendering/types';

/**
 * Returns the GPUBlendState for a given ExoJS blend mode.
 * Shared by all WebGPU renderers to avoid duplication.
 */
export const getWebGpuBlendState = (blendMode: BlendModes): GPUBlendState => {
  switch (blendMode) {
    case BlendModes.Additive:
      return {
        color: {
          operation: 'add',
          srcFactor: 'one',
          dstFactor: 'one',
        },
        // Unconstrained (as + ad) would exceed 1 under repeated additive draws;
        // alpha uses ordinary source-over coverage instead, same as every other
        // fixed-function mode.
        alpha: {
          operation: 'add',
          srcFactor: 'one',
          dstFactor: 'one-minus-src-alpha',
        },
      };
    case BlendModes.Subtract:
      return {
        color: {
          operation: 'add',
          srcFactor: 'zero',
          dstFactor: 'one-minus-src',
        },
        // Destination alpha is preserved exactly: this mode only attenuates RGB
        // (Cd*(1-Cs), not arithmetic subtraction), and has no coverage of its own
        // to composite over the destination with.
        alpha: {
          operation: 'add',
          srcFactor: 'zero',
          dstFactor: 'one',
        },
      };
    case BlendModes.Multiply:
      return {
        color: {
          operation: 'add',
          srcFactor: 'dst',
          dstFactor: 'one-minus-src-alpha',
        },
        // Source-over coverage, matching every other fixed-function mode. This
        // RGB shortcut (Cs*Cd + Cd*(1-as)) is exact only against an opaque
        // destination; a translucent destination needs the backdrop-aware
        // compositor's full W3C formula.
        alpha: {
          operation: 'add',
          srcFactor: 'one',
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
      // Modes 5-17 (Darken, Lighten, Overlay, ..., Luminosity) are compositor-handled
      // (backdrop-aware shader path). Inside the barrier texture capture they render
      // as Normal so the captured sprite is pristine premultiplied RGBA; the actual
      // W3C blend happens in WebGpuBackdropBlendCompositor. All other unrecognised
      // modes fall back to Normal (premultiplied source-over).
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
};
