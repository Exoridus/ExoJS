import GameScene from './GameScene';

window.addEventListener('load', () => {
    const game = new Exo.Game({
        basePath: 'assets/',
        canvasParent: document.body,
    });

    game.start(new GameScene());
}, false);
