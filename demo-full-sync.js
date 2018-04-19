var fs = require('fs');
var path = require('path');

var loggerFactory = require('./lib/logger-factory.js');
var syncFactory = require('./full-sync-factory.js');

var homeDir = process.env[(/^win/.test(process.platform)) ? 'USERPROFILE' : 'HOME'];
var configDir = path.join(homeDir, '.balloon');
var configFile = path.join( __dirname, 'config.json');

var version = require('./package.json').version;


if(!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir);
}

if(!fs.existsSync(configFile)) {
  config = {};
} else {
  config = require(configFile);
}

config.context = 'development';
config.version = version;

var logger = new loggerFactory(config);
var sync = new syncFactory(config, logger);

sync.start((err, results) => {
  console.log('SYNC Finished', err, results);
});
