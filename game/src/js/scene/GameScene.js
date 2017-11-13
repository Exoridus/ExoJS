import WorldMap from '../map/WorldMap';
import Player from '../entity/Player';
import Tileset from '../map/Tileset';

const KEYBOARD = Exo.KEYBOARD,
    GAMEPAD = Exo.GAMEPAD,
    utils = Exo.utils;

/**
 * @class GameScene
 * @extends {Scene}
 */
export default class GameScene extends Exo.Scene {

    /**
     * @override
     */
    init(resources) {
        const app = this.app,
            canvas = app.canvas;

        /**
         * @private
         * @member {WorldMap}
         */
        this._worldMap = new WorldMap(new Tileset(resources.get('texture', 'game/tileset'), 32));

        /**
         * @private
         * @member {Player}
         */
        this._player = new Player(app, {
            spawnPoint: new Exo.Vector(this._worldMap.width / 2, this._worldMap.height / 2),
            worldBounds: this._worldMap.bounds,
        });

        /**
         * @private
         * @member {View}
         */
        this._camera = new Exo.View(new Exo.Rectangle(0, 0, canvas.width, canvas.height));
        app.displayManager.setView(this._camera);

        /**
         * @private
         * @member {Boolean}
         */
        this._paused = false;

        /**
         * @private
         * @member {Music}
         */
        this._backgroundMusic = resources.get('music', 'game/background');
        this._backgroundMusic.connect(app.mediaManager);
        this._backgroundMusic.play({ loop: true });

        this._addEvents();
        this._addInputs();
        this._updateCamera();
    }

    /**
     * @override
     */
    update(delta) {
        if (!this._paused) {
            this._player.update(delta);
            this._worldMap.update(delta);
        }

        this.app.displayManager
            .begin()
            .draw(this._worldMap)
            .draw(this._player)
            .end();
    }

    /**
     * @override
     */
    unload() {
        this._removeEvents();
        this._removeInputs();

        this._worldMap.destroy();
        this._worldMap = null;

        this._player.destroy();
        this._player = null;

        this._camera.destroy();
        this._camera = null;

        this._backgroundMusic.destroy();
        this._backgroundMusic = null;

        this._paused = null;
    }

    /**
     * @private
     */
    _updateCamera() {
        const displayManager = this.app.displayManager,
            x = this._player.x,
            y = this._player.y - (this._player.height / 2),
            maxX = this._worldMap.width,
            maxY = this._worldMap.height,
            centerX = this._camera.offsetCenter.x,
            centerY = this._camera.offsetCenter.y;

        displayManager.setView(this._camera.setCenter(
            utils.clamp(x, centerX, maxX - centerX),
            utils.clamp(y, centerY, maxY - centerY)
        ));
    }

    /**
     * @private
     */
    _pauseGame() {
        if (!this._paused) {
            this._paused = true;
            this._backgroundMusic.pause();
            this._openMenu();
        }

        return this;
    }

    /**
     * @private
     */
    _resumeGame() {
        if (this._paused) {
            this._paused = false;
            this._backgroundMusic.play();
            this._closeMenu();
        }

        return this;
    }

    /**
     * @private
     */
    _openMenu() {

    }

    /**
     * @private
     */
    _closeMenu() {

    }

    /**
     * @private
     */
    _addEvents() {
        this._player.on('move', this._updateCamera, this);
    }

    /**
     * @private
     */
    _removeEvents() {
        this._player.off('move', this._updateCamera, this);
    }

    /**
     * @private
     */
    _addInputs() {

        /**
         * @private
         * @member {Input}
         */
        this._toggleMenuInput = new Exo.Input([
            KEYBOARD.Escape,
            GAMEPAD.Start,
        ], {
            context: this,
            trigger() {
                if (this._paused) {
                    this._resumeGame();
                } else {
                    this._pauseGame();
                }
            },
        });

        this.app.inputManager.add(this._toggleMenuInput);
    }

    /**
     * @private
     */
    _removeInputs() {
        this.app.inputManager.remove(this._toggleMenuInput);

        this._toggleMenuInput.destroy();
        this._toggleMenuInput = null;
    }
}
