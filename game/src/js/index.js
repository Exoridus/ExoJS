import { Application, IDBDatabase } from 'exojs';
import LauncherScene from './scene/LauncherScene';

$(() => {
    const app = new Application({
        basePath: 'assets/',
        width: 1280,
        height: 720,
        canvas: document.querySelector('#game-canvas'),
        database: new IDBDatabase('game', 3),
    });

    app.loader.cache = 'no-cache';

    app.start(new LauncherScene());

    window.app = app;
});
