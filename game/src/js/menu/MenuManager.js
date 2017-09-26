const Keyboard = Exo.Keyboard,
    Gamepad = Exo.Gamepad;

/**
 * @class MenuManager
 */
export default class MenuManager {

    /**
     * @constructor
     * @param {Application} app
     */
    constructor(app) {

        /**
         * @private
         * @member {Application}
         */
        this._app = app;

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
        this._isEnabled = false;

        /**
         * @private
         * @member {Input[]}
         */
        this._inputs = [
            new Exo.Input([
                Keyboard.Up,
                Gamepad.DPadUp,
                Gamepad.LeftStickUp,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputUp();
                    }
                },
            }),
            new Exo.Input([
                Keyboard.Down,
                Gamepad.LeftStickDown,
                Gamepad.DPadDown,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputDown();
                    }
                },
            }),
            new Exo.Input([
                Keyboard.Left,
                Gamepad.LeftStickLeft,
                Gamepad.DPadLeft,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputLeft();
                    }
                },
            }),
            new Exo.Input([
                Keyboard.Right,
                Gamepad.LeftStickRight,
                Gamepad.DPadRight,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputRight();
                    }
                },
            }),
            new Exo.Input([
                Keyboard.Enter,
                Gamepad.FaceButtonBottom,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputSelect();
                    }
                },
            }),
            new Exo.Input([
                Keyboard.Backspace,
                Gamepad.FaceButtonRight,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputBack();
                    }
                },
            }),
        ];
    }

    /**
     * @public
     * @param {String} startMenu
     */
    enable(startMenu) {
        if (this._isEnabled) {
            return;
        }

        this._isEnabled = true;
        this._app.trigger('input:add', this._inputs);

        this.openMenu(startMenu);
    }

    /**
     * @public
     */
    disable() {
        if (!this._isEnabled) {
            return;
        }

        this._isEnabled = false;

        this._app.trigger('input:remove', this._inputs);

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
     * @param {Time} delta
     */
    update(delta) {
        if (this._currentMenu) {
            this._currentMenu.update(delta);
        }
    }

    /**
     * @public
     * @param {DisplayManager} displayManager
     * @param {Matrix} worldTransform
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
        if (this._isEnabled) {
            this.disable();
        }

        this._menus.forEach((menu) => {
            menu.destroy();
        });
        this._menus.clear();
        this._menus = null;

        this._currentMenu = null;
        this._app = null;
    }
}
