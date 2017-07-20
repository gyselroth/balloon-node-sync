var fs = require('fs');
var path = require('path');

var async = require('async');
var dateFormat = require('dateformat');
var winston = require('winston');

var lastCursor = require('./last-cursor.js');
var config = require('./config.js');
var blnApi = require('./bln-api.js');
var logger = require('./logger.js');

var _type;
var _syncStart;
var _syncEnd;


function getLogDir(suffix) {
  var logDir = path.join(config.get('configDir'), 'devLogs', dateFormat(_syncStart, "yyyy-mm-dd-HHMMss"));

  if(!suffix) return logDir;

  if(suffix) return path.join(logDir, suffix);
}

function mkdirpSync(dir) {
  var retries = 0;
  var parentDir = path.dirname(dir)

  while(true) {
    try {
      if(fs.existsSync(parentDir) === false) {
        mkdirpSync(parentDir);
      }

      fs.mkdirSync(dir);
      break;
    } catch(err) {
      retries ++;

      if(retries > 5) {
        throw err;
        break;
      }

      var stop = new Date().getTime();
      while(new Date().getTime() < stop + (retries * 100)) {
        //sleep for retries * 100 ms
      }
    }
  }
}

function createDirectorySnapshot(callback) {
  var snapshot = {};
  var prefix = config.get('balloonDir');
  var logDir = getLogDir(_type);

  readdir(config.get('balloonDir'), (err) => {
    var dest = path.join(logDir, 'local-fs.json');

    fs.writeFile(dest, formatDirectorySnapshot(snapshot), callback);
  });

  function formatDirectorySnapshot(snapshot) {
    return JSON.stringify(snapshot)
        .replace(/^\{/, '\{\n  ')
        .replace(/\:\[/g, '\: \[\n    ')
        .replace(/\}\],/g, '\}\n  \],\n  ')
        .replace(/\},\{/g, '\},\n    \{')
        .replace(/\]\}$/, '\n  ]\n}')
  }

  function readdir(dir, callback) {
    var dirNodes = [];
    var dirRel = dir.replace(prefix, '');
    if(dirRel.slice(-1) !== '/') dirRel = dirRel + '/';

    fs.readdir(dir, (err, nodes) => {

      async.map(nodes, (node, cb) => {
        var curPath = path.join(dir, node);
        var stat = fs.lstatSync(curPath);

        var nodeRepresentation = {
          name: node,
          stat: {
            ino: stat.ino,
            size: stat.size,
            ctime: stat.ctime,
            mtime: stat.mtime
          },
          parent: dirRel,
          directory: stat.isDirectory()
        }

        dirNodes.push(nodeRepresentation);

        if(stat.isDirectory()) {
          readdir(curPath, cb);
        } else {
          cb(null);
        }
      }, (err) => {
        if(dirNodes.length > 0) snapshot[dirRel] = dirNodes;
        callback(null);
      });
    });
  }
}

function copyLastCursor(callback) {
  var dest = path.join(getLogDir(_type), 'last-cursor');

  fs.writeFile(dest, lastCursor.get(), (err) => {
    callback(null);
  });
}

function copyDb(callback) {
  var dest = path.join(getLogDir(_type), 'nodes.db');
  var src = path.join(config.get('configDir'), 'db/nodes.db');

  if(!fs.existsSync(src)) return callback(null);

  var destFile = fs.createWriteStream(dest);
  var srcFile = fs.createReadStream(src);

  srcFile.pipe(destFile);

  destFile.on('close', (err) => {
    callback(null);
  });
}

function copyQueueErrorDb(callback) {
  var dest = path.join(getLogDir(_type), 'api-error-queue.db');
  var src = path.join(config.get('configDir'), 'db/api-error-queue.db');

  if(!fs.existsSync(src)) return callback(null);

  var destFile = fs.createWriteStream(dest);
  var srcFile = fs.createReadStream(src);

  srcFile.pipe(destFile);

  destFile.on('close', (err) => {
    callback(null);
  });
}

function copyTransferDb(callback) {
  var dest = path.join(getLogDir(_type), 'transfer.db');
  var src = path.join(config.get('configDir'), 'db/transfer.db');

  if(!fs.existsSync(src)) return callback(null);

  var destFile = fs.createWriteStream(dest);
  var srcFile = fs.createReadStream(src);

  srcFile.pipe(destFile);

  destFile.on('close', (err) => {
    callback(null);
  });
}

function storeRemoteDelta(callback) {
  var deltaResponses = [];

  function fetchDelta(cursor, callback) {
    blnApi.nodeDelta({cursor}, (err, data) => {
      if(err) return callback(null, data);

      deltaResponses.push({cursor, data});

      if(data.has_more) return fetchDelta(data.cursor, callback);

      return callback(null, data.cursor);
    });
  }

  function formatDelta(delta) {
    return JSON.stringify(delta);
  }

  fetchDelta(lastCursor.get(), () => {
    var dest = path.join(getLogDir(_type), 'remote-delta.json');

    fs.writeFile(dest, formatDelta(deltaResponses), () => {
      callback(null);
    });
  });
}

function copyLogs(callback) {
  var options = {
    from: _syncStart,
    until: _syncEnd,
    limit: Infinity,
    order: 'asc',
  };

  function formatLog(entries) {
    return JSON.stringify(entries);
  }

  logger.query(options, function (err, results) {
    if(err || !results || !results.file || !results.file.length) return callback();

    var dest = path.join(getLogDir(), 'sync.log');
    var destFile = fs.createWriteStream(dest);

    destFile.on('close', (err) => {
      callback(null);
    });

    results.file.forEach(entry => {
      destFile.write(JSON.stringify(entry));
      destFile.write('\n');
    });

    destFile.end();
  });
}

var loggingUtility = function(syncStart) {
  _syncStart = syncStart;

  var logDir = getLogDir();

  if(fs.existsSync(logDir) === false) {
    mkdirpSync(logDir);
  }

}

loggingUtility.prototype.createSnapshot = function(type, callback) {
  _type = type;

  if(type === 'after') {
    _syncEnd = new Date();
  }

  var logDir = getLogDir(type);

  if(fs.existsSync(logDir) === false) {
    mkdirpSync(logDir);
  }

  async.parallel([
    createDirectorySnapshot,
    copyLastCursor,
    copyDb,
    copyQueueErrorDb,
    copyTransferDb,
    storeRemoteDelta,
    (cb) => {
      if(_type === 'before') return cb();

      copyLogs(cb);
    }
  ], (err) => {
    callback(err)
  })
};


module.exports = loggingUtility;
