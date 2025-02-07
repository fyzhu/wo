'use strict';
const chokidar = require('chokidar');
const shs = require('static-http-server');
const build = require('./build');

const chalk = require('chalk');
const async = require('async');
const _ = require('lodash');
const utils = require('../lib/utils');

function colorType(str) {
    switch(str) {
        case 'CHANGE':
            return chalk.green(str);
        case 'ADD':
            return chalk.yellow('---' + str);
        case 'ADDDIR':
            return chalk.yellow(str);
        case 'UNLINK':
            return chalk.red(str);
        case 'UNLINKDIR':
            return chalk.red(str);
        default:
            return chalk.gray(str);
    };
}

function log(e, rPath) {
    console.log('[%s] => %s', colorType(e.toUpperCase()), colorType(utils.relativeDir(rPath)));
}

function server(config, callback) {
    shs(config._SERVER_ROOT, {
        nolog: config.nolog,
        index: config.server.index,
        port: config.server.port
    }, callback);
}

function handleWatchEvent(config, callback) {
    return function(event, path) {
        if (!config.nolog) {
            log(event, path);
        }
        if (event !== 'unlink' && utils.isNormalFile(path)) {
            callback(path);
        }
    };
}

function watch(config, callback){
    config.watcher = chokidar.watch(config._SOURCE_ROOT, {
        ignored: config.watchIgnore,
        ignoreInitial: true
    }).on('all', handleWatchEvent(config, function (path) {
        const {_arg} = config
        build(config, path, () => {
            const {cmd} = _arg
            if (!cmd) return
            const { exec } = require('child_process');
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error(`执行命令出错: ${error}`);
                    return;
                }
                console.log(stdout);
            });
        });
    }));

    chokidar.watch(config.templateRefs, {
        ignoreInitial: true
    }).on('all', handleWatchEvent(config, function () {
        build(config, config.templates[0]);
    }));

    callback(null);
}

function watchRefs(config) {
    /* transform -  parse sass include to compiler dependence.
    --Before--
    {
        'address/address.scss': ['common/lib.scss'],
        'baitiao/baitiao.scss': ['common/lib.scss'],
        'comment/comment.scss': ['common/lib.scss'],
        'consult/consult.scss': ['common/lib.scss', 'common/pager.scss'],
    }
    --After--
    {
        'common/lib.scss': [
            'address/address.scss',
            'baitiao/baitiao.scss',
            'comment/comment.scss',
            'consult/consult.scss'
        ],
        'common/pager.scss': ['consult/consult.scss']
    }
    */
    var result = _.transform(config._sass, (result, values, key) => {
        values.forEach(function (value) {
            if (!result[value]) {
                result[value] = [];
            }

            result[value].push(key);
        });
    });

    function watch(tar, des) {
        config.watcher.unwatch(tar);
        chokidar.watch(tar, {
            ignored: config.watchIgnore,
            ignoreInitial: true
        }).on('all', handleWatchEvent(config, function () {
            build(config, des.concat(tar));
        }));
    }

    for ( var key in result ) {
        if ( result.hasOwnProperty(key) ) {
            watch(key, result[key]);
        }
    }
}

module.exports = function(config, input, callback) {
    callback = callback || function() {};

    async.series([
        // cb => build(config, input, cb),
        // cb => server(config, cb),
        cb => watch(config, cb)
    ], function (err) {
        if (err) {
            return callback(err);
        }

        watchRefs(config);
        callback();
    });
};
