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
        const app = this.app;

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
        this._player.setPosition(this._worldMap.pixelWidth / 2, this._worldMap.pixelHeight / 2);

        /**
         * @private
         * @member {View}
         */
        this._camera = new Exo.View(new Exo.Rectangle(0, 0, app.canvas.width, app.canvas.height));

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

        /**
         * @private
         * @member {Input[]}
         */
        this._inputs = [
            new Exo.Input([
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
            }),
            new Exo.Input([
                KEYBOARD.Up,
                KEYBOARD.W,
                GAMEPAD.LeftStickUp,
                GAMEPAD.DPadUp,
            ], {
                context: this,
                active(value) {
                    this._movePlayer(0, value * -1);
                },
            }),
            new Exo.Input([
                KEYBOARD.Down,
                KEYBOARD.S,
                GAMEPAD.LeftStickDown,
                GAMEPAD.DPadDown,
            ], {
                context: this,
                active(value) {
                    this._movePlayer(0, value);
                },
            }),
            new Exo.Input([
                KEYBOARD.Left,
                KEYBOARD.A,
                GAMEPAD.LeftStickLeft,
                GAMEPAD.DPadLeft,
            ], {
                context: this,
                active(value) {
                    this._movePlayer(value * -1, 0);
                },
            }),
            new Exo.Input([
                KEYBOARD.Right,
                KEYBOARD.D,
                GAMEPAD.LeftStickRight,
                GAMEPAD.DPadRight,
            ], {
                context: this,
                active(value) {
                    this._movePlayer(value, 0);
                },
            }),
            new Exo.Input([
                KEYBOARD.Shift,
                GAMEPAD.RightTriggerTop,
            ], {
                context: this,
                start() {
                    this._player.running = true;
                },
                stop() {
                    this._player.running = false;
                },
            }),
        ];

        app.trigger('media:play', this._backgroundMusic, { loop: true })
            .trigger('input:add', this._inputs);

        this.addNode(this._player);

        this._updateCamera();
    }

    /**
     * @override
     */
    update(delta) {
        this._worldMap.render(this.app, this._camera);
    }

    /**
     * @override
     */
    unload() {
        this.app.trigger('input:remove', this._inputs, true);

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

        this._updateCamera();
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

        this.app.displayManager.setView(camera);
    }
}
