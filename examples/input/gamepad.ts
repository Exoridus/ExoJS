import { Application, Color, Container, GamepadAxis, GamepadButton, Json, lerp, Scene, Sprite, Spritesheet, Texture, Vector } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

class GamepadScene extends Scene {
    private _activePad: any = null;
    private _buttons!: Spritesheet;
    private _buttonColor = new Color(255, 255, 255, 0.25);
    private _mappingButtons = new Map<any, any>();
    private _mappingFunctions = new Map<any, any>();
    private _resetFunctions: Array<() => void> = [];
    private _padBindings: Array<{ unbind(): void }> = [];
    private _status!: Sprite;
    private _container!: Container;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { buttons: 'image/buttons.png' });
        await loader.load(Json, { buttons: 'json/buttons.json' });
    }

    override init(loader): void {
        this._buttons = new Spritesheet(loader.get(Texture, 'buttons'), loader.get(Json, 'buttons'));
        this._status = this.createStatus();
        this._container = this.createGamepad();

        for (const sprite of this._mappingButtons.values()) {
            sprite.setTint(this._buttonColor);
        }

        this.app.input.onGamepadConnected.add(pad => this.handleGamepadConnected(pad));
        this.app.input.onGamepadDisconnected.add(pad => this.handleGamepadDisconnected(pad));

        for (const pad of this.app.input.gamepads) {
            if (pad.connected) {
                this.setActivePad(pad);
                break;
            }
        }
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._status);
        context.render(this._container);
    }

    private handleGamepadConnected(pad): void {
        if (!this._activePad) {
            this.setActivePad(pad);
        }
    }

    private handleGamepadDisconnected(pad): void {
        if (this._activePad !== pad) {
            return;
        }

        const next = this.app.input.gamepads.find((other: any) => other !== pad && other.connected) || null;
        this.setActivePad(next);
    }

    private setActivePad(pad): void {
        for (const binding of this._padBindings) {
            binding.unbind();
        }
        this._padBindings.length = 0;

        this._activePad = pad;

        if (!pad) {
            this._status.setTint(this._buttonColor);
            this.resetVisualState();
            return;
        }

        this._status.setTint(Color.white);

        for (const [channel, sprite] of this._mappingButtons.entries()) {
            this._padBindings.push(
                pad.onActive(channel, v => {
                    sprite.tint.a = lerp(0.25, 1, v);
                }),
                pad.onStop(channel, () => {
                    sprite.tint.a = this._buttonColor.a;
                }),
            );
        }

        for (const [channel, fn] of this._mappingFunctions.entries()) {
            this._padBindings.push(
                pad.onActive(channel, v => {
                    fn(v);
                }),
                pad.onStop(channel, () => {
                    fn(0);
                }),
            );
        }
    }

    private resetVisualState(): void {
        for (const sprite of this._mappingButtons.values()) {
            sprite.tint.a = this._buttonColor.a;
        }

        for (const reset of this._resetFunctions) {
            reset();
        }
    }

    private createStatus(): Sprite {
        const { width, height } = this.app.canvas;
        const status = this._buttons.getFrameSprite('status');

        status.setAnchor(0.5);
        status.setPosition(width / 2, height / 5);
        status.setTint(this._buttonColor);

        return status;
    }

    private createGamepad(): Container {
        const container = new Container();

        container.addChild(this.createDPadField());
        container.addChild(this.createFaceButtons());
        container.addChild(this.createShoulderButtons());
        container.addChild(this.createMenuButtons());
        container.addChild(this.createJoysticks());

        return container;
    }

    private createDPadField(): Container {
        const { width, height } = this.app.canvas;
        const mappedButtons = this._mappingButtons;
        const container = new Container();
        const dPad = this._buttons.getFrameSprite('dpad');
        const dPadUp = this._buttons.getFrameSprite('DPadUp');
        const dPadDown = this._buttons.getFrameSprite('DPadDown');
        const dPadLeft = this._buttons.getFrameSprite('DPadLeft');
        const dPadRight = this._buttons.getFrameSprite('DPadRight');

        mappedButtons.set(GamepadButton.DPadUp, dPadUp);
        mappedButtons.set(GamepadButton.DPadDown, dPadDown);
        mappedButtons.set(GamepadButton.DPadLeft, dPadLeft);
        mappedButtons.set(GamepadButton.DPadRight, dPadRight);

        dPad.setTint(this._buttonColor);

        dPad.setScale(1.75);
        dPadUp.setScale(1.75);
        dPadDown.setScale(1.75);
        dPadLeft.setScale(1.75);
        dPadRight.setScale(1.75);

        container.addChild(dPad);
        container.addChild(dPadUp);
        container.addChild(dPadDown);
        container.addChild(dPadLeft);
        container.addChild(dPadRight);

        container.setAnchor(0.5);
        container.setPosition(width / 5, height / 2);

        return container;
    }

    private createFaceButtons(): Container {
        const { width, height } = this.app.canvas;
        const mappedButtons = this._mappingButtons;
        const container = new Container();
        const buttonTop = this._buttons.getFrameSprite('FaceTop');
        const buttonLeft = this._buttons.getFrameSprite('FaceLeft');
        const buttonRight = this._buttons.getFrameSprite('FaceRight');
        const buttonBottom = this._buttons.getFrameSprite('FaceBottom');

        mappedButtons.set(GamepadButton.North, buttonTop);
        mappedButtons.set(GamepadButton.West, buttonLeft);
        mappedButtons.set(GamepadButton.East, buttonRight);
        mappedButtons.set(GamepadButton.South, buttonBottom);

        buttonTop.setScale(0.75);
        buttonTop.setPosition(50, 0);

        buttonLeft.setScale(0.75);
        buttonLeft.setPosition(0, 50);

        buttonRight.setScale(0.75);
        buttonRight.setPosition(100, 50);

        buttonBottom.setScale(0.75);
        buttonBottom.setPosition(50, 100);

        container.addChild(buttonTop);
        container.addChild(buttonLeft);
        container.addChild(buttonRight);
        container.addChild(buttonBottom);

        container.setAnchor(0.5);
        container.setPosition(width * 0.8, height / 2);

        return container;
    }

    private createShoulderButtons(): Container {
        const { width, height } = this.app.canvas;
        const mappedButtons = this._mappingButtons;
        const container = new Container();
        const leftButton = this._buttons.getFrameSprite('ShoulderLeftBottom');
        const rightButton = this._buttons.getFrameSprite('ShoulderRightBottom');
        const leftTrigger = this._buttons.getFrameSprite('ShoulderLeftTop');
        const rightTrigger = this._buttons.getFrameSprite('ShoulderRightTop');

        mappedButtons.set(GamepadButton.LeftShoulder, leftButton);
        mappedButtons.set(GamepadButton.RightShoulder, rightButton);
        mappedButtons.set(GamepadButton.LeftTrigger, leftTrigger);
        mappedButtons.set(GamepadButton.RightTrigger, rightTrigger);

        leftButton.setPosition(0, 75);

        rightButton.setAnchor(0.5, 0);
        rightButton.setPosition(width * 0.65, 75);

        rightTrigger.setAnchor(0.5, 0);
        rightTrigger.setPosition(width * 0.65, 0);

        container.addChild(leftButton);
        container.addChild(rightButton);
        container.addChild(leftTrigger);
        container.addChild(rightTrigger);

        container.setAnchor(0.5);
        container.setPosition(width / 2, height / 5);

        return container;
    }

    private createMenuButtons(): Container {
        const { width, height } = this.app.canvas;
        const mappedButtons = this._mappingButtons;
        const container = new Container();
        const selectButton = this._buttons.getFrameSprite('Select');
        const startButton = this._buttons.getFrameSprite('Start');

        mappedButtons.set(GamepadButton.Select, selectButton);
        mappedButtons.set(GamepadButton.Start, startButton);

        startButton.setAnchor(1, 0);
        startButton.setPosition(width * 0.3, 0);

        container.addChild(selectButton);
        container.addChild(startButton);

        container.setAnchor(0.5);
        container.setPosition(width / 2, height / 2);

        return container;
    }

    private createJoysticks(): Container {
        const { width, height } = this.app.canvas;
        const mappedButtons = this._mappingButtons;
        const mappingFunctions = this._mappingFunctions;
        const container = new Container();
        const leftStick = this._buttons.getFrameSprite('LeftStick');
        const rightStick = this._buttons.getFrameSprite('RightStick');
        const startLeft = new Vector(0, 0);
        const startRight = new Vector(width * 0.3, 0);
        const range = 35;

        mappedButtons.set(GamepadButton.LeftStick, leftStick);
        mappedButtons.set(GamepadButton.RightStick, rightStick);

        mappingFunctions.set(GamepadAxis.LeftStickX, (value: number) => (leftStick.x = startLeft.x + value * range));
        mappingFunctions.set(GamepadAxis.LeftStickY, (value: number) => (leftStick.y = startLeft.y + value * range));
        mappingFunctions.set(GamepadAxis.RightStickX, (value: number) => (rightStick.x = startRight.x + value * range));
        mappingFunctions.set(GamepadAxis.RightStickY, (value: number) => (rightStick.y = startRight.y + value * range));

        this._resetFunctions.push(() => {
            leftStick.setPosition(startLeft.x, startLeft.y);
            rightStick.setPosition(startRight.x, startRight.y);
        });

        leftStick.setPosition(startLeft.x, startLeft.y);
        rightStick.setPosition(startRight.x, startRight.y);

        container.addChild(leftStick);
        container.addChild(rightStick);

        container.setAnchor(0.5, 0);
        container.setPosition(width / 2, height * 0.65);

        return container;
    }
}

app.start(new GamepadScene());
