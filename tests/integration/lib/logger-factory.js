var path = require('path');

var winston = require('winston');
var TransportStream = require('winston-transport');

var logLevels = {error: 3, warning: 4, notice: 5, info: 6, debug: 7};
var logger;

class NullTransport extends TransportStream {
  constructor(options = {}) {
    super(options);

    this.name = 'null'
  }

  log(info, callback) {
    callback(null, true);
  }
}

module.exports = function(config) {
  if(!logger) {
    var pathLogFile = path.join(config.configDir, 'error.log');

    logger = winston.createLogger({levels: logLevels});

    logger.add(new NullTransport());
  }

  return logger;
}
