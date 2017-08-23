/* global WebFont */
import LauncherScene from './scene/LauncherScene';

window.addEventListener('load', () => {
    const game = new Exo.Game({
        basePath: 'assets/',
        width: 1280,
        height: 720,
        soundVolume: 0.5,
        musicVolume: 0.5,
        canvas: '#game-canvas',
    });

    game.loader.requestQuery = `?no-cache=${Date.now()}`;
    // game.loader.database = new Exo.Database('game', 1);

    WebFont.load({
        classes: false,
        custom: {
            families: ['AndyBold'],
        },
        active() {
            game.start(new LauncherScene());
        },
    });
}, false);
