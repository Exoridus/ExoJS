module.exports = (grunt) => {
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-sass');
    grunt.loadNpmTasks('grunt-webpack');
    grunt.loadNpmTasks('grunt-babel');

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        dirs: {
            build: './bin',
            src: './src',
            examples: './examples',
            game: './game',
        },
        files: {
            source: '<%= dirs.src %>/index.js',
            build: '<%= dirs.build %>/exo.build.js',
            buildMin: '<%= dirs.build %>/exo.min.js',
        },
        uglify: {
            options: {
                sourceMap: true,
                mangle: true,
            },
            dist: {
                src: '<%= files.build %>',
                dest: '<%= files.buildMin %>',
            },
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
                    '<%= files.build %>': '<%= files.source %>',
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
                entry: '<%= files.source %>',
                output: {
                    path: __dirname + '/bin',
                    filename: 'exo.build.js',
                    sourceMapFilename: 'exo.build.js.map',
                    library: 'Exo',
                },
                // plugins: [{
                //     __VERSION__: '<%= pkg.version %>',
                // }],
            },
            examples: {
                entry: '<%= dirs.examples %>/src/js/index.js',
                output: {
                    path: __dirname + '/examples/bin',
                    filename: 'examples.build.js',
                    sourceMapFilename: 'examples.build.js.map',
                },
            },
            game: {
                entry: '<%= dirs.game %>/src/js/index.js',
                output: {
                    path: __dirname + '/game/bin',
                    filename: 'game.build.js',
                    sourceMapFilename: 'game.build.js.map',
                },
            },
        },
        sass: {
            options: {
                precision: 6,
                sourcemap: 'none',
            },
            examples: {
                src: '<%= dirs.examples %>/src/scss/index.scss',
                dest: '<%= dirs.examples %>/bin/examples.build.css',
            },
            game: {
                src: '<%= dirs.game %>/src/scss/index.scss',
                dest: '<%= dirs.game %>/bin/game.build.css',
            },
        },
    });

    grunt.registerTask('default', ['build']);
    grunt.registerTask('build', ['webpack:dist']);
    grunt.registerTask('build-full', [
        'build',
        'uglify'
    ]);
    grunt.registerTask('build-examples', [
        'webpack:examples',
        'sass:examples',
    ]);
    grunt.registerTask('build-game', [
        'webpack:game',
        'sass:game',
    ]);
};
