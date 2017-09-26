/* global WebFont */
import LauncherScene from './scene/LauncherScene';

window.addEventListener('load', () => {
    const app = new Exo.Application({
        basePath: 'assets/',
        width: 1280,
        height: 720,
        soundVolume: 0.5,
        musicVolume: 0.5,
        canvas: '#game-canvas',
    });

    app.loader.request.cache = 'no-cache';
    app.loader.database = new Exo.Database('game', 3);

    app.start(new LauncherScene());
}, false);
