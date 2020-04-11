import { ScaleModes, WrapModes } from './const/rendering';
import Color from './core/Color';
import { defaultGamepadMapping } from "./const/input";
import { ApplicationOptions } from "./core/Application";

const AppOptions: ApplicationOptions = {
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

export default {

    APP_OPTIONS: AppOptions,

    SCALE_MODE: ScaleModes.LINEAR,
    WRAP_MODE: WrapModes.CLAMP_TO_EDGE,
    PREMULTIPLY_ALPHA: true,
    GENERATE_MIPMAP: true,
    FLIP_Y: false,
    FLIP_Y_RENDER_TEXTURE: true,

    QUAD_TREE_MAX_LEVEL: 5,
    QUAD_TREE_MAX_OBJECTS: 20,

    BATCH_SIZE_SPRITES: 4096, // ~ 262kb
    BATCH_SIZE_PARTICLES: 8192, // ~ 1.18mb
    BATCH_SIZE_PRIMITIVES: 65536, // ~ 786kb

    INPUT_THRESHOLD: 300,

    GamepadMapping: defaultGamepadMapping,

    CircleSegments: 32,

    defaultVideoOptions: {
        volume: 1.0,
        loop: false,
        speed: 1.0,
        time: 0,
        muted: false,
    },

    defaultMusicOptions: {
        volume: 1.0,
        loop: false,
        speed: 1.0,
        time: 0,
        muted: false,
    },

    defaultSoundOptions: {
        volume: 1.0,
        loop: false,
        speed: 1.0,
        time: 0,
        muted: false,
    },
};