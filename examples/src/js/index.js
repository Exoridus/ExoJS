window.addEventListener('load', () => {
    let activeScript = null;

    const container = document.querySelector('.canvas-container'),
        stats = new Stats(),
        app = new Exo.Application({
            resourcePath: 'assets/',
            clearColor: new Exo.Color(66, 66, 66),
            width: 800,
            height: 600,
        }),

        loadExample = () => {
            app.stop();

            if (activeScript) {
                activeScript.parentNode.removeChild(activeScript);
            }

            activeScript = document.createElement('script');
            activeScript.type = 'text/javascript',
            activeScript.async = true,
            activeScript.src = `src/js/examples/${location.hash.slice(1)}.js?no-cache=${Date.now()}`,

            document.body.appendChild(activeScript);
        },

        getStats = () => {
            const style = stats.dom.style;

            style.position = 'absolute';
            style.top = '0';
            style.left = '0';

            return stats.dom;
        };

    container.appendChild(app.canvas);
    container.appendChild(getStats());

    app.on('start', () => stats.begin());
    app.on('update', () => stats.update());
    app.on('stop', () => stats.end());

    window.app = app;
    window.addEventListener('hashchange', loadExample, false);

    if (location.hash) {
        loadExample();
    } else {
        location.hash = 'sprite';
    }
});
