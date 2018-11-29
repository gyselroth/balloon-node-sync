var fs = require('original-fs');
var path = require('path');

var config = require('./config.js');

var _cursorStorage;
var _cursor;

function getCursorStorage() {
  var pathCursorStorage = path.join(config.get('instanceDir'), 'last-cursor');
  //ensure storage exists
  if(fs.existsSync(pathCursorStorage) === false) {
    fs.closeSync(fs.openSync(pathCursorStorage, 'w'));
  }

  if(!_cursorStorage) {
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
  read: function() {
    getCursorStorage().read();
    return _cursor;
  },
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
