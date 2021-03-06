var gulp = require('gulp')
var watch = require('gulp-watch')
var rename = require('gulp-rename')
var runSequence = require('run-sequence').use(gulp)
var shell = require('gulp-shell');
var util = require('gulp-util');

var browserify = require('browserify')
var babelify = require('babelify')
var sourcemaps = require('gulp-sourcemaps')
var source = require('vinyl-source-stream')
var buffer = require('vinyl-buffer')
var watchify = require('watchify')

var sass = require('gulp-sass')

var autoprefix = require('gulp-autoprefixer')
var notify = require('gulp-notify')

// gulp.task('test-move-file', function() {
//     return gulp.src(['./readme.md'])
//         .pipe(rename(function(path) {
//             path.basename = 'bundle'
//             path.extname = '.md'
//         }))
//         .pipe(gulp.dest('./bin'))
// })

gulp.task('js', function() {
    var bundler = browserify('./app/app.js', { debug: true })
        .transform(babelify, { /* options */ })
    return bundler.bundle()
        .on('error', notify.onError(function (error) {
            return 'Error: ' + error.message
        }))
        .pipe(source('bundle.js'))
        .pipe(buffer())
        .pipe(sourcemaps.init({ loadMaps: true }))
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest('./bin'))
})

//if having issues add {"atomic_save": true} to sublime user settings
gulp.task('css', function() {
    return gulp.src('./app/scss/app.scss')
        .pipe(
            sass({
                includePaths: [
                    './app/scss',
                ],
                style: 'compressed',
                loadPath: []
            })
            .on('error', notify.onError(function (error) {
                return 'Error: ' + error.message
            }))
        )
        .pipe(autoprefix('last 2 version'))
        .pipe(rename(function(path) {
            path.basename = 'bundle'
            path.extname = '.css'
        }))
        .pipe(gulp.dest('./bin'))
})

gulp.task('watch', function() {
    watch('./app/**/*.js', function(files) {
        runSequence('js')
    })
    
    watch('./app/scss/**/*.scss', function(files) {
        runSequence('css')
    })

    return runSequence('js', 'css')
})

var electronPackager = require('electron-packager')
gulp.task('build', () => {
    doBuild('./build')
})
gulp.task('build-dist', () => {
    doBuild('../kankei/dist')
})
function doBuild(outPath) {
    let opts = {
        dir: '.', //dir of source
        out: outPath,
        name: 'Kindred',
        overwrite: true,
        icon: './assets/split.ico',
        // all: true,
        arch: 'x64', //ia32, x64, armv7l, all
        platform: 'win32', //linux, win32, darwin, mas, all
        //asar: false,
        //ignore: ['build', 'crisp', 'app'], //exclude these items from the build
        //prune: true //excludes package.json dev-dependencies
    }
    return electronPackager(opts, (err, appPath) => {
        if (err) {
            util.log(err)
        }
        else {
            util.log('Built', util.colors.cyan(opts.name), util.colors.magenta('v' + opts['app-version']))
            util.log('Packaged to: ')
            for (var i = 0; i < appPath.length; i++) {
                util.log('            ', util.colors.cyan(appPath[i]))
            }
        }
    })
}

var electronInstaller = require('electron-winstaller')
gulp.task('build-installer', function() {
    var resultPromise = electronInstaller.createWindowsInstaller({
        appDirectory: './build/Kindred-win32-x64',
        outputDirectory: './build/Kindred-installer-x64',
        authors: 'Kindred Author',
        exe: 'Kindred.exe',
        description: 'Kindred'
    })

    resultPromise.then(() => console.log('It worked!'), (e) => console.log(`No dice: ${e.message}`))
    return resultPromise
})


gulp.task('start', shell.task([
    'npm install',
    'npm run start',
]))

gulp.task('start-dev', shell.task([
    // 'npm install',
    'npm run start-dev',
]))

gulp.task('default', ['watch', 'start'])
