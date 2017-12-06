$(() => {
    let app = new Exo.Application({
            resourcePath: 'assets/',
            clearColor: new Exo.Color(66, 66, 66),
            width: 800,
            height: 600,
        }),
        stats = new Stats(),
        $container = $('.main-canvas'),
        $navigation = $('.navigation-list'),
        activeScript = null,

        resetApp = () => {
            app.renderManager
                .setClearColor(app.config.clearColor)
                .clear();
        },

        loadExample = (name) => {
            app.stop();

            if (activeScript) {
                activeScript.parentNode.removeChild(activeScript);
                resetApp();
            }

            activeScript = document.createElement('script');
            activeScript.type = 'text/javascript',
            activeScript.async = true,
            activeScript.src = `src/js/examples/${name}.js?no-cache=${Date.now()}`,

            document.body.appendChild(activeScript);
        },

        getStats = () => {
            const style = stats.dom.style;

            style.position = 'absolute';
            style.top = '0';
            style.left = '0';

            return stats.dom;
        };

    $container.append(app.canvas);
    $container.append(getStats());

    app.on('start', () => stats.begin());
    app.on('update', () => stats.update());
    app.on('stop', () => stats.end());

    window.app = app;
    window.addEventListener('hashchange', () => {
        loadExample(location.hash.slice(1));
    }, false);

    if (location.hash) {
        loadExample(location.hash.slice(1));
    } else {
        location.hash = 'sprite';
    }

    app.loader.loadItem({
        type: 'json',
        name: 'examples',
        path: 'json/examples.json',
    }).then((entries) => {
        for (const entry of entries) {
            $navigation.append($('<div>', {
                'class': 'navigation-item sub-header',
                'html': entry.title
            }));

            for (const example of entry.examples) {
                $navigation.append($('<a>', {
                    'class': 'navigation-item',
                    'href': `#${example.path}`,
                    'html': example.title
                }));
            }
        }
    });
});
