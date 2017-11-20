import { KEYBOARD, GAMEPAD, utils, Scene, View, Vector, Rectangle, Input } from 'exojs';
import WorldMap from '../map/WorldMap';
import Player from '../entity/Player';
import Tileset from '../map/Tileset';

/**
 * @class GameScene
 * @extends {Scene}
 */
export default class GameScene extends Scene {

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
            spawnPoint: new Vector(this._worldMap.width / 2, this._worldMap.height / 2),
            worldBounds: this._worldMap.bounds,
        });

        /**
         * @private
         * @member {View}
         */
        this._camera = new View(0, 0, canvas.width, canvas.height);

        /**
         * @private
         * @member {Boolean}
         */
        this._paused = false;

        /**
         * @private
         * @member {Music}
         */
        this._backgroundMusic = resources.get('music', 'overworld');
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

            this.app.displayManager.renderBatch([
                this._worldMap,
                this._player
            ]);
        }

        return this;
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
            centerX = this._camera.width / 2,
            centerY = this._camera.height / 2;

        displayManager.renderTarget.setView(this._camera.setCenter(
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
        this._toggleMenuInput = new Input([
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
