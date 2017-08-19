((global) => {
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
})(window);
