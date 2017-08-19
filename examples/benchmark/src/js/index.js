import GameScene from './GameScene';

window.addEventListener('load', () => {
    const game = new Exo.Game({
        basePath: 'assets/',
        canvasParent: document.body,
        width: 800,
        height: 600,
        clearColor: Exo.Color.White,
    });

    game.start(new GameScene());
}, false);
