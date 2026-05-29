export const rawAssets = {
    textures: {
        bunny: 'demo/textures/bunny.png',
        particle: 'demo/textures/particle.png',
        rainbow: 'demo/textures/rainbow.png',
        uv: 'demo/textures/uv.png',
        particleFlame: 'demo/textures/particle-flame.png',
        particleSmoke: 'demo/textures/particle-smoke.png',
        particleStar: 'demo/textures/particle-star.png',
        particleSpark: 'demo/textures/particle-spark.png',
        particleLight: 'demo/textures/particle-light.png',
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
        uiClick: 'demo/audio/ui-click.ogg',
        uiConfirm: 'demo/audio/ui-confirm.ogg',
        uiBong: 'demo/audio/ui-bong.ogg',
        impactLight: 'demo/audio/impact-light.ogg',
        impactHeavy: 'demo/audio/impact-heavy.ogg',
    },
    fonts: {
        andyBold: 'demo/fonts/AndyBold.woff2',
    },
    svg: {
        tiger: 'demo/svg/tiger.svg',
        play: 'demo/svg/play.svg',
        pause: 'demo/svg/pause.svg',
        reset: 'demo/svg/reset.svg',
        arrowRight: 'demo/svg/arrow-right.svg',
        sparkle: 'demo/svg/sparkle.svg',
        audioWave: 'demo/svg/audio-wave.svg',
        imagePlaceholder: 'demo/svg/image-placeholder.svg',
        runeMark: 'demo/svg/rune-mark.svg',
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
