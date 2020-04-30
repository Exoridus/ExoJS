const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const { TsConfigPathsPlugin } = require('awesome-typescript-loader');
const CircularDependencyPlugin  = require('circular-dependency-plugin');

module.exports = {
    mode: 'production',
    entry: {
        'exo': path.resolve(__dirname, '../src/index.ts'),
        'exo.min': path.resolve(__dirname, '../src/index.ts'),
    },
    output: {
        path: path.resolve(__dirname, '../dist'),
        filename: "[name].js",
        libraryTarget: 'umd',
        library: 'Exo',
        umdNamedDefine: true
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js"],
        plugins: [
            new TsConfigPathsPlugin()
        ]
    },
    devtool: "source-map",
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                sourceMap: true,
                include: /\.min\.js$/,
            })
        ]
    },
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
    plugins: [
        // new CircularDependencyPlugin({
        //     exclude: /\.js|node_modules|dist/,
        //     failOnError: true,
        //     allowAsyncCycles: false,
        //     cwd: process.cwd(),
        // })
    ]
};
