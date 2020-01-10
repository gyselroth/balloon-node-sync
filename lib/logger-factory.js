var path = require('path');

var {createLogger, transports} = require('winston');

var logLevels = {error: 3, warning: 4, notice: 5, info: 6, debug: 7};
var logger;

module.exports = function(config) {
  if(!logger) {
    var pathLogFile = path.join(config.configDir, 'error.log');

    logger = createLogger({
      levels: logLevels,
      transports: [],
    });

    if(config.context !== 'test') {
      logger.add(new transports.File({
        filename: pathLogFile,
        level: 'info',
        maxsize: 10000000,
        maxFiles: 10,
        json: true,
        showLevel: true,
        tailable: true,
        zippedArchive: true
      }));
    }

    if(config.context === 'development') {
      logger.add(new transports.Console({
        level: 'debug',
        prettyPrint: true,
        depth: 6,
        humanReadableUnhandledException: true
      }));
    }

  }

  return logger;
}
