'use strict';
const path = require('path');
const http = require('http');
const map = require('map-stream');
const nunjucks = require('nunjucks');
// const highlighjs = require('highlight.js');
// const markdown = require('nunjucks-markdown');
// const marked = require('marked')
const utils = require('./utils');
const _ = require('lodash');

function Nunjucks(file, option, cb) {
    option._env.render(file.path, {
        _components: option._components[file.path]
    }, function (err, res) {
        if (err) {
            cb(err);
        } else {
            
            file.contents = Buffer.from(res);
            cb(null, file);
        }
    });
}

/**
 * 添加内置过滤器
 */
function addFilters(env, config) {
    /**
     * exclude 过滤器
     *  {{ _components | exclude('main', 'footer') | source('link') }}
     */
    env.addFilter('exclude', function() {
        let args = Array.prototype.slice.call(arguments);
        let components = args.shift();
        let result = {};

        for ( let c in components ) {
            //console.log('--%s-%s--', args, components[c]['name']);
            if ( args.indexOf( components[c]['name'] ) < 0 ) {
                result[c] = components[c];
            }
        }

        return result;
    });

    /**
     * Get component resources
     *  {{ _components | source('link') }}
     *  {{ _components | source('script') }}
     */
    env.addFilter('source', function(components, type) {
        let paths = [];
        let EXT = type === 'link' ? '.scss' : '.js';
        let prefix = path.relative(config.source, process.cwd());

        let tag = utils.getTag(type);

        for ( let c in components ) {
            let filename = path.join(config._SOURCE_ROOT, c + EXT);

            if ( utils.hasContents(filename) ) {
                paths.push(utils.dirToPath(path.join(prefix, c + EXT.replace('.scss', '.css'))));
            }
        }
        let result = paths.map(function(r) {
            return tag.replace('{{source}}', r);
        });
        let resultCombo = paths.map(function(r) {
            return path.join(config.view, r).replace(config.component.dir, '');
        });

        let comboPath = config.production + path.join(
            config._PRD_PREFIX,
            config.component.dir,
            '??',
            resultCombo.join(',')
        );

        return config._isPrd
            ? tag.replace('{{source}}', utils.dirToPath(comboPath))
            : result.join('\n');
    });
}

/**
 * 转换手动引用的资源路径
 * {{ Tag('tagname', relative_path) }}
 * return
 *  <script src"production_path"></script>
 *  <link rel="stylesheet" type="text/css" href="production_path" />
 */
function addGlobals(env, config) {
    function getProductionPath(source) {
        var result = source;

        if (config._isPrd) {
            var productionPath = path.join(
                config._PRD_PREFIX,
                source
            );

            result = config.production + utils.dirToPath(productionPath);
        }

        return result;
    }
    env.addGlobal('isPrd', config._isPrd)
    env.addGlobal('isDev', config._isDev)
    env.addGlobal('Tag', function (tagname, source) {
        return utils.getTag(tagname)
            .replace('{{source}}', getProductionPath(source));
    });
}

/**
 * 添加自定义标签
 */
function addExtensions(env, config) {
    /**
     * {% setGlobal key="val" %}
     */
    var SetGlobalTag = function() {
        this.tags = ['setGlobal'];

        this.parse = function(parser, nodes, lexer) {
            var token = parser.nextToken();

            var args = parser.parseSignature(null, true);
            parser.advanceAfterBlockEnd(token.value);

            return new nodes.CallExtension(this, 'run', args);
        };

        this.run = function(context, values) {
            for ( var key in values ) {
                if ( values.hasOwnProperty(key) && key !== '__keywords' ) {
                    env.addGlobal(key, values[key]);
                }
            }
            return '';
        };
    };
    /**
     * {% component 'name' {title: 'Example', subtitle: 'An example component'} %}
     */
    var ComponentTag = function() {
        this.tags = ['component'];

        this.parse = function(parser, nodes, lexer) {
            var token = parser.nextToken();

            var args = parser.parseSignature(null, true);
            parser.advanceAfterBlockEnd(token.value);

            return new nodes.CallExtension(this, 'run', args);
        };

        this.run = function(context, name, data) {
            var cPath = path.join(config._COMPONENT_ROOT, name, name + '.html');
            var cName = path.join(config._COMPONENT_ROOT, name, config.component.config);

            var mergedData = _.defaultsDeep(data, getComponentData(cName, config));
            return env.render(cPath, mergedData);
        };
    };
    /**
     * {% inject "http://json_api.com/" %}
     */
    var InjectData = function() {
        this.tags = ['inject'];

        this.parse = function(parser, nodes, lexer) {
            var token = parser.nextToken();

            var args = parser.parseSignature(null, true);
            parser.advanceAfterBlockEnd(token.value);

            return new nodes.CallExtensionAsync(this, 'run', args);
        };

        this.run = function(context, url, cb) {
            http.get(url, (res) => {
                var body = '';

                res.setEncoding('utf8');
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    cb(null, body);
                });
            }).on('error', (e) => {
                cb(e);
            });
        };
    };

    env.addExtension('component', new ComponentTag());
    env.addExtension('setGlobal', new SetGlobalTag());
    env.addExtension('injectData', new InjectData());
}

/**
 * 获取组件数据
 */
function getComponentData(cfgPath, config) {
    let data = {};

    if (utils.hasContents(cfgPath)) {
        data = require(cfgPath).data;
    }
    // clear node module cache.
    delete require.cache[cfgPath];
    return data;
}


module.exports = function(option) {
    option._env = nunjucks.configure({
        autoescape: false,
        noCache: true,
        trimBlocks: true,
        lstripBlocks: true
    });

    // marked.setOptions({
    //     highlight: function (code) {
    //         return highlighjs.highlightAuto(code).value;
    //     }
    // });
    // markdown.register(option._env, marked);

    addExtensions(option._env, option);
    addFilters(option._env, option);
    addGlobals(option._env, option);

    return map(function(file, cb) {
        Nunjucks(file, option, cb);
    });
};
