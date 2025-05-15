'use strict';
const UglifyJS = require('uglify-js');
const babel = require("@babel/core");
const map = require('map-stream');
const _ = require('lodash');

function minify(file, option, cb) {
    let content = String(file.contents);
    let result = { code: '' };
    let uglifyOption = _.defaultsDeep({
        fromString: true,
        compress: {
            drop_console: false
        },
        output: {
            ascii_only: true,
            comments: /^\!/
        }
    }, option);

    if (!option.enabled) {
        return cb(null, file);
    }

    try {
        // const { code } = babel.transformSync(content, {
        //     presets: ['@babel/preset-env']
        // });
        
        result = UglifyJS.minify(content, uglifyOption);
    } catch (err) {
        console.error('Compress [%s] error.', file.path, err);
    }
    
    file.contents = Buffer.from(result.code);

    cb(null, file);
}

module.exports = function(option) {
    return map(function(file, cb) {
        minify(file, option, cb);
    });
};
