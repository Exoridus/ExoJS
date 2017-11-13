import { Application, Database } from 'exojs';
import LauncherScene from './scene/LauncherScene';

window.addEventListener('load', () => {
    const app = new Application({
        basePath: 'assets/',
        width: 1280,
        height: 720,
        soundVolume: 0.5,
        musicVolume: 0.5,
        canvas: document.querySelector('#game-canvas'),
    });

    app.loader.request.cache = 'no-cache';
    app.loader.database = new Database('game', 3);

    app.start(new LauncherScene());

    window.app = app;
}, false);
