var fs = require('fs');
var path = require('path');
var extend = require('util')._extend;
var nedb = require('nedb');

var async = require('async');

var utility = require('../../../lib/utility.js');

var databasePath = path.join(__dirname, 'db');
var pathTmpCollectionFile = path.join(databasePath, 'transfer.db');
var nextAutoIncrement = 0;
var db;

module.exports = function(pathFixtures) {
  var transferDb = {
    isConnected: function() {
      return true;
    },

    connect: function(dbPath, callback) {
      var actualDb = [];
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
          async.mapLimit(actualDb, 5, (doc, cb) => {

            node.mtime = new Date(node.mtime);
            node.ctime = new Date(node.ctime);

            this.db.insert(doc, cb);
          }, (err, results) => {
            callback(err);
          });
        }
      });
    },

    insert: function(newDoc, callback) {
      newDoc._id = getAutoIncrement();

      this.db.insert(newDoc, function (err, createdDoc) {
        callback(err, createdDoc || undefined);
      });
    }
  }

  function getAutoIncrement() {
    var autoIncrement = nextAutoIncrement+"";
    nextAutoIncrement++;

    return autoIncrement;
  }

  return {
    mock: transferDb,
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
    getNodeList: function(callback) {
      return db.find({}).sort({_id: 1}).exec((err, docs) => {
        callback(null, docs);
      });
    }
  };
};
