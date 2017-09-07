((document, node) => {
    const loadScript = (name) => {
        if (!name) {
            return;
        }

        if (window.game) {
            window.game.destroy();
            window.game = null;

            node = document.querySelector('#current-example');
            node.parentNode.removeChild(node);

            node = document.querySelector('.container-canvas');
            while (node.firstChild) {
                node.removeChild(node.firstChild);
            }
        }

        node = document.createElement('script');
        node.type = 'text/javascript';
        node.async = true;
        node.src = `scripts/${name}.js?no-cache=${Date.now()}`;
        node.id = 'current-example';
        document.getElementsByTagName('head')[0].appendChild(node);
    }

    window.addEventListener('hashchange', () => loadScript(location.hash.slice(1)), false);

    if (location.hash) {
        loadScript(location.hash.slice(1));
    }
})(document);
