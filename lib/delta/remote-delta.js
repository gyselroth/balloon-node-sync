var fs = require('fs');
var path = require('path');

var async = require('async');

var blnApi = require('../bln-api.js');
var logger = require('../logger.js');
var remoteDeltaLogDb = require('./remote-delta-log-db.js');
var syncDb = require('../sync-db.js');

var groupedDelta = {};

function fetchDelta(params, callback) {
  blnApi.nodeDelta(params, (err, data) => {
    if(err) return callback(err);

    logger.debug('Got remote delta', data);

    async.parallel([
      (cb) => {
        if(data.has_more === false) return cb(null, data.cursor);

        process.nextTick(() => {
          fetchDelta({cursor: data.cursor}, params, cb);
        });
      },
      (cb) => {
        groupDelta(data.nodes, cb);
      },
      (cb) => {
        remoteDeltaLogDb.insert(data, (err) => {
          return cb(null);
        });
      }
    ], (err, results) => {
      if(err) return callback(err);

      return callback(null, results[0]);
    });
  });
}

function groupDelta(nodes, callback) {
  nodes.forEach((node) => {
    node.parent = node.parent || '';

    if(groupedDelta[node.id] === undefined) {
      groupedDelta[node.id] = {
        id: node.id,
        directory: node.directory,
        actions: {}
      };
    }

    var groupedNode = groupedDelta[node.id];

    if(node.deleted === true) {
      groupedNode.actions.delete = node;
    } else {
      groupedNode.actions.create = node;
      groupedNode.parent = node.parent;
      if(node.directory === false) {
        groupedNode.version = node.version;
        groupedNode.hash = node.hash;
        groupedNode.size = node.size;
      }
    }
  });

  callback(null);
}


var remoteDelta = {
  getDelta: function(cursor, callback) {
    groupedDelta = {};

    async.series([
      (cb) => {
        fetchDelta({cursor}, (err, newCursor) => {
          if(err) return cb(err);

          cb(null, newCursor);
        });
      },
      (cb) => {
        syncDb.find({$and: [{directory: true}, {downloadOriginal: true}]}, (err, syncedNodes) => {
          if(err) return cb(err);
          if(!syncedNodes) return cb(null);

          async.map(syncedNodes, (syncedNode, mapCb) => {
            if(!syncedNode.remoteId) mapCb(null);

            fetchDelta({id: syncedNode.remoteId}, mapCb);
          }, cb);
        });
      }
    ], (err, results) => {
      callback(err, results[0]);
    });
  },

  getGroupedDelta: function() {
    return groupedDelta;
  }
}

module.exports = remoteDelta;
