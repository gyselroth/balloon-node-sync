/**
Database for re queueing api call errors.
**/

var path = require('path');
var nedb = require('nedb');

var connected = false;

var queueErrorDb = {
  isConnected: function() {
    return connected;
  },

  connect: function(dbPath, callback) {
    var pathCollection = path.join(dbPath, 'db', 'api-error-queue.db');
    this.db = new nedb({
      filename: pathCollection,
      autoload: true,
      onload: (err) => {
        callback(err);
      }
    });
  },

  insert: function(newError, callback) {
    this.db.insert(newError, function (err, createdError) {
      callback(err, createdError || undefined);
    });
  },

  remove: function(id, callback) {
    this.db.remove({'_id': id}, callback);
  },

  findAll: function(callback) {
    return this.db.find({}, callback);
  }
}

module.exports = queueErrorDb;
