import { removeArrayItems } from 'utils/core';

type SignalHandler<Args extends Array<unknown>> = (...params: Args) => void | boolean;

interface ISignalBinding<Args extends Array<unknown>> {
    handler: SignalHandler<Args>;
    context?: object;
}

export class Signal<Args extends Array<unknown> = []> {

    private readonly _bindings = new Array<ISignalBinding<Args>>();

    public get bindings(): ReadonlyArray<ISignalBinding<Args>> {
        return this._bindings;
    }

    public has(handler: SignalHandler<Args>, context?: object): boolean {
        return this._bindings.some((binding) => (binding.handler === handler && binding.context === context));
    }

    public add(handler: SignalHandler<Args>, context?: object): this {
        if (!this.has(handler, context)) {
            this._bindings.push({ handler, context });
        }

        return this;
    }

    public once(handler: SignalHandler<Args>, context?: object): this {
        const once = (...params: Args): void => {
            this.remove(once, context);
            handler.call(context, ...params);
        };

        this.add(once, context);

        return this;
    }

    public remove(handler: SignalHandler<Args>, context?: object): this {
        const index = this._bindings.findIndex((binding) => (binding.handler === handler && binding.context === context));

        if (index !== -1) {
            removeArrayItems(this._bindings, index, 1);
        }

        return this;
    }

    public clearByContext(context?: object): this {
        const bindings = this._bindings.filter(binding => binding.context === context);

        for (const binding of bindings) {
            removeArrayItems(this._bindings, this._bindings.indexOf(binding), 1);
        }

        return this;
    }

    public clear(): this {
        this._bindings.length = 0;

        return this;
    }

    public dispatch(...params: Args): this {
        if (this._bindings.length) {
            for (const binding of this._bindings) {
                if (binding.handler.call(binding.context, ...params) === false) {
                    break;
                }
            }
        }

        return this;
    }

    public destroy(): void {
        this.clear();
    }
}
