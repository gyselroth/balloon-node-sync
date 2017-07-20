var fs = require('fs');
var path = require('path');
var extend = require('util')._extend;
var nedb = require('nedb');

var async = require('async');

var utility = require('../../../lib/utility.js');

var databasePath = path.join(__dirname, 'db');
var pathTmpCollectionFile = path.join(databasePath, 'api-error-queue.db');
var nextAutoIncrement = 0;
var db;

module.exports = function(pathFixtures) {
  var queueErrorDb = {
    connect: function(dbPath, callback) {
      var pathDbFixture = path.join(pathFixtures, 'api-error-queue.json')
      var actualDb = [];

      if(fs.existsSync(pathDbFixture)) {
          actualDb = require(pathDbFixture);
      }

      nextAutoIncrement = actualDb.length;

      if(fs.existsSync(databasePath) === false) {
        fs.mkdirSync(databasePath);
      }

      if(fs.existsSync(pathTmpCollectionFile)) {
        fs.unlinkSync(pathTmpCollectionFile);
      }

      this.db = db = new nedb({
        filename: pathTmpCollectionFile,
        autoload: true,
        onload: (err) => {
          async.mapLimit(actualDb, 5, (error, cb) => {
            if(error.task) {
              if(error.task.created) error.task.created = new Date(error.task.created);
              if(error.task.node) {
                if(error.task.node.mtime) error.task.node.mtime = new Date(error.task.node.mtime);
                if(error.task.node.ctime) error.task.node.ctime = new Date(error.task.node.ctime);
                if(error.task.node.localActions) {
                  for(action in error.task.node.localActions) {
                    if(error.task.node.localActions[action].actionInitialized) error.task.node.localActions[action].actionInitialized = new Date(error.task.node.localActions[action].actionInitialized);
                  }
                }
                if(error.task.node.remoteActions) {
                  for(action in error.task.node.remoteActions) {
                    if(error.task.node.remoteActions[action].actionInitialized) error.task.node.remoteActions[action].actionInitialized = new Date(error.task.node.remoteActions[action].actionInitialized);
                  }
                }
              }

            }

            this.db.insert(error, cb);
          }, (err, results) => {
            callback(err);
          });
        }
      });
    },

    insert: function(newError, callback) {
      newError._id = getAutoIncrement();

      this.db.insert(newError, function (err, createdError) {
        callback(err, createdError || undefined);
      });
    },
  }

  function getAutoIncrement() {
    var autoIncrement = nextAutoIncrement+"";
    nextAutoIncrement++;

    return autoIncrement;
  }

  return {
    mock: queueErrorDb,
    tearDown: function() {
      if(fs.existsSync(pathTmpCollectionFile)) {
        fs.unlinkSync(pathTmpCollectionFile);
      }

      if(fs.existsSync(databasePath) === false) {
        fs.rmdirSync(databasePath);
      }

      db = undefined;
      nextAutoIncrement = 0
    },
    getErrors: function(callback) {
      return db.find({}).exec((err, docs) => {
        if(docs) {
          errors = docs.sort((a, b) => {
            if(a._id !== b._id) return a._id < b._id ? -1 : 1;
            return 0;
          }).map((error) => {
            if(error.task.created) error.task.created = error.task.created.toJSON();
            if(error.task.node) {
              if(error.task.node.mtime) error.task.node.mtime = error.task.node.mtime.toJSON();
              if(error.task.node.ctime) error.task.node.ctime = error.task.node.ctime.toJSON();
              if(error.task.node.localActions) {
                for(action in error.task.node.localActions) {
                  if(error.task.node.localActions[action].actionInitialized) {
                    error.task.node.localActions[action].actionInitialized = error.task.node.localActions[action].actionInitialized.toJSON();
                  }
                }
              }
              if(error.task.node.remoteActions) {
                for(action in error.task.node.remoteActions) {
                  if(error.task.node.remoteActions[action].actionInitialized) {
                    error.task.node.remoteActions[action].actionInitialized = error.task.node.remoteActions[action].actionInitialized.toJSON();
                  }
                }
              }
            }

            return error;
          });
        }

        callback(null, errors);
      });
    }
  };
};
