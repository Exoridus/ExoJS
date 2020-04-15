import { Vector } from '../math/Vector';
import { Size } from '../math/Size';
import { Flags } from '../math/Flags';
import { Signal } from '../core/Signal';

enum PointerFlags {
    None = 0,
    Position = 1 << 0,
    Size = 1 << 1,
    Tilt = 1 << 2,
    Buttons = 1 << 3,
    Pressure = 1 << 4,
    Rotation = 1 << 5,
}

export class Pointer {

    private readonly _id: number;
    private readonly _type: string;
    private readonly _position: Vector;
    private readonly _startPos: Vector = new Vector(-1, -1);
    private readonly _flags: Flags<PointerFlags> = new Flags<PointerFlags>();
    private readonly _size: Size;
    private readonly _tilt: Vector;
    private _buttons: number;
    private _pressure: number;
    private _rotation: number;

    public readonly onUpdatePosition: Signal = new Signal();
    public readonly onUpdateTilt: Signal = new Signal();
    public readonly onUpdateRotation: Signal = new Signal();
    public readonly onUpdateSize: Signal = new Signal();
    public readonly onUpdateButtons: Signal = new Signal();
    public readonly onUpdatePressure: Signal = new Signal();

    constructor(event: PointerEvent) {
        const { target, pointerId, pointerType, clientX, clientY, width, height, tiltX, tiltY, buttons, pressure, twist } = event;
        const { left, top } = (target as HTMLElement).getBoundingClientRect();

        this._id = pointerId;
        this._type = pointerType;
        this._position = new Vector(clientX - left, clientY - top);
        this._size = new Size(width, height);
        this._tilt = new Vector(tiltX, tiltY);
        this._buttons = buttons;
        this._pressure = pressure;
        this._rotation = twist;
    }

    public get id() {
        return this._id;
    }

    public get type() {
        return this._type;
    }

    public get position() {
        return this._position;
    }

    public get x() {
        return this._position.x;
    }

    public get y() {
        return this._position.y;
    }

    public get size() {
        return this._size;
    }

    public get width() {
        return this._size.width;
    }

    public get height() {
        return this._size.height;
    }

    public get tilt(): Vector {
        return this._tilt;
    }

    public get buttons(): number {
        return this._buttons;
    }

    public get pressure(): number {
        return this._pressure;
    }

    public get rotation(): number {
        return this._rotation;
    }

    public get startPos(): Vector {
        return this._startPos;
    }

    public update(event: PointerEvent): this {
        const { target, clientX, clientY, width, height, tiltX, tiltY, buttons, pressure, twist } = event;
        const { left, top } = (target as HTMLElement).getBoundingClientRect();
        const x = clientX - left;
        const y = clientY - top;

        if ((this._position.x !== x) || (this._position.y !== y)) {
            this._position.set(x, y);
            this._flags.add(PointerFlags.Position);
        }

        if ((this._size.width !== width) || (this._size.height !== height)) {
            this._size.set(width, height);
            this._flags.add(PointerFlags.Size);
        }

        if ((this._tilt.x !== tiltX) || (this._tilt.y !== tiltY)) {
            this._tilt.set(tiltX, tiltY);
            this._flags.add(PointerFlags.Tilt);
        }

        if (this._buttons !== buttons) {
            this._buttons = buttons;
            this._flags.add(PointerFlags.Buttons);
        }

        if (this._pressure !== pressure) {
            this._pressure = pressure;
            this._flags.add(PointerFlags.Pressure);
        }

        if (this._rotation !== twist) {
            this._rotation = twist;
            this._flags.add(PointerFlags.Rotation);
        }

        return this;
    }

    public updateEvents(): this {
        if (!this._flags.value) {
            return this;
        }

        if (this._flags.has(PointerFlags.Position)) {
            this.onUpdatePosition.dispatch(this._position);
            this._flags.remove(PointerFlags.Position);
        }

        if (this._flags.has(PointerFlags.Tilt)) {
            this.onUpdateTilt.dispatch(this._tilt);
            this._flags.remove(PointerFlags.Tilt);
        }

        if (this._flags.has(PointerFlags.Rotation)) {
            this.onUpdateRotation.dispatch(this._rotation, this);
            this._flags.remove(PointerFlags.Rotation);
        }

        if (this._flags.has(PointerFlags.Size)) {
            this.onUpdateSize.dispatch(this._size, this);
            this._flags.remove(PointerFlags.Size);
        }

        if (this._flags.has(PointerFlags.Buttons)) {
            this.onUpdateButtons.dispatch(this._buttons, this);
            this._flags.remove(PointerFlags.Buttons);
        }

        if (this._flags.has(PointerFlags.Pressure)) {
            this.onUpdatePressure.dispatch(this._pressure, this);
            this._flags.remove(PointerFlags.Pressure);
        }

        return this;
    }

    public destroy(): void {
        this._position.destroy();
        this._startPos.destroy();
        this._size.destroy();
        this._tilt.destroy();
        this._flags.destroy();

        this.onUpdatePosition.destroy();
        this.onUpdateTilt.destroy();
        this.onUpdateRotation.destroy();
        this.onUpdateSize.destroy();
        this.onUpdateButtons.destroy();
        this.onUpdatePressure.destroy();
    }
}
