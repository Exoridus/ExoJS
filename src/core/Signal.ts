import { removeArrayItems } from 'utils/core';

type SignalHandler<T> = (...params: Array<T>) => void | boolean | any;

interface ISignalBinding<T> {
    handler: SignalHandler<T>;
    context?: object;
}

export class Signal<T = any> {

    public readonly bindings = new Array<ISignalBinding<T>>();

    public has(handler: SignalHandler<T>, context?: object): boolean {
        return this.bindings.some((binding) => (binding.handler === handler && binding.context === context));
    }

    public add(handler: SignalHandler<T>, context?: object): this {
        if (!this.has(handler, context)) {
            this.bindings.push({ handler, context });
        }

        return this;
    }

    public once(handler: SignalHandler<T>, context?: object): this {
        const once = (...params: Array<any>): void => {
            this.remove(once, context);
            handler.call(context, ...params);
        };

        this.add(once, context);

        return this;
    }

    public remove(handler: SignalHandler<T>, context?: object): this {
        const index = this.bindings.findIndex((binding) => (binding.handler === handler && binding.context === context));

        if (index !== -1) {
            removeArrayItems(this.bindings, index, 1);
        }

        return this;
    }

    public clearByContext(context?: object): this {
        const bindings = this.bindings.filter(binding => binding.context === context);

        for (const binding of bindings) {
            removeArrayItems(this.bindings, this.bindings.indexOf(binding), 1);
        }

        return this;
    }

    public clear(): this {
        this.bindings.length = 0;

        return this;
    }

    public dispatch(...params: Array<T>): this {
        if (this.bindings.length) {
            for (const binding of this.bindings) {
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