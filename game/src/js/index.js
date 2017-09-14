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

    indexedDB.deleteDatabase('game');

    game.loader.request.cache = 'no-cache';
    game.loader.database = new Exo.Database('game', 2);

    game.start(new LauncherScene());
}, false);
