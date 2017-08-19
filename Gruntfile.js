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
            examples: './examples'
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
            }
        },
        babel: {
            options: {
                sourceRoot: '<%= dirs.src %>',
                moduleRoot: '<%= dirs.src %>',
                sourceMap: false,
                minified: false,
                presets: ['es2015']
            },
            dist: {
                files: {
                    '<%= files.build %>': '<%= files.source %>',
                }
            }
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
                    }]
                }
            },
            dist: {
                entry: '<%= files.source %>',
                output: {
                    path: __dirname + '/bin',
                    filename: 'exo.build.js',
                    sourceMapFilename: 'exo.build.js.map',
                    library: 'Exo',
                    //library: 'exojs',
                    //libraryTarget: 'amd',
                }
            },
            example_basic: {
                entry: '<%= dirs.examples %>/basic/src/js/index.js',
                output: {
                    path: __dirname + '/examples/basic/bin',
                    filename: 'basic.build.js',
                    sourceMapFilename: 'basic.build.js.map',
                }
            },
            example_benchmark: {
                entry: '<%= dirs.examples %>/benchmark/src/js/index.js',
                output: {
                    path: __dirname + '/examples/benchmark/bin',
                    filename: 'benchmark.build.js',
                    sourceMapFilename: 'benchmark.build.js.map',
                }
            },
            example_game: {
                entry: '<%= dirs.examples %>/game/src/js/index.js',
                output: {
                    path: __dirname + '/examples/game/bin',
                    filename: 'game.build.js',
                    sourceMapFilename: 'game.build.js.map',
                }
            },
            example_audio: {
                entry: '<%= dirs.examples %>/audio/src/js/index.js',
                output: {
                    path: __dirname + '/examples/audio/bin',
                    filename: 'audio.build.js',
                    sourceMapFilename: 'audio.build.js.map',
                }
            },
            example_particles: {
                entry: '<%= dirs.examples %>/particles/src/js/index.js',
                output: {
                    path: __dirname + '/examples/particles/bin',
                    filename: 'particles.build.js',
                    sourceMapFilename: 'particles.build.js.map',
                }
            },
        },
        sass: {
            options: {
                precision: 6,
                sourcemap: 'none'
            },
            example_basic: {
                src: '<%= dirs.examples %>/basic/src/scss/index.scss',
                dest: '<%= dirs.examples %>/basic/bin/basic.build.css'
            },
            example_benchmark: {
                src: '<%= dirs.examples %>/benchmark/src/scss/index.scss',
                dest: '<%= dirs.examples %>/benchmark/bin/benchmark.build.css'
            },
            example_game: {
                src: '<%= dirs.examples %>/game/src/scss/index.scss',
                dest: '<%= dirs.examples %>/game/bin/game.build.css'
            },
            example_audio: {
                src: '<%= dirs.examples %>/audio/src/scss/index.scss',
                dest: '<%= dirs.examples %>/audio/bin/audio.build.css'
            },
            example_particles: {
                src: '<%= dirs.examples %>/particles/src/scss/index.scss',
                dest: '<%= dirs.examples %>/particles/bin/particles.build.css'
            }
        },
    });

    grunt.registerTask('default', ['build']);

    grunt.registerTask('build', ['webpack:dist']);
    grunt.registerTask('build-full', ['build', 'uglify']);

    grunt.registerTask('build-examples', [
        'build-example-basic',
        'build-example-benchmark',
        'build-example-game',
        'build-example-audio',
        'build-example-particles',
    ]);
    grunt.registerTask('build-example-basic', [
        'webpack:example_basic',
        'sass:example_basic',
    ]);
    grunt.registerTask('build-example-benchmark', [
        'webpack:example_benchmark',
        'sass:example_benchmark',
    ]);
    grunt.registerTask('build-example-game', [
        'webpack:example_game',
        'sass:example_game',
    ]);
    grunt.registerTask('build-example-audio', [
        'webpack:example_audio',
        'sass:example_audio',
    ]);
    grunt.registerTask('build-example-particles', [
        'webpack:example_particles',
        'sass:example_particles',
    ]);
};
