var path = require('path');

var winston = require('winston');

var logLevels = {error: 3, warning: 4, notice: 5, info: 6, debug: 7};
var logger;

module.exports = function(config) {
  if(!logger) {
    var pathLogFile = path.join(config.configDir, 'error.log');

    logger = new (winston.Logger)({levels: logLevels});

    /*
    logger.add(winston.transports.Console, {
      level: 'debug',
      prettyPrint: true,
      depth: 6,
      humanReadableUnhandledException: true
    });
    */

  }

  return logger;
}
