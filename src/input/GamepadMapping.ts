import type { GamepadControl } from './GamepadControl';

export class GamepadMapping {

    private readonly _buttons: Array<GamepadControl>;
    private readonly _axes: Array<GamepadControl>;

    public constructor(buttons: Array<GamepadControl>, axes: Array<GamepadControl>) {
        this._buttons = buttons;
        this._axes = axes;
    }

    public get buttons(): Array<GamepadControl> {
        return this._buttons;
    }

    public get axes(): Array<GamepadControl> {
        return this._axes;
    }

    public setButtons(buttons: Array<GamepadControl>): this {
        this.clearButtons();
        this._buttons.push(...buttons);

        return this;
    }

    public clearButtons(): this {
        for (const button of this._buttons) {
            button.destroy();
        }

        this._buttons.length = 0;

        return this;
    }

    public setAxes(axes: Array<GamepadControl>): this {
        this.clearAxes();
        this._axes.push(...axes);

        return this;
    }

    public clearAxes(): this {
        for (const axis of this._axes) {
            axis.destroy();
        }

        this._axes.length = 0;

        return this;
    }

    public clearControls(): this {
        this.clearButtons();
        this.clearAxes();

        return this;
    }

    public destroy(): void {
        this.clearControls();
    }
}
