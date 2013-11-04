var debug = require('debug')('zuul');
var bouncy = require('bouncy');
var Cloud = require('mocha-cloud');

var tunnel = require('./tunnel');
var control_app = require('./control-app');
var expand_browsers = require('./browsers.js');

var pkg = {};
try {
    pkg = require(process.cwd() + '/package.json');
} catch (err) {}

module.exports = function(config) {
    var control_server = control_app(config).listen(0, function() {
        debug('control server active on port %d', control_server.address().port);
    });

    // TODO custom server provided by user
    var custom_server = undefined;

    var bouncer_port = 0;
    if (config.local && parseInt(config.local)) {
        bouncer_port = config.local;
    }

    var bouncer = bouncy(function (req, res, bounce) {
        var url = req.url.split('?')[0];
        if (!custom_server || url.split('/')[1] === '__mocha') {
            return bounce(control_server.address().port);
        }

        bounce(custom_server.port, { headers: { connection: 'close' } });
    });

    bouncer.listen(bouncer_port, bouncer_active);

    function bouncer_active() {
        var app_port = bouncer.address().port;
        debug('bouncer active on port %d', app_port);

        // don't start any tunnel things
        if (config.local) {
            var url = 'http://localhost:' + app_port + '/__mocha';
            console.log('open the following url in a browser:');
            console.log(url);
            return;
        }

        // config the cloud based
        var cloud = new Cloud(config.name || pkg.name, config.username, config.key);

        expand_browsers(config.browsers || [], function(err, browsers) {
            if (err) {
                console.error(err.stack);
                return;
            }

            browsers.forEach(function(browser) {
                cloud.browser(browser.name, browser.version, browser.platform);
            });

            // ask localtunnel for a tunnel so we can test on sauce
            var tunnel_client = tunnel(app_port, function(err, url) {
                if (err) {
                    return console.error(err.stack);
                }

                var url = url + '/__mocha';
                debug('tunnel url %s', url);

                cloud.on('init', function(browser){
                    console.log('  init : %s %s', browser.browserName, browser.version);
                });

                cloud.on('start', function(browser){
                    console.log('  start : %s %s', browser.browserName, browser.version);
                });

                cloud.on('end', function(browser, res){
                    console.log('  end : %s %s : %d failures', browser.browserName, browser.version, res.failures);
                });

                cloud.on('error', function(err) {
                    console.error(err);
                });

                cloud.url(url);
                cloud.start(function(err) {
                    if (err) {
                        console.error(err);
                    }
                    setTimeout(process.exit.bind(process), 1000);
                });
            });
        });
    };
};