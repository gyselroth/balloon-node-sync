/**
Database for re queueing api call errors.
**/

var path = require('path');
var nedb = require('nedb');

var connected = false;

var remotedeltaLogDb = {
  isConnected: function() {
    return connected;
  },

  connect: function(dbPath, callback) {
    var pathCollection = path.join(dbPath, 'db', 'remotedelta-log.db');
    this.db = new nedb({
      filename: pathCollection,
      autoload: true,
      onload: (err) => {
        callback(err);
      }
    });
  },

  insert: function(data, callback) {
    var newRecord = {
      data: data,
      created: new Date()
    }

    this.db.insert(newRecord, function (err, createdRecord) {
      callback(err, createdRecord || undefined);
    });
  },

  removeCreatedBefore: function(compareDate, callback) {
    this.db.remove({created: {$lt: compareDate}}, {multi: true}, callback);
  }
}

module.exports = remotedeltaLogDb;
