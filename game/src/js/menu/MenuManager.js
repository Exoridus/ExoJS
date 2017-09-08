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
         * @member {Map.<String, Menu>}
         */
        this._menus = new Map();

        /**
         * @private
         * @member {?Menu}
         */
        this._currentMenu = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._enabled = false;

        /**
         * @private
         * @member {Exo.Input[]}
         */
        this._inputs = [
            new Exo.Input([
                Keyboard.Up,
                Gamepad.DPadUp,
                Gamepad.LeftStickUp,
            ], {
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputUp();
                    }
                },
            }, this),
            new Exo.Input([
                Keyboard.Down,
                Gamepad.LeftStickDown,
                Gamepad.DPadDown,
            ], {
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputDown();
                    }
                },
            }, this),
            new Exo.Input([
                Keyboard.Left,
                Gamepad.LeftStickLeft,
                Gamepad.DPadLeft,
            ], {
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputLeft();
                    }
                },
            }, this),
            new Exo.Input([
                Keyboard.Right,
                Gamepad.LeftStickRight,
                Gamepad.DPadRight,
            ], {
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputRight();
                    }
                },
            }, this),
            new Exo.Input([
                Keyboard.Enter,
                Gamepad.FaceButtonBottom,
            ], {
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputSelect();
                    }
                },
            }, this),
            new Exo.Input([
                Keyboard.Backspace,
                Gamepad.FaceButtonRight,
            ], {
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputBack();
                    }
                },
            }, this),
        ];
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
        this._game.trigger('input:add', this._inputs);

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

        this._game.trigger('input:remove', this._inputs);

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
     * @param {Exo.DisplayManager} displayManager
     * @param {Exo.Matrix} worldTransform
     */
    render(displayManager, worldTransform) {
        if (this._currentMenu) {
            this._currentMenu.render(displayManager, worldTransform);
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

        this._currentMenu = null;
        this._game = null;
    }
}
