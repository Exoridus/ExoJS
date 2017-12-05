const webpack = require('webpack');

module.exports = (grunt) => {
    const package = grunt.file.readJSON('package.json');

    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-sass');
    grunt.loadNpmTasks('grunt-webpack');
    grunt.loadNpmTasks('grunt-babel');

    grunt.initConfig({
        pkg: package,
        dirs: {
            build: './bin',
            src: './src',
            examples: './examples',
            game: './game',
        },
        babel: {
            options: {
                sourceRoot: '<%= dirs.src %>',
                moduleRoot: '<%= dirs.src %>',
                sourceMap: false,
                minified: false,
                presets: ['es2015'],
            },
            dist: {
                files: {
                    '<%= dirs.build %>/exo.build.js': '<%= dirs.src %>/index.js',
                },
            },
        },
        webpack: {
            options: {
                failOnError: true,
                devtool: 'source-map',
                module: {
                    loaders: [{
                        test: /\.js$/,
                        exclude: /(node_modules|bower_components)/,
                        loader: 'babel-loader?cacheDirectory=cache',
                    }],
                },
            },
            dist: {
                entry: '<%= dirs.src %>/index.js',
                output: {
                    path: __dirname + '/bin',
                    filename: 'exo.build.js',
                    sourceMapFilename: 'exo.build.js.map',
                    library: 'Exo',
                },
                plugins: [
                    new webpack.DefinePlugin({
                        __VERSION__: JSON.stringify(package.version),
                    }),
                ],
            },
            examples: {
                entry: './examples/src/js/index.js',
                output: {
                    path: __dirname + '/examples/bin',
                    filename: 'examples.build.js',
                    sourceMapFilename: 'examples.build.js.map',
                },
                externals: {
                    exojs: 'Exo',
                },
            },
            game: {
                entry: '<%= dirs.game %>/src/js/index.js',
                output: {
                    path: __dirname + '/game/bin',
                    filename: 'game.build.js',
                    sourceMapFilename: 'game.build.js.map',
                },
                externals: {
                    exojs: 'Exo',
                },
            },
        },
        sass: {
            options: {
                precision: 6,
                sourcemap: 'none',
            },
            examples: {
                src: './examples/src/scss/index.scss',
                dest: './examples/bin/examples.build.css',
            },
            game: {
                src: '<%= dirs.game %>/src/scss/index.scss',
                dest: '<%= dirs.game %>/bin/game.build.css',
            },
        },
        uglify: {
            options: {
                sourceMap: true,
                mangle: true,
            },
            dist: {
                src: '<%= dirs.build %>/exo.build.js',
                dest: '<%= dirs.build %>/exo.min.js',
            },
            examples: {
                src: './examples/bin/examples.build.js',
                dest: './examples/bin/examples.min.js',
            },
        },
        cssmin: {
            examples: {
                src: './examples/bin/examples.build.css',
                dest: './examples/bin/examples.min.css',
            },
        },
    });

    grunt.registerTask('default', [
        'build',
    ]);

    grunt.registerTask('build', [
        'webpack:dist',
    ]);

    grunt.registerTask('examples', [
        'webpack:examples',
        'sass:examples',
        'cssmin:examples',
    ]);

    grunt.registerTask('game', [
        'webpack:game',
        'sass:game',
    ]);

    grunt.registerTask('deploy', [
        'build',
        'examples',
        'game',
        'uglify:dist',
        'uglify:examples',
    ]);
};
