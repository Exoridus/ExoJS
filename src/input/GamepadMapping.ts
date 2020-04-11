import GamepadControl from './GamepadControl';

export default class GamepadMapping {

    private readonly _buttons: Array<GamepadControl>;
    private readonly _axes: Array<GamepadControl>;

    constructor(buttons: Array<GamepadControl>, axes: Array<GamepadControl>) {
        this._buttons = buttons;
        this._axes = axes;
    }

    get buttons(): Array<GamepadControl> {
        return this._buttons;
    }

    get axes(): Array<GamepadControl> {
        return this._axes;
    }

    setButtons(buttons: Array<GamepadControl>): this {
        this.clearButtons();
        this._buttons.push(...buttons);

        return this;
    }

    clearButtons(): this {
        for (const button of this._buttons) {
            button.destroy();
        }

        this._buttons.length = 0;

        return this;
    }

    setAxes(axes: Array<GamepadControl>): this {
        this.clearAxes();
        this._axes.push(...axes);

        return this;
    }

    clearAxes(): this {
        for (const axis of this._axes) {
            axis.destroy();
        }

        this._axes.length = 0;

        return this;
    }

    clearControls(): this {
        this.clearButtons();
        this.clearAxes();

        return this;
    }

    destroy(): void {
        this.clearControls();
    }
}
