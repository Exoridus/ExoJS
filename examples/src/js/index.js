import $ from './vendor/jquery';
import CodeMirror from './vendor/codemirror/lib/codemirror';
import './vendor/codemirror/mode/javascript/javascript';
import './vendor/codemirror/addon/edit/matchbrackets';
import './vendor/codemirror/addon/selection/active-line';
import { Loader } from 'exojs';

$(() => {
    let loader = new Loader({ cache: 'no-cache' }),
        $navigation = $('.navigation-list'),
        $preview = $('.example-preview'),
        $title = $('.editor-title'),
        $code = $('.editor-code'),
        $refresh= $('.refresh-button'),
        activeExample = null,
        activeEditor = null,
        activePath = location.hash.slice(1),

        createExample = (html) => {
            const $frame = $('<iframe>', {
                'class': 'preview-frame',
                'src': 'preview.html',
            });

            $preview.html($frame);

            $frame.contents()
                .find('body')
                .append($('<script>window.onload = function(){' + html + '}</script>'))

            $code.html(html);

            if (activeEditor) {
                $(activeEditor.getWrapperElement()).remove();
            }

            activeEditor = CodeMirror.fromTextArea($code[0], {
                mode: 'javascript',
                theme: 'monokai-sublime',
                lineNumbers: true,
                styleActiveLine: true,
                matchBrackets: true,
                viewportMargin: Infinity,
                lineWrapping: true,
            });
        },

        loadExample = (example) => {
            if (activeExample === example) {
                return;
            }

            activeExample = example;
            activePath = example.path;
            window.location.hash = activePath;
            document.title = `${example.title} - ExoJS Examples`;
            $title.html(`Example Code: ${example.title}`);

            loader.clear();
            loader.loadItem({
                type: 'text',
                name: activePath,
                path: `src/js/examples/${activePath}?no-cache=${Date.now()}`,
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

                    if (!activePath || activePath === example.path) {
                        loadExample(example);
                    }
                }
            }
        };

    loader.loadItem({
        type: 'json',
        name: 'examples',
        path: `assets/json/examples.json?no-cache=${Date.now()}`,
    }).then(createNavigation);

    $refresh.on('click', () => {
        if (activeEditor) {
            createExample(activeEditor.getValue());
        }
    })
});
