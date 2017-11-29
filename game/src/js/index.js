import { Application, Database } from 'exojs';
import LauncherScene from './scene/LauncherScene';

window.addEventListener('load', () => {
    const app = new Application({
        assetsPath: 'assets/',
        width: 1280,
        height: 720,
        canvas: document.querySelector('#game-canvas'),
        database: new Database('game', 3),
    });

    app.loader.request.cache = 'no-cache';
    app.start(new LauncherScene());

    window.app = app;
}, false);
