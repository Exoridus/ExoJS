# ExoJS Examples — JS and TS Strategy

ExoJS targets TypeScript-first development but the playground runs JavaScript in the Monaco editor. This document defines which patterns are acceptable in which contexts and why.

---

## Language tracks

### JavaScript examples (quick examples)

JavaScript examples use `Scene.create()` with dynamic state attached to `this`. This is the natural pattern for short, self-contained playground snippets where TypeScript strict-mode overhead would obscure the concept being demonstrated.

```js
app.start(Scene.create({
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/bunny.png' });
    },

    init(loader) {
        this._bunny = new Sprite(loader.get(Texture, 'bunny'));
    },

    update(delta) {
        this._bunny.rotate(delta.seconds * 360);
    },

    draw(runtime) {
        this._bunny.render(runtime);
    },
}));
```

Dynamic properties (`this._bunny`) produce Monaco warnings in JS strict mode. Those warnings are suppressed by `noImplicitAny: false` and diagnostic code 7044 in the playground's compiler options. This is intentional — the broad `any` shim is acceptable as JS playground ergonomics only.

### TypeScript compact examples

For examples that benefit from typed state, the anonymous-class pattern is acceptable. It is compact, requires no separate file, and gives full IntelliSense for all scene fields.

```ts
app.start(new class extends Scene {
    private bunny!: Sprite;

    async load(loader: Loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/bunny.png' });
    }

    init(loader: Loader): void {
        this.bunny = new Sprite(loader.get(Texture, 'bunny'));
    }

    update(delta: Time): void {
        this.bunny.rotate(delta.seconds * 360);
    }

    draw(runtime: SceneRenderRuntime): void {
        this.bunny.render(runtime);
    }
});
```

Class fields (`private bunny!: Sprite`) give:
- Strict type checking on every access
- Autocomplete and hover docs inside all lifecycle methods
- No `any` promotions — every field has a concrete type

The definite-assignment assertion (`!`) is required because `init()` sets the field after construction, which TypeScript cannot statically verify. This is a known and acceptable pattern for lifecycle-initialized scene state.

### TypeScript guide examples (named classes)

For longer multi-concept examples or guide sections where the class is referenced by name across multiple call sites, use a named class:

```ts
class BunnyScene extends Scene {
    private bunny!: Sprite;

    async load(loader: Loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/bunny.png' });
    }

    init(loader: Loader): void {
        this.bunny = new Sprite(loader.get(Texture, 'bunny'));
    }

    update(delta: Time): void {
        this.bunny.rotate(delta.seconds * 360);
    }

    draw(runtime: SceneRenderRuntime): void {
        this.bunny.render(runtime);
    }
}

await app.start(new BunnyScene());
```

Named classes are preferred when:
- The example extends across more than ~60 lines
- Multiple scene types are defined in the same file
- A guide doc references the class by name in surrounding prose

---

## Why class fields matter

`Scene.create()` attaches state to `this` dynamically. At runtime this works fine, but TypeScript does not see the field declarations — every access is `any`. The `noImplicitAny: false` playground setting suppresses the errors, but autocomplete still shows `any` rather than the actual type.

Class fields eliminate this:

```ts
// TS: `this.bunny` is always `Sprite`, not `any`
private bunny!: Sprite;
```

Every method that reads `this.bunny` gets full type inference, completion, and hover documentation without any workaround.

---

## Current state

All existing examples are JavaScript using `Scene.create()`. The broad `any` shim remains in place for these examples because the alternative — rewriting every example as a TS class — is out of scope for this pass.

The `any` shim (`noImplicitAny: false`, `noImplicitThis: false`, `checkJs: true` with code 7044 suppressed) is a deliberate tradeoff for JS playground ergonomics. It is not the final story for TypeScript users. New TS examples should use the anonymous-class or named-class patterns above and should not rely on the shim.

---

## Implementation order for TS examples

When converting or adding TS examples:
1. Use the anonymous-class pattern for examples under ~60 lines.
2. Use the named-class pattern for examples over ~60 lines or guide-facing content.
3. Do not mix JS and TS in the same example file.
4. TS examples do not yet have a playground transpilation pipeline — they are documentation patterns for now. The playground only runs JS.
