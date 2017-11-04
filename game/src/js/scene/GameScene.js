import WorldMap from '../map/WorldMap';
import Player from '../entity/Player';
import Tileset from '../map/Tileset';

const KEYBOARD = Exo.KEYBOARD,
    GAMEPAD = Exo.GAMEPAD,
    clamp = Exo.utils.clamp;

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
        this._player = new Player(resources.get('texture', 'game/player'));
        // this._player.setPosition(this._worldMap.pixelWidth / 2, this._worldMap.pixelHeight / 2);
        // this._player.setPosition(0, 0);

        /**
         * @private
         * @member {View}
         */
        this._camera = new Exo.View(new Exo.Rectangle(0, 0, canvas.width, canvas.height));

        /**
         * @private
         * @member {Music}
         */
        this._backgroundMusic = resources.get('music', 'game/background');

        /**
         * @private
         * @member {Boolean}
         */
        this._isPaused = false;

        app.mediaManager.play(this._backgroundMusic, { loop: true });

        this._addInputs();
        // this._updateCamera();
    }

    /**
     * @override
     */
    update(delta) {
        this.app.displayManager
            .begin()
            // .render(this._worldMap)
            .render(this._player)
            .end();
    }

    /**
     * @override
     */
    unload() {
        this._removeInputs();

        this._worldMap.destroy();
        this._worldMap = null;

        this._player.destroy();
        this._player = null;

        this._camera.destroy();
        this._camera = null;

        this._backgroundMusic.destroy();
        this._backgroundMusic = null;

        this._inputs.length = 0;
        this._inputs = null;
    }

    /**
     * @private
     * @param {Number} x
     * @param {Number} y
     */
    _movePlayer(x, y) {
        const player = this._player,
            worldMap = this._worldMap;

        player.move(x, y);
        player.setPosition(
            clamp(player.x, 0, worldMap.pixelWidth),
            clamp(player.y, 0, worldMap.pixelHeight),
        );

        // this._updateCamera();
    }

    /**
     * @private
     */
    _addInputs() {

        this._toggleMenuInput = new Exo.Input([
            KEYBOARD.Escape,
            GAMEPAD.Start,
        ], {
            context: this,
            trigger() {
                this._isPaused = !this._isPaused;

                if (this._isPaused) {
                    // show pause menu
                } else {
                    // hide pause menu
                }
            },
        });

        this._moveUpInput = new Exo.Input([
            KEYBOARD.Up,
            KEYBOARD.W,
            GAMEPAD.LeftStickUp,
            GAMEPAD.DPadUp,
        ], {
            context: this,
            active(value) {
                this._movePlayer(0, value * -1);
            },
        });

        this._moveDownInput = new Exo.Input([
            KEYBOARD.Down,
            KEYBOARD.S,
            GAMEPAD.LeftStickDown,
            GAMEPAD.DPadDown,
        ], {
            context: this,
            active(value) {
                this._movePlayer(0, value);
            },
        });

        this._moveLeftInput = new Exo.Input([
            KEYBOARD.Left,
            KEYBOARD.A,
            GAMEPAD.LeftStickLeft,
            GAMEPAD.DPadLeft,
        ], {
            context: this,
            active(value) {
                this._movePlayer(value * -1, 0);
            },
        });

        this._moveRightInput = new Exo.Input([
            KEYBOARD.Right,
            KEYBOARD.D,
            GAMEPAD.LeftStickRight,
            GAMEPAD.DPadRight,
        ], {
            context: this,
            active(value) {
                this._movePlayer(value, 0);
            },
        });

        this._toggleRunInput = new Exo.Input([
            KEYBOARD.Shift,
            GAMEPAD.ShoulderRightTop,
        ], {
            context: this,
            start() {
                this._player.running = true;
            },
            stop() {
                this._player.running = false;
            },
        });

        this.app.inputManager.add([
            this._toggleMenuInput,
            this._moveUpInput,
            this._moveDownInput,
            this._moveLeftInput,
            this._moveRightInput,
            this._toggleRunInput,
        ]);
    }

    /**
     * @private
     */
    _removeInputs() {
        this.app.inputManager.remove([
            this._toggleMenuInput,
            this._moveUpInput,
            this._moveDownInput,
            this._moveLeftInput,
            this._moveRightInput,
            this._toggleRunInput,
        ]);

        this._toggleMenuInput.destroy();
        this._toggleMenuInput = null;

        this._moveUpInput.destroy();
        this._moveUpInput = null;

        this._moveDownInput.destroy();
        this._moveDownInput = null;

        this._moveLeftInput.destroy();
        this._moveLeftInput = null;

        this._moveRightInput.destroy();
        this._moveRightInput = null;

        this._toggleRunInput.destroy();
        this._toggleRunInput = null;
    }

    /**
     * @private
     */
    _updateCamera() {
        const player = this._player,
            worldMap = this._worldMap,
            camera = this._camera,
            offsetWidth = camera.width / 2,
            offsetHeight = camera.height / 2;

        camera.center.set(
            clamp(player.x, offsetWidth, worldMap.pixelWidth - offsetWidth),
            clamp(player.y, offsetHeight, worldMap.pixelHeight - offsetHeight),
        );

        this.app.displayManager.view = camera;
    }
}
