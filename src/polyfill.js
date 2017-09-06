((global) => {
    const vendors = ['webkit', 'moz', 'ms', 'o'];

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
