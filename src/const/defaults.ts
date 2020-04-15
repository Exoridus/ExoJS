import { ScaleModes, WrapModes } from './rendering';
import { Color } from 'core/Color';
import { Gamepad } from "./input";
import { ApplicationOptions } from "core/Application";
import { SamplerOptions } from "rendering/texture/Sampler";
import { GamepadControl } from "input/GamepadControl";
import { GamepadMapping } from "input/GamepadMapping";
import { PlaybackOptions } from "./types";

/**
 * App defaults
 */
export const defaultApplicationOptions: ApplicationOptions = {
    width: 800,
    height: 600,
    clearColor: Color.CornflowerBlue,
    context: {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        stencil: false,
        depth: false,
    },
    loader: {
        resourcePath: '',
        method: 'GET',
        mode: 'cors',
        cache: 'default',
    }
};

/**
 * Rendering defaults
 */
export const defaultTextureSamplerOptions: SamplerOptions = {
    scaleMode: ScaleModes.LINEAR,
    wrapMode: WrapModes.CLAMP_TO_EDGE,
    premultiplyAlpha: true,
    generateMipMap: true,
    flipY: false,
};

export const defaultRenderTextureSamplerOptions: SamplerOptions = {
    scaleMode: ScaleModes.LINEAR,
    wrapMode: WrapModes.CLAMP_TO_EDGE,
    premultiplyAlpha: true,
    generateMipMap: false,
    flipY: true,
};

export const defaultSpriteRendererBatchSize = 4096; // ~ 262kb
export const defaultParticleRendererBatchSize = 8192; // ~ 1.18mb
export const defaultPrimitiveRendererBatchSize = 65536; // ~ 786kb
export const defaultCircleSegments = 32;

/**
 * Media defaults
 */
export const defaultPlaybackOptions: PlaybackOptions = {
    volume: 0.5,
    loop: false,
    speed: 1.0,
    time: 0,
    muted: false,
};

/**
 * Input defaults
 */
export const defaultGamepadButtons: Array<GamepadControl> = [
    new GamepadControl(0, Gamepad.FaceBottom),
    new GamepadControl(1, Gamepad.FaceRight),
    new GamepadControl(2, Gamepad.FaceLeft),
    new GamepadControl(3, Gamepad.FaceTop),
    new GamepadControl(4, Gamepad.ShoulderLeftBottom),
    new GamepadControl(5, Gamepad.ShoulderRightBottom),
    new GamepadControl(6, Gamepad.ShoulderLeftTop),
    new GamepadControl(7, Gamepad.ShoulderRightTop),
    new GamepadControl(8, Gamepad.Select),
    new GamepadControl(9, Gamepad.Start),
    new GamepadControl(10, Gamepad.LeftStick),
    new GamepadControl(11, Gamepad.RightStick),
    new GamepadControl(12, Gamepad.DPadUp),
    new GamepadControl(13, Gamepad.DPadDown),
    new GamepadControl(14, Gamepad.DPadLeft),
    new GamepadControl(15, Gamepad.DPadRight),
    new GamepadControl(16, Gamepad.Home),
];

export const defaultGamepadAxes: Array<GamepadControl> = [
    new GamepadControl(0, Gamepad.LeftStickLeft, { invert: true }),
    new GamepadControl(0, Gamepad.LeftStickRight),
    new GamepadControl(1, Gamepad.LeftStickUp, { invert: true }),
    new GamepadControl(1, Gamepad.LeftStickDown),
    new GamepadControl(2, Gamepad.RightStickLeft, { invert: true }),
    new GamepadControl(2, Gamepad.RightStickRight),
    new GamepadControl(3, Gamepad.RightStickUp, { invert: true }),
    new GamepadControl(3, Gamepad.RightStickDown),
];

export const defaultGamepadMapping: GamepadMapping = new GamepadMapping(defaultGamepadButtons, defaultGamepadAxes);
export const defaultInputThreshold = 300;

/**
 * QuadTree defaults
 */
export const defaultQuadTreeMaxLevel = 5;
export const defaultQuadTreeMaxObjects = 20;