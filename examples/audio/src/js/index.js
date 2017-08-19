import GameScene from './GameScene';

window.addEventListener('load', () => {
    const game = new Exo.Game({
        basePath: 'assets/',
        canvas: document.querySelector('#background'),
        width: window.innerWidth,
        height: window.innerHeight,
    });

    game.start(new GameScene());
}, false);
