$(() => {
    let app = new Exo.Application({
            resourcePath: 'assets/',
            clearColor: new Exo.Color(66, 66, 66),
            width: 800,
            height: 600,
        }),
        stats = new Stats(),
        $stats = $(stats.dom),
        $container = $('.main-canvas'),
        $navigation = $('.navigation-list'),
        activeScript = null,

        loadExample = (path) => {
            app.stop();

            if (activeScript) {
                activeScript.parentNode.removeChild(activeScript);

                app.renderManager
                    .setClearColor(app.config.clearColor)
                    .clear();
            }

            activeScript = document.createElement('script');
            activeScript.type = 'text/javascript',
            activeScript.async = true,
            activeScript.src = `src/js/examples/${path}?no-cache=${Date.now()}`,

            document.body.appendChild(activeScript);
        };

    $container.append(app.canvas);
    $container.append($stats.css({
        position: 'absolute',
        top: '0',
        left: '0',
    }));

    app.on('start', () => stats.begin());
    app.on('update', () => stats.update());
    app.on('stop', () => stats.end());

    app.loader.loadItem({
        type: 'json',
        name: 'examples',
        path: 'json/examples.json',
    }).then((entries) => {
        for (const entry of entries) {
            $navigation.append($('<div>', {
                'class': 'navigation-sub-header',
                'html': entry.title
            }));

            for (const example of entry.examples) {
                $navigation.append($('<div>', {
                    'class': 'navigation-item',
                    'html': example.title
                }).on('click', () => {
                    loadExample(example.path);
                }));

                if (!activeScript) {
                    loadExample(example.path);
                }
            }
        }
    });

    window.app = app;
});
