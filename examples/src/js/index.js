$(() => {
    const loader = new Exo.ResourceLoader(),
        $navigation = $('.navigation-list'),
        $content = $('.main-content'),
        template = '<!DOCTYPE html><html><head><style>body,html{margin:0px;height:100%;overflow:hidden;}canvas{width:100%;height:100%;}</style></head><body>' +
            '<script src="vendor/stats.js"></script>' +
            '<script src="vendor/jquery.js"></script>' +
            '<script src="../bin/exo.build.js"></script>' +
            '<script>window.onload = function(){__CODE__}</script></body></html>',

        createExample = (code) => {
            $content.html('<iframe class="example" src="blank.html">');

            const example = document.querySelector('.example'),
                content = example.contentDocument ||  example.contentWindow.document;

            content.open();
            content.write(template.replace('__CODE__', code));
            content.close();
        },

        loadExample = (example) => {
            loader.loadItem({
                type: 'text',
                name: example.path,
                path: `src/js/examples/${example.path}?no-cache=${Date.now()}`,
            }).then(createExample);
        },

        createNavigation = (entries) => {
            for (const entry of entries) {
                $navigation.append($('<div>', {
                    'class': 'navigation-sub-header',
                    'html': entry.title
                }));

                for (const example of entry.examples) {
                    $navigation.append($('<div>', {
                        'class': 'navigation-item',
                        'html': example.title
                    }).on('click', () => loadExample(example)));
                }
            }
        };

    loader.loadItem({
        type: 'json',
        name: 'examples',
        path: 'assets/json/examples.json',
    }).then(createNavigation);
});
