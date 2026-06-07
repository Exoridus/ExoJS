// Auto-generated from gamepad.ts — edit the .ts source, not this file.
import { Application, Color, Container, GamepadAxis, GamepadButton, Json, lerp, Scene, Spritesheet, Texture, Vector } from '@codexo/exojs';
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
    activePad = null;
    buttons;
    buttonColor = new Color(255, 255, 255, 0.25);
    mappingButtons = new Map();
    mappingFunctions = new Map();
    resetFunctions = [];
    padBindings = [];
    status;
    container;
    async load(loader) {
        await loader.load(Texture, { buttons: 'image/buttons.png' });
        await loader.load(Json, { buttons: 'json/buttons.json' });
    }
    init(loader) {
        this.buttons = new Spritesheet(loader.get(Texture, 'buttons'), loader.get(Json, 'buttons'));
        this.status = this.createStatus();
        this.container = this.createGamepad();
        for (const sprite of this.mappingButtons.values()) {
            sprite.setTint(this.buttonColor);
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
    draw(context) {
        context.backend.clear();
        context.render(this.status);
        context.render(this.container);
    }
    handleGamepadConnected(pad) {
        if (!this.activePad) {
            this.setActivePad(pad);
        }
    }
    handleGamepadDisconnected(pad) {
        if (this.activePad !== pad) {
            return;
        }
        const next = this.app.input.gamepads.find((other) => other !== pad && other.connected) || null;
        this.setActivePad(next);
    }
    setActivePad(pad) {
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
            this.padBindings.push(pad.onActive(channel, v => {
                sprite.tint.a = lerp(0.25, 1, v);
            }), pad.onStop(channel, () => {
                sprite.tint.a = this.buttonColor.a;
            }));
        }
        for (const [channel, fn] of this.mappingFunctions.entries()) {
            this.padBindings.push(pad.onActive(channel, v => {
                fn(v);
            }), pad.onStop(channel, () => {
                fn(0);
            }));
        }
    }
    resetVisualState() {
        for (const sprite of this.mappingButtons.values()) {
            sprite.tint.a = this.buttonColor.a;
        }
        for (const reset of this.resetFunctions) {
            reset();
        }
    }
    createStatus() {
        const { width, height } = this.app.canvas;
        const status = this.buttons.getFrameSprite('status');
        status.setAnchor(0.5);
        status.setPosition(width / 2, height / 5);
        status.setTint(this.buttonColor);
        return status;
    }
    createGamepad() {
        const container = new Container();
        container.addChild(this.createDPadField());
        container.addChild(this.createFaceButtons());
        container.addChild(this.createShoulderButtons());
        container.addChild(this.createMenuButtons());
        container.addChild(this.createJoysticks());
        return container;
    }
    createDPadField() {
        const { width, height } = this.app.canvas;
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
    createFaceButtons() {
        const { width, height } = this.app.canvas;
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
    createShoulderButtons() {
        const { width, height } = this.app.canvas;
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
    createMenuButtons() {
        const { width, height } = this.app.canvas;
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
    createJoysticks() {
        const { width, height } = this.app.canvas;
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
        mappingFunctions.set(GamepadAxis.LeftStickX, (value) => (leftStick.x = startLeft.x + value * range));
        mappingFunctions.set(GamepadAxis.LeftStickY, (value) => (leftStick.y = startLeft.y + value * range));
        mappingFunctions.set(GamepadAxis.RightStickX, (value) => (rightStick.x = startRight.x + value * range));
        mappingFunctions.set(GamepadAxis.RightStickY, (value) => (rightStick.y = startRight.y + value * range));
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
