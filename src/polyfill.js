((global) => {
    const vendors = ['webkit', 'moz', 'ms', 'o'];

    global.AudioContext = global.AudioContext || global.webkitAudioContext;
    global.OfflineAudioContext = global.OfflineAudioContext || global.webkitOfflineAudioContext;

    if (global.AudioContext) {
        const Prototype = global.AudioContext.prototype;

        Prototype.createGain = (Prototype.createGain || Prototype.createGainNode);
        Prototype.createDelay = (Prototype.createDelay || Prototype.createDelayNode);
        Prototype.createScriptProcessor = (Prototype.createScriptProcessor || Prototype.createJavaScriptNode);
    }

    if (global.AudioBufferSourceNode) {
        const Prototype = global.AudioBufferSourceNode.prototype;

        Prototype.start = (Prototype.start || Prototype.noteOn);
        Prototype.stop = (Prototype.stop || Prototype.noteOff);
    }

    if (global.OscillatorNode) {
        const Prototype = global.OscillatorNode.prototype;

        Prototype.start = (Prototype.start || Prototype.noteOn);
        Prototype.stop = (Prototype.stop || Prototype.noteOff);
    }

    for (let i = 0, len = vendors.length; !global.requestAnimationFrame && i < len; i++) {
        const vendor = vendors[i];

        global.requestAnimationFrame = global[`${vendor}RequestAnimationFrame`];
        global.cancelAnimationFrame = global[`${vendor}CancelAnimationFrame`] || global[`${vendor}CancelRequestAnimationFrame`];
    }

    if (!global.requestAnimationFrame) {
        let lastTime = Date.now();

        global.requestAnimationFrame = (callback) => {
            const currTime = Date.now(),
                timeToCall = Math.max(0, 16 - (currTime - lastTime));

            lastTime = currTime + timeToCall;

            return global.setTimeout(() => callback(currTime + timeToCall), timeToCall);
        };
    }

    if (!global.cancelAnimationFrame) {
        global.cancelAnimationFrame = (id) => clearTimeout(id);
    }
})(window);
