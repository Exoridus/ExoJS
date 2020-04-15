const path = require('path');

module.exports = {
    mode: 'development',
    entry: {
        'exo': path.resolve(__dirname, '../src/index.ts'),
    },
    output: {
        path: path.resolve(__dirname, '../dist'),
        filename: "[name].js",
        libraryTarget: 'umd',
        library: 'Exo',
        umdNamedDefine: true
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js"]
    },
    devtool: "inline-source-map",
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: 'awesome-typescript-loader',
                exclude: /node_modules/,
                query: {
                    declaration: false,
                }
            },
            {
                test: /\.(vert|frag)$/,
                use: 'raw-loader',
                exclude: /node_modules/,
            },
        ],
    },
    performance: {
        hints: false,
    },
    watchOptions: {
        aggregateTimeout: 300,
        poll: 1000,
        ignored: /node_modules/,
    }
};