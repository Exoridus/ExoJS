export const rawAssets = {
    textures: {
        bunny: 'demo/textures/bunny.png',
        particle: 'demo/textures/particle.png',
        rainbow: 'demo/textures/rainbow.png',
        uv: 'demo/textures/uv.png',
    },
    sprites: {
        buttons: {
            image: 'demo/sprites/buttons.png',
            data: 'demo/sprites/buttons.json',
        },
        explosion: {
            image: 'demo/sprites/explosion.png',
            data: 'demo/sprites/explosion.json',
        },
    },
    audio: {
        example: 'demo/audio/example.ogg',
    },
    fonts: {
        andyBold: 'demo/fonts/AndyBold.woff2',
    },
    svg: {
        tiger: 'demo/svg/tiger.svg',
    },
    video: {
        example: 'demo/video/example.webm',
    },
    inputPrompts: {
        generic: {
            image: 'demo/input-prompts/generic.png',
            data: 'demo/input-prompts/generic.json',
        },
        xboxSeries: {
            image: 'demo/input-prompts/xbox-series.png',
            data: 'demo/input-prompts/xbox-series.json',
        },
        playstationSeries: {
            image: 'demo/input-prompts/playstation-series.png',
            data: 'demo/input-prompts/playstation-series.json',
        },
        nintendoSwitch: {
            image: 'demo/input-prompts/nintendo-switch.png',
            data: 'demo/input-prompts/nintendo-switch.json',
        },
    },
    technical: {},
} as const;
