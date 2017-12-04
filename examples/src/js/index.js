window.addEventListener('load', () => {
    const app = new Exo.Application({
            resourcePath: 'assets/',
            canvasParent: document.querySelector('.container-canvas'),
            width: 800,
            height: 600,
        }),
        loadScript = () => {
            app.stop();

            const name = location.hash.slice(1),
                script = document.createElement('script'),
                example = document.querySelector('#current-example');

            if (example) {
                example.parentNode.removeChild(example);
            }

            script.type = 'text/javascript';
            script.async = true;
            script.src = `src/js/examples/${name}.js?no-cache=${Date.now()}`;
            script.id = 'current-example';

            document.getElementsByTagName('head')[0].appendChild(script);
        };

    window.app = app;
    window.addEventListener('hashchange', loadScript, false);

    if (location.hash) {
        loadScript();
    }
});
