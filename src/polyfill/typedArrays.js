((global) => {
    if (!global.ArrayBuffer) {
        global.ArrayBuffer = Array;
    }

    if (!global.Float32Array) {
        global.Float32Array = Array;
    }

    if (!global.Uint32Array) {
        global.Uint32Array = Array;
    }

    if (!global.Uint16Array) {
        global.Uint16Array = Array;
    }
})(window);
