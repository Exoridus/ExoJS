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
        this._active = false;

        /**
         * @private
         * @member {Input[]}
         */
        this._inputs = [
            new Exo.Input([
                Exo.KEYBOARD.Up,
                Exo.GAMEPAD.DPadUp,
                Exo.GAMEPAD.LeftStickUp,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputUp();
                    }
                },
            }),
            new Exo.Input([
                Exo.KEYBOARD.Down,
                Exo.GAMEPAD.LeftStickDown,
                Exo.GAMEPAD.DPadDown,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputDown();
                    }
                },
            }),
            new Exo.Input([
                Exo.KEYBOARD.Left,
                Exo.GAMEPAD.LeftStickLeft,
                Exo.GAMEPAD.DPadLeft,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputLeft();
                    }
                },
            }),
            new Exo.Input([
                Exo.KEYBOARD.Right,
                Exo.GAMEPAD.LeftStickRight,
                Exo.GAMEPAD.DPadRight,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputRight();
                    }
                },
            }),
            new Exo.Input([
                Exo.KEYBOARD.Enter,
                Exo.GAMEPAD.FaceBottom,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputSelect();
                    }
                },
            }),
            new Exo.Input([
                Exo.KEYBOARD.Backspace,
                Exo.GAMEPAD.FaceRight,
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
     * @member {Boolean}
     */
    get active() {
        return this._active;
    }

    set active(active) {
        this._active = active;
    }

    /**
     * @public
     * @chainable
     * @param {String} startMenu
     * @returns {MenuManager}
     */
    enable(startMenu) {
        if (!this._active) {
            this._active = true;
            this._app.inputManager.add(this._inputs);

            this.openMenu(startMenu);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {MenuManager}
     */
    disable() {
        if (this._active) {
            this._active = false;
            this._app.inputManager.remove(this._inputs);

            if (this._currentMenu) {
                this._currentMenu.reset();
                this._currentMenu = null;
            }
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} name
     * @param {Menu} menu
     * @param {String} [previousMenu=null]
     * @returns {MenuManager}
     */
    addMenu(name, menu, previousMenu) {
        if (previousMenu) {
            menu.previousMenu = previousMenu;
        }

        this._menus.set(name, menu);

        menu.on('openMenu', this.openMenu, this);
        menu.on('openPreviousMenu', this.openPreviousMenu, this);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {String} name
     * @returns {MenuManager}
     */
    openMenu(name) {
        if (this._currentMenu) {
            this._currentMenu.reset();
        }

        this._currentMenu = this._menus.get(name) || null;

        if (this._currentMenu) {
            this._currentMenu.activate();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {MenuManager}
     */
    openPreviousMenu() {
        const currentMenu = this._currentMenu;

        if (currentMenu && currentMenu.previousMenu) {
            this.openMenu(currentMenu.previousMenu);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Time} delta
     * @returns {MenuManager}
     */
    update(delta) {
        if (this._currentMenu) {
            this._currentMenu.update(delta);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {DisplayManager} displayManager
     * @returns {MenuManager}
     */
    render(displayManager) {
        if (this._currentMenu) {
            displayManager.render(this._currentMenu);
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        if (this._active) {
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
