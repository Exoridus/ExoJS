const KEYS = Exo.KEYS,
    GAMEPAD = Exo.GAMEPAD;

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
                KEYS.Up,
                GAMEPAD.DPadUp,
                GAMEPAD.LeftStickUp,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputUp();
                    }
                },
            }),
            new Exo.Input([
                KEYS.Down,
                GAMEPAD.LeftStickDown,
                GAMEPAD.DPadDown,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputDown();
                    }
                },
            }),
            new Exo.Input([
                KEYS.Left,
                GAMEPAD.LeftStickLeft,
                GAMEPAD.DPadLeft,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputLeft();
                    }
                },
            }),
            new Exo.Input([
                KEYS.Right,
                GAMEPAD.LeftStickRight,
                GAMEPAD.DPadRight,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputRight();
                    }
                },
            }),
            new Exo.Input([
                KEYS.Enter,
                GAMEPAD.FaceButtonBottom,
            ], {
                context: this,
                start() {
                    if (this._currentMenu) {
                        this._currentMenu.onInputSelect();
                    }
                },
            }),
            new Exo.Input([
                KEYS.Backspace,
                GAMEPAD.FaceButtonRight,
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
     * @param {String} startMenu
     */
    enable(startMenu) {
        if (this._active) {
            return;
        }

        this._active = true;
        this._app.trigger('input:add', this._inputs);

        this.openMenu(startMenu);
    }

    /**
     * @public
     */
    disable() {
        if (!this._active) {
            return;
        }

        this._active = false;

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
     */
    render(displayManager) {
        if (this._currentMenu) {
            this._currentMenu.render(displayManager);
        }
    }

    /**
     * @public
     * @param {Boolean} [destroyChildren=false]
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
