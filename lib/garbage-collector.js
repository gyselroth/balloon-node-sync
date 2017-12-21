
var async = require('async');

var fsWrap = require('./fs-wrap.js');
var transferDb = require('./transfer-db.js');
var utility = require('./utility.js');

function getCompareDate(offset) {
  if(!offset) offset = 48 * 60 * 60 * 1000;
  return new Date(new Date().getTime() - offset)
}

function cleanTransferDb(callback) {
  if(transferDb.isConnected() === false) return (callback(null));

  var compareDate = getCompareDate();
  transferDb.findCreatedBefore(compareDate, (err, transfers) => {
    async.parallel([
      (cb) => {
        async.map(transfers, (transfer, mapCb) => {
          if(transfer.type === 'download' && fsWrap.existsSyncTemp(transfer.tempName)) {
            fsWrap.unlinkSyncTemp(transfer.tempName);
          }
          mapCb(null);
        }, cb);
      },
      (cb) => {
        transferDb.removeCreatedBefore(compareDate, cb);
      }
    ], callback);
  });
}

function cleanTempFiles(callback) {
  if(transferDb.isConnected() === false) return (callback(null));

  async.map(fsWrap.readTempdirSync(), (filename, cb) => {
    try {
      var stat = fsWrap.lstatSyncTemp(filename);

      if(stat.ctime < getCompareDate()) {
        fsWrap.unlinkSyncTemp(filename);
      }
    } catch(err) {
      if(err.code === 'EPERM') {
        //on windows readdir often returns previously deleted files
        //stat on these files returns EPERM errors. ignore these errors
        //if filename is a real file to delete it will be deleted in the next run
      } else {
        return cb(err);
      }
    }

    cb(null);
  }, callback);
}

var garbageCollector = {
  run: function(callback) {
    async.series([
      cleanTransferDb,
      cleanTempFiles
    ], callback);
  }
}

module.exports = garbageCollector;
