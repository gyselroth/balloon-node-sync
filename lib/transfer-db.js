/**
Database for storing active up- and downloads.
**/

var path = require('path');
var nedb = require('nedb');

var fsWrap = require('./fs-wrap.js');
var logger = require('./logger.js');
var utility = require('./utility.js');

var connected = false;

var transferDb = {
  isConnected: function() {
    return connected;
  },

  connect: function(dbPath, callback) {
    if(connected === true) return callback(null);

    var pathCollection = path.join(dbPath, 'db', 'transfer.db');
    this.db = new nedb({
      filename: pathCollection,
      autoload: true,
      onload: (err) => {
        connected = true;
        callback(err);
      }
    });

    this.db.ensureIndex({fieldName: 'transferId'});
  },

  insert: function(newTransfer, callback) {
    this.db.insert(newTransfer, function (err, createdTransfer) {
      callback(err, createdTransfer || undefined);
    });
  },

  update: function(id, newTransfer, callback) {
    this.db.update({'_id': id}, newTransfer, callback);
  },

  remove: function(id, callback) {
    this.db.remove({'_id': id}, callback);
  },

  findOneByTransferIdAndType: function(transferId, type, callback) {
    this.db.findOne({$and: [{transferId}, {type}]}, (err, transfer) => {
      callback(err, transfer || undefined);
    });
  },

  findCreatedBefore: function(compareDate, callback) {
    this.db.find({created: {$lt: compareDate}}, callback);
  },

  removeCreatedBefore: function(compareDate, callback) {
    this.db.remove({created: {$lt: compareDate}}, {multi: true}, callback);
  },

  getUploadByTransferId: function(transferId, callback) {
    this.findOneByTransferIdAndType(transferId, 'upload', (err, transfer) => {
      if(err) return callback(err);

      if(transfer) {
        logger.info('TRANSFER DB: found active upload', {transferId, transfer});

        callback(null, transfer);
      } else {
        var newTransfer = {
          type: 'upload',
          transferId,
          chunkgroup: utility.uuid4(),
          chunksComplete: 0,
          created: new Date()
        }

        this.insert(newTransfer, (err, createdTransfer) => {
          if(err) return callback(err);

          logger.info('TRANSFER DB: created new upload', {transferId, createdTransfer});
          callback(null, createdTransfer);
        });
      }
    });
  },

  getDownloadByTransferId: function(transferId, callback) {
    this.findOneByTransferIdAndType(transferId, 'download', (err, transfer) => {
      if(err) return callback(err);

      var offset = 0;
      var activeTransfer;

      if(transfer && fsWrap.existsSyncTemp(transfer.tempName)) {
        var tempStat = fsWrap.lstatSyncTemp(transfer.tempName);

        offset = tempStat.size;
        activeTransfer = transfer;
      } else if(transfer) {
        this.remove(transfer._id);
      }

      if(activeTransfer) {
        logger.info('TRANSFER DB: found active download', {transferId, activeTransfer, offset});
        callback(null, {activeTransfer, offset});
      } else {
        var newTransfer = {
          type: 'download',
          transferId,
          tempName: utility.uuid4(),
          created: new Date()
        }

        this.insert(newTransfer, (err, createdTransfer) => {
          if(err) return callback(err);

          logger.info('TRANSFER DB: created new download', {transferId, createdTransfer, offset});

          callback(null, {activeTransfer: createdTransfer, offset});
        });
      }
    });
  }
}

module.exports = transferDb;
