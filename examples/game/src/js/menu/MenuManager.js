const Keyboard = Exo.Keyboard,
    Gamepad = Exo.Gamepad;

/**
 * @class MenuManager
 */
export default class MenuManager {

    /**
     * @constructor
     * @param {Exo.Game} game
     */
    constructor(game) {

        /**
         * @private
         * @member {Exo.Game}
         */
        this._game = game;

        /**
         * @private
         * @member {Map<String, Menu>}
         */
        this._menus = new Map();

        /**
         * @private
         * @member {Menu|null}
         */
        this._currentMenu = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._enabled = false;

        /**
         * @private
         * @member {Exo.Input}
         */
        this._upInput = new Exo.Input([
            Keyboard.Up,
            Gamepad.DPadUp,
            Gamepad.LeftStickUp,
        ]);

        this._upInput.on('start', this.onInputUp, this);

        /**
         * @private
         * @member {Exo.Input}
         */
        this._downInput = new Exo.Input([
            Keyboard.Down,
            Gamepad.LeftStickDown,
            Gamepad.DPadDown,
        ]);

        this._downInput.on('start', this.onInputDown, this);

        /**
         * @private
         * @member {Exo.Input}
         */
        this._leftInput = new Exo.Input([
            Keyboard.Left,
            Gamepad.LeftStickLeft,
            Gamepad.DPadLeft,
        ]);

        this._leftInput.on('start', this.onInputLeft, this);

        /**
         * @private
         * @member {Exo.Input}
         */
        this._rightInput = new Exo.Input([
            Keyboard.Right,
            Gamepad.LeftStickRight,
            Gamepad.DPadRight,
        ]);

        this._rightInput.on('start', this.onInputRight, this);

        /**
         * @private
         * @member {Exo.Input}
         */
        this._selectInput = new Exo.Input([
            Keyboard.Enter,
            Gamepad.FaceButtonBottom,
        ]);

        this._selectInput.on('start', this.onInputSelect, this);

        /**
         * @private
         * @member {Exo.Input}
         */
        this._backInput = new Exo.Input([
            Keyboard.Backspace,
            Gamepad.FaceButtonRight,
        ]);

        this._backInput.on('start', this.onInputBack, this);
    }

    /**
     * @private
     */
    onInputUp() {
        if (this._currentMenu) {
            this._currentMenu.onInputUp();
        }
    }

    /**
     * @private
     */
    onInputDown() {
        if (this._currentMenu) {
            this._currentMenu.onInputDown();
        }
    }

    /**
     * @private
     */
    onInputLeft() {
        if (this._currentMenu) {
            this._currentMenu.onInputLeft();
        }
    }

    /**
     * @private
     */
    onInputRight() {
        if (this._currentMenu) {
            this._currentMenu.onInputRight();
        }
    }

    /**
     * @private
     */
    onInputSelect() {
        if (this._currentMenu) {
            this._currentMenu.onInputSelect();
        }
    }

    /**
     * @private
     */
    onInputBack() {
        if (this._currentMenu) {
            this._currentMenu.onInputBack();
        }
    }

    /**
     * @public
     * @param {String} startMenu
     */
    enable(startMenu) {
        if (this._enabled) {
            return;
        }

        this._enabled = true;

        this._game.trigger('input:add', [
            this._upInput,
            this._downInput,
            this._leftInput,
            this._rightInput,
            this._selectInput,
            this._backInput,
        ]);

        this.openMenu(startMenu);
    }

    /**
     * @public
     */
    disable() {
        if (!this._enabled) {
            return;
        }

        this._enabled = false;

        this._game.trigger('input:remove', [
            this._upInput,
            this._downInput,
            this._leftInput,
            this._rightInput,
            this._selectInput,
            this._backInput,
        ]);

        if (this._currentMenu) {
            this._currentMenu.reset();
            this._currentMenu = null;
        }
    }

    /**
     * @public
     * @param {String} name
     * @param {Menu} menu
     * @param {String} [previousMenu=null]
     */
    addMenu(name, menu, previousMenu) {
        if (previousMenu) {
            menu.previousMenu = previousMenu;
        }

        this._menus.set(name, menu);

        menu.on('openMenu', this.openMenu, this);
        menu.on('openPreviousMenu', this.openPreviousMenu, this);
    }

    /**
     * @public
     * @param {String} name
     */
    openMenu(name) {
        if (this._currentMenu) {
            this._currentMenu.reset();
        }

        this._currentMenu = this._menus.get(name) || null;

        if (this._currentMenu) {
            this._currentMenu.activate();
        }
    }

    /**
     * @public
     */
    openPreviousMenu() {
        const currentMenu = this._currentMenu;

        if (currentMenu && currentMenu.previousMenu) {
            this.openMenu(currentMenu.previousMenu);
        }
    }

    /**
     * @public
     * @param {Exo.Time} delta
     */
    update(delta) {
        if (this._currentMenu) {
            this._currentMenu.update(delta);
        }
    }

    /**
     * @public
     * @param {Exo.DisplayManager} diplayManager
     * @param {Exo.Transform} worldTransform
     */
    draw(diplayManager, worldTransform) {
        if (this._currentMenu) {
            this._currentMenu.draw(diplayManager, worldTransform);
        }
    }

    /**
     * @public
     * @param {Boolean} [destroyChildren=false]
     */
    destroy() {
        if (this._enabled) {
            this.disable();
        }

        this._menus.forEach((menu) => {
            menu.destroy();
        });
        this._menus.clear();
        this._menus = null;

        this._upInput.destroy();
        this._upInput = null;

        this._downInput.destroy();
        this._downInput = null;

        this._leftInput.destroy();
        this._leftInput = null;

        this._rightInput.destroy();
        this._rightInput = null;

        this._selectInput.destroy();
        this._selectInput = null;

        this._backInput.destroy();
        this._backInput = null;

        this._currentMenu = null;
        this._game = null;
    }
}
