import WorldMap from '../map/WorldMap';
import Player from '../entity/Player';
import Tileset from '../map/Tileset';

const Keyboard = Exo.Keyboard,
    Gamepad = Exo.Gamepad,
    clamp = Exo.Utils.clamp;

/**
 * @class GameScene
 * @extends {Exo.Scene}
 */
export default class GameScene extends Exo.Scene {

    /**
     * @override
     */
    load(loader) {
        loader
            .add('image', 'game/tileset', 'images/game/tileset.png')
            .addList('texture', {
                'game/player': 'images/game/player.png',
            })
            .addList('music', {
                'game/background': 'audio/game/background.ogg',
            })
            .load()
            .then(() => this.game.trigger('scene:start'));
    }

    /**
     * @override
     */
    init() {
        const game = this.game,
            resources = game.loader.resources;

        /**
         * @private
         * @member {WorldMap}
         */
        this._worldMap = new WorldMap(new Tileset(resources.get('image', 'game/tileset'), 32));

        /**
         * @private
         * @member {Player}
         */
        this._player = new Player(resources.get('texture', 'game/player'));
        this._player.setPosition(this._worldMap.pixelWidth / 2, this._worldMap.pixelHeight / 2);

        /**
         * @private
         * @member {Exo.View}
         */
        this._camera = new Exo.View(new Exo.Rectangle(0, 0, game.canvas.width, game.canvas.height));

        /**
         * @private
         * @member {Exo.Music}
         */
        this._backgroundMusic = resources.get('music', 'game/background');

        /**
         * @private
         * @member {Boolean}
         */
        this._paused = false;

        game.trigger('audio:play', this._backgroundMusic, {
            loop: true,
        });

        this._initInputs();
        this._updateCamera();
    }

    /**
     * @override
     */
    update(delta) {
        this._worldMap.draw(this.game, this._camera);

        this.game
            .trigger('display:begin')
            .trigger('display:render', this._player)
            .trigger('display:end');
    }

    /**
     * @override
     */
    unload() {
        this.game.trigger('input:remove', this._inputs, true);

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
     */
    _toggleMenu() {
        this._paused = !this._paused;

        if (this._paused) {
            // show pause menu
        } else {
            // hide pause menu
        }
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
            clamp(player.y, 0, worldMap.pixelHeight)
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

        camera.setCenter(
            clamp(player.x, offsetWidth, worldMap.pixelWidth - offsetWidth),
            clamp(player.y, offsetHeight, worldMap.pixelHeight - offsetHeight)
        );

        this.game.trigger('view:update', camera);
    }

    /**
     * @private
     */
    _initInputs() {
        const toggleMenuInput = new Exo.Input([
                Keyboard.Escape,
                Gamepad.Start,
            ]),
            moveUpInput = new Exo.Input([
                Keyboard.Up,
                Keyboard.W,
                Gamepad.LeftStickUp,
                Gamepad.DPadUp,
            ]),
            moveDownInput = new Exo.Input([
                Keyboard.Down,
                Keyboard.S,
                Gamepad.LeftStickDown,
                Gamepad.DPadDown,
            ]),
            moveLeftInput = new Exo.Input([
                Keyboard.Left,
                Keyboard.A,
                Gamepad.LeftStickLeft,
                Gamepad.DPadLeft,
            ]),
            moveRightInput = new Exo.Input([
                Keyboard.Right,
                Keyboard.D,
                Gamepad.LeftStickRight,
                Gamepad.DPadRight,
            ]),
            runningInput = new Exo.Input([
                Keyboard.Shift,
                Gamepad.RightTriggerTop,
            ]);

        toggleMenuInput.on('trigger', this._toggleMenu, this);

        moveUpInput.on('active', (value) => {
            this._movePlayer(0, value * -1);
        });

        moveDownInput.on('active', (value) => {
            this._movePlayer(0, value);
        });

        moveLeftInput.on('active', (value) => {
            this._movePlayer(value * -1, 0);
        });

        moveRightInput.on('active', (value) => {
            this._movePlayer(value, 0);
        });

        runningInput
            .on('start', () => {
                this._player.running = true;
            })
            .on('stop', () => {
                this._player.running = false;
            });

        this._inputs = [
            toggleMenuInput,
            moveUpInput,
            moveDownInput,
            moveLeftInput,
            moveRightInput,
            runningInput,
        ];

        this.game.trigger('input:add', this._inputs);
    }
}
