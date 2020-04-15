import { removeArrayItems } from '../utils/core';

type SignalHandler<T> =  (...params: Array<T>) => void | boolean | any;

interface SignalBinding<T> {
    handler: SignalHandler<T>;
    context?: object;
}

export class Signal<T = any> {

    public readonly bindings = new Array<SignalBinding<T>>();

    has(handler: SignalHandler<T>, context?: object): boolean {
        return this.bindings.some((binding) => (binding.handler === handler && binding.context === context));
    }

    add(handler: SignalHandler<T>, context?: object): this {
        if (!this.has(handler, context)) {
            this.bindings.push({ handler, context });
        }

        return this;
    }

    once(handler: SignalHandler<T>, context?: object): this {
        const once = (...params: Array<any>) => {
            this.remove(once, context);
            handler.call(context, ...params);
        };

        this.add(once, context);

        return this;
    }

    remove(handler: SignalHandler<T>, context?: object): this {
        const index = this.bindings.findIndex((binding) => (binding.handler === handler && binding.context === context));

        if (index !== -1) {
            removeArrayItems(this.bindings, index, 1);
        }

        return this;
    }

    clear(): this {
        this.bindings.length = 0;

        return this;
    }

    dispatch(...params: Array<T>): this {
        if (this.bindings.length) {
            for (const binding of this.bindings) {
                if (binding.handler.call(binding.context, ...params) === false) {
                    break;
                }
            }
        }

        return this;
    }

    destroy() {
        this.clear();
    }
}