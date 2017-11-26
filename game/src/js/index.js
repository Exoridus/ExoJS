import { Application, Database } from 'exojs';
import LauncherScene from './scene/LauncherScene';

window.addEventListener('load', () => {
    Exo.settings.VOLUME_MASTER = 0.5;

    const app = new Application({
        basePath: 'assets/',
        width: 1280,
        height: 720,
        canvas: document.querySelector('#game-canvas'),
    });

    app.loader.request.cache = 'no-cache';
    app.loader.database = new Database('game', 3);
    app.start(new LauncherScene());

    window.app = app;
}, false);
