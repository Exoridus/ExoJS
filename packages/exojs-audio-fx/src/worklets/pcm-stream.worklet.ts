class PcmStreamProcessor extends AudioWorkletProcessor {
  private readonly _channels: number;
  private readonly _capacity: number;
  private readonly _ring: Float32Array[];
  private _read = 0;
  private _write = 0;
  private _queued = 0;
  private _startFrame: number | null = null;
  private _closed = false;
  private _destroyed = false;
  private _starving = false;
  private _statusPending = false;
  private _dirty = false;
  private readonly _telemetry = {
    type: 'status',
    releasedFrames: 0,
    playedFrames: 0,
    underrunFrames: 0,
    underruns: 0,
  };

  public constructor(options?: unknown) {
    super(options);
    const config = (options as { processorOptions: { channels: number; capacityFrames: number } }).processorOptions;
    this._channels = config.channels;
    this._capacity = config.capacityFrames;
    this._ring = Array.from({ length: this._channels }, () => new Float32Array(this._capacity));
    this.port.onmessage = event => {
      const message = event.data as { type: string; data?: unknown; time: number };
      switch (message.type) {
        case 'write':
          this._enqueue(message.data);
          break;
        case 'start':
          if (this._startFrame === null && Number.isFinite(message.time)) this._startFrame = Math.ceil(message.time * sampleRate);
          break;
        case 'ack':
          this._statusPending = false;
          break;
        case 'clear':
          this._clear();
          this._send('cleared');
          break;
        case 'close':
          this._closed = true;
          this._startFrame ??= currentFrame;
          break;
        case 'destroy':
          this._clear();
          this._destroyed = true;
          this.port.onmessage = null;
          break;
      }
    };
  }

  private _enqueue(data: unknown): void {
    if (!(data instanceof Float32Array)) return;
    const frames = Math.floor(data.length / this._channels);
    if (this._closed || data.length % this._channels !== 0 || frames > this._capacity - this._queued) {
      this._telemetry.releasedFrames += frames;
      this._dirty ||= frames > 0;
      return;
    }
    for (let channel = 0; channel < this._channels; channel++) {
      const ring = this._ring[channel]!;
      const offset = channel * frames;
      for (let frame = 0; frame < frames; frame++) ring[(this._write + frame) % this._capacity] = data[offset + frame]!;
    }
    this._write = (this._write + frames) % this._capacity;
    this._queued += frames;
  }

  private _clear(): void {
    this._telemetry.releasedFrames += this._queued;
    this._queued = 0;
    this._read = 0;
    this._write = 0;
  }

  private _send(type: 'status' | 'cleared' | 'ended'): void {
    // MessagePort clones synchronously, so the render thread can reuse this object.
    this._telemetry.type = type;
    this.port.postMessage(this._telemetry);
    this._dirty = false;
    if (type === 'status') this._statusPending = true;
  }

  public override process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    if (output) {
      for (let channel = 0; channel < output.length; channel++) output[channel]!.fill(0);
    }
    if (this._destroyed) return false;

    const quantum = output?.[0]?.length ?? 0;
    if (this._startFrame !== null) {
      const offset = Math.min(quantum, Math.max(0, this._startFrame - currentFrame));
      const available = quantum - offset;
      const played = Math.min(available, this._queued);
      if (played > 0) {
        for (let channel = 0; channel < this._channels; channel++) {
          const target = output?.[channel];
          if (!target) continue;
          const ring = this._ring[channel]!;
          for (let frame = 0; frame < played; frame++) target[offset + frame] = ring[(this._read + frame) % this._capacity]!;
        }
        this._read = (this._read + played) % this._capacity;
        this._queued -= played;
        this._telemetry.playedFrames += played;
        this._telemetry.releasedFrames += played;
        this._starving = false;
        this._dirty = true;
      }
      const missing = available - played;
      if (missing > 0 && !this._closed) {
        this._telemetry.underrunFrames += missing;
        if (!this._starving) this._telemetry.underruns++;
        this._starving = true;
        this._dirty = true;
      }
    }

    if (this._closed && this._queued === 0) {
      this._send('ended');
      this._destroyed = true;
      this.port.onmessage = null;
      return false;
    }
    if (this._dirty && !this._statusPending) this._send('status');
    return true;
  }
}

registerProcessor('exojs-pcm-stream', PcmStreamProcessor);

export {};
