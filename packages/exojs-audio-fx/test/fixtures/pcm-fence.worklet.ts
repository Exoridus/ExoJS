const register = globalThis.registerProcessor;

// Offline rendering can finish before queued MessagePort commands arrive. The
// fence acknowledges their delivery without changing the production render path.
globalThis.registerProcessor = (name, Processor) => {
  register(
    name,
    class extends Processor {
      public constructor(options?: unknown) {
        super(options);
        const receive = this.port.onmessage;

        this.port.onmessage = event => {
          if ((event.data as { type: string }).type === 'test-fence') {
            this.port.postMessage({ type: 'test-fence' });
          } else {
            receive?.call(this.port, event);
          }
        };
      }
    },
  );
};

export {};
