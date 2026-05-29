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
        shipA: 'demo/textures/ship-a.png',
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
        musicA: 'demo/audio/demo-loop-a.ogg',
        musicB: 'demo/audio/demo-loop-b.ogg',
        musicLoop: 'demo/audio/demo-loop-main.ogg',
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
        keyboardMouse: {
            image: 'demo/input-prompts/keyboard-mouse.png',
            data: 'demo/input-prompts/keyboard-mouse.json',
        },
    },
    technical: {
        alpha: {
            alphaEdgeStraight: 'technical/alpha/alpha-edge-straight.png',
            alphaGradientRings: 'technical/alpha/alpha-gradient-rings.png',
        },
        filtering: {
            checker256: 'technical/filtering/checker-256.png',
            pixelGrid128: 'technical/filtering/pixel-grid-128.png',
            uvGrid256: 'technical/filtering/uv-grid-256.png',
        },
        color: {
            srgbRamp: 'technical/color/srgb-ramp.png',
            hueRamp: 'technical/color/hue-ramp.png',
            primaryRamp: 'technical/color/primary-ramp.png',
        },
    },
} as const;
