var fs = require('fs');
var path = require('path');

var config = require('./config.js');

var _cursorStorage;
var _cursor;

function getCursorStorage() {
  if(!_cursorStorage) {
    var pathCursorStorage = path.join(config.get('instanceDir'), 'last-cursor');

    //ensure storage exists
    if(fs.existsSync(pathCursorStorage) === false) {
      fs.closeSync(fs.openSync(pathCursorStorage, 'w'));
    }

    _cursorStorage = {
      write: function() {
        fs.truncateSync(pathCursorStorage, 0);
        fs.writeFileSync(pathCursorStorage, _cursor);
      },

      read: function() {
        var cursorFromStorage = fs.readFileSync(pathCursorStorage).toString();
        _cursor = cursorFromStorage !== '' ? cursorFromStorage : undefined;
      }
    }
  }

  return _cursorStorage;
}

module.exports = {
  get: function() {
    if(_cursor === undefined) {
      getCursorStorage().read();
    }

    return _cursor;
  },
  set: function(cursor) {
    _cursor = cursor;
    getCursorStorage().write();
  }
};
