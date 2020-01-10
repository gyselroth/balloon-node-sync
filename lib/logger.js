var path = require('path');

var {createLogger, transports} = require('winston');

var _logger;

module.exports = function() {
  var errorLevels = {error: 3, warning: 4, notice: 5, info: 6, debug: 7};
  var defaultLogger = createLogger({
    levels: errorLevels,
    transports: []
  });

  defaultLogger.add(new transports.Console({
    level: 'debug',
    prettyPrint: true,
    depth: 6,
    humanReadableUnhandledException: true
  }));

  var logger = {
    setLogger: function(logger) {
      _logger = logger;
    },
    query: function() {
      _logger.query.apply(_logger, arguments);
    }
  }

  Object.keys(errorLevels).forEach((level) => {
    logger[level] = function(...args) {
      _logger[level](...args);
    }
  });


  logger.setLogger(defaultLogger);

  return logger;
}()
