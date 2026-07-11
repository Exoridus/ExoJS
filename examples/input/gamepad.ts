import { Application, Asset, Color, Container, type Gamepad, GamepadAxis, GamepadButton, type InputChannel, lerp, type RenderingContext, Scene, Sprite, Spritesheet, type SpritesheetData, Vector } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

class GamepadScene extends Scene {
    private activePad: Gamepad | null = null;
    private buttons!: Spritesheet;
    private buttonColor = new Color(255, 255, 255, 0.25);
    private mappingButtons = new Map<InputChannel, Sprite>();
    private mappingFunctions = new Map<InputChannel, (value: number) => void>();
    private resetFunctions: Array<() => void> = [];
    private padBindings: Array<{ unbind(): void }> = [];
    private status!: Sprite;
    private container!: Container;

    override async init(): Promise<void> {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const buttonsData = (await this.loader.load(Asset.kind('json', 'json/buttons.json'))) as SpritesheetData;

        this.buttons = new Spritesheet(this.loader.get('image/buttons.png'), buttonsData);
        const { width, height } = app.canvas;
        this.status = this.createStatus(width, height);
        this.container = this.createGamepad(width, height);

        for (const sprite of this.mappingButtons.values()) {
            sprite.setTint(this.buttonColor);
        }

        app.input.onGamepadConnected.add(pad => this.handleGamepadConnected(pad));
        app.input.onGamepadDisconnected.add(pad => this.handleGamepadDisconnected(pad));

        for (const pad of app.input.gamepads) {
            if (pad.connected) {
                this.setActivePad(pad);
                break;
            }
        }
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.status);
        context.render(this.container);
    }

    private handleGamepadConnected(pad: Gamepad): void {
        if (!this.activePad) {
            this.setActivePad(pad);
        }
    }

    private handleGamepadDisconnected(pad: Gamepad): void {
        if (this.activePad !== pad) {
            return;
        }

        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const next = app.input.gamepads.find(other => other !== pad && other.connected) || null;
        this.setActivePad(next);
    }

    private setActivePad(pad: Gamepad | null): void {
        for (const binding of this.padBindings) {
            binding.unbind();
        }
        this.padBindings.length = 0;

        this.activePad = pad;

        if (!pad) {
            this.status.setTint(this.buttonColor);
            this.resetVisualState();
            return;
        }

        this.status.setTint(Color.white);

        for (const [channel, sprite] of this.mappingButtons.entries()) {
            this.padBindings.push(
                pad.onActive(channel, v => {
                    sprite.tint.a = lerp(0.25, 1, v);
                }),
                pad.onStop(channel, () => {
                    sprite.tint.a = this.buttonColor.a;
                }),
            );
        }

        for (const [channel, fn] of this.mappingFunctions.entries()) {
            this.padBindings.push(
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
        for (const sprite of this.mappingButtons.values()) {
            sprite.tint.a = this.buttonColor.a;
        }

        for (const reset of this.resetFunctions) {
            reset();
        }
    }

    private createStatus(width: number, height: number): Sprite {
        const status = this.buttons.getFrameSprite('status');

        status.setAnchor(0.5);
        status.setPosition(width / 2, height / 5);
        status.setTint(this.buttonColor);

        return status;
    }

    private createGamepad(width: number, height: number): Container {
        const container = new Container();

        container.addChild(this.createDPadField(width, height));
        container.addChild(this.createFaceButtons(width, height));
        container.addChild(this.createShoulderButtons(width, height));
        container.addChild(this.createMenuButtons(width, height));
        container.addChild(this.createJoysticks(width, height));

        return container;
    }

    private createDPadField(width: number, height: number): Container {
        const mappedButtons = this.mappingButtons;
        const container = new Container();
        const dPad = this.buttons.getFrameSprite('dpad');
        const dPadUp = this.buttons.getFrameSprite('DPadUp');
        const dPadDown = this.buttons.getFrameSprite('DPadDown');
        const dPadLeft = this.buttons.getFrameSprite('DPadLeft');
        const dPadRight = this.buttons.getFrameSprite('DPadRight');

        mappedButtons.set(GamepadButton.DPadUp, dPadUp);
        mappedButtons.set(GamepadButton.DPadDown, dPadDown);
        mappedButtons.set(GamepadButton.DPadLeft, dPadLeft);
        mappedButtons.set(GamepadButton.DPadRight, dPadRight);

        dPad.setTint(this.buttonColor);

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

    private createFaceButtons(width: number, height: number): Container {
        const mappedButtons = this.mappingButtons;
        const container = new Container();
        const buttonTop = this.buttons.getFrameSprite('FaceTop');
        const buttonLeft = this.buttons.getFrameSprite('FaceLeft');
        const buttonRight = this.buttons.getFrameSprite('FaceRight');
        const buttonBottom = this.buttons.getFrameSprite('FaceBottom');

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

    private createShoulderButtons(width: number, height: number): Container {
        const mappedButtons = this.mappingButtons;
        const container = new Container();
        const leftButton = this.buttons.getFrameSprite('ShoulderLeftBottom');
        const rightButton = this.buttons.getFrameSprite('ShoulderRightBottom');
        const leftTrigger = this.buttons.getFrameSprite('ShoulderLeftTop');
        const rightTrigger = this.buttons.getFrameSprite('ShoulderRightTop');

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

    private createMenuButtons(width: number, height: number): Container {
        const mappedButtons = this.mappingButtons;
        const container = new Container();
        const selectButton = this.buttons.getFrameSprite('Select');
        const startButton = this.buttons.getFrameSprite('Start');

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

    private createJoysticks(width: number, height: number): Container {
        const mappedButtons = this.mappingButtons;
        const mappingFunctions = this.mappingFunctions;
        const container = new Container();
        const leftStick = this.buttons.getFrameSprite('LeftStick');
        const rightStick = this.buttons.getFrameSprite('RightStick');
        const startLeft = new Vector(0, 0);
        const startRight = new Vector(width * 0.3, 0);
        const range = 35;

        mappedButtons.set(GamepadButton.LeftStick, leftStick);
        mappedButtons.set(GamepadButton.RightStick, rightStick);

        mappingFunctions.set(GamepadAxis.LeftStickX, (value: number) => (leftStick.x = startLeft.x + value * range));
        mappingFunctions.set(GamepadAxis.LeftStickY, (value: number) => (leftStick.y = startLeft.y + value * range));
        mappingFunctions.set(GamepadAxis.RightStickX, (value: number) => (rightStick.x = startRight.x + value * range));
        mappingFunctions.set(GamepadAxis.RightStickY, (value: number) => (rightStick.y = startRight.y + value * range));

        this.resetFunctions.push(() => {
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
