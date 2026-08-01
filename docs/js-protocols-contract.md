# JavaScript protocol contract

The protocol additions are deliberately narrow:

- `ActionMap` is iterable in declaration order.
- `Container` iterates an immutable snapshot of document order. Mutating the container after creating an iterator does not rewrite that iterator's sequence.
- Caller-owned `InputBinding` handles implement `Symbol.dispose` as an idempotent alias of `unbind()`.

Engine-owned managers, scenes, render nodes, and containers do not become caller-disposable. Their lifetime remains controlled by their existing owner.

The root declaration surface augments `SymbolConstructor.dispose` and `Disposable`, so the shipped declarations remain consumable under the repository's ES2022 external-consumer target. That lane compiles a real `using` declaration against the packed package.

The binding method is installed under `Symbol.dispose ?? Symbol.for('Symbol.dispose')`. Runtime `using` still requires an environment or polyfill that provides `Symbol.dispose`; ordinary `unbind()` remains supported without that requirement.
