var fs = require('fs');
var path = require('path');

var async = require('async');

var config = require('../config.js');
var blnApi = require('../bln-api.js');
var logger = require('../logger.js');
var syncDb = require('../sync-db.js');
var ignoreDb = require('../ignore-db.js');

var blnApiError = require('../../errors/bln-api.js');

var groupedDelta = {};

/**
 * fetches the delta from the server,
 * if there are multiple `pages` the api is called recursively until there is no further page
 * The results are grouped by node id.
 * @see groupedDelta
 *
 * @param {Object} params - parameters to pass to the api endpoint
 * @param {Function} callback - callback function
 * @returns {void} - no return value
 */
function fetchDelta(params, callback) {
  if(!params.limit) params.limit = 100;

  blnApi.nodeDelta(params, (err, data) => {
    if(err) return callback(err);

    logger.info('Got remote delta', data);

    if(data.reset === true && params.cursor) {
      //only reset if it is not the intial delta without cursor
      throw new blnApiError('Got delta reset', 'BLN_API_DELTA_RESET');
    }

    async.parallel([
      (cb) => {
        if(data.has_more === false) return cb(null, data.cursor);

        //recursively fetch delte if there are further pages
        process.nextTick(() => {
          fetchDelta({cursor: data.cursor}, cb);
        });
      },
      (cb) => {
        groupDelta(data.nodes, cb);
      }
    ], (err, results) => {
      if(err) return callback(err);

      return callback(null, results[0]);
    });
  });
}

/**
 * groups the delta by node id, ignores paths found in ignoreDb
 *
 * @param {Array} nodes - array of node actions (data.nodes from api call)
 * @param {Function} callback - callback function
 * @returns {void} - no return value
 */
function groupDelta(nodes, callback) {
  async.eachLimit(nodes, 10, (node, cb) => {
    if(node.path === null) {
      // if node.path is null we have to skip the node
      logger.info('Remote Delta: Got node with path equal null', {node});
      return cb(null);
    }

    const query = {remoteId: node.id, path: node.path};
    ignoreDb.isIgnoredNode(query, (err, isIgnored) => {
      if(err) return cb(err);
      if(isIgnored) return cb(null);

      groupNode(node);
      cb(null);
    });
  }, callback);
}

/**
 * groups a single node
 *
 * @param {Object} node - node action from remote delta
 * @returns {void} - no return value
 */
function groupNode(node) {
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
}


var remoteDelta = {
  /**
   * fetches the delta from the server,
   *
   * @param {string|undefined} cursor - the cursor to get the delta from
   * @param {Function} callback - callback function
   * @returns {void} - no return value
   */
  getDelta: function(cursor, callback) {
    groupedDelta = {};

    async.series([
      (cb) => {
        logger.info('Fetching delta', {category: 'sync-remote-delta'});

        fetchDelta({cursor}, (err, newCursor) => {
          if(err) return cb(err);

          cb(null, newCursor);
        });
      },
      (cb) => {
        logger.info('Applying collections which need to be redownloaded', {category: 'sync-remote-delta'});

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
      logger.info('getDelta ended', {category: 'sync-remote-delta'});

      callback(err, results[0]);
    });
  },

  /**
   * returns the curent grouped delta,
   *
   * @returns {Object} - grouped delta
   */
  getGroupedDelta: function() {
    return groupedDelta;
  }
}

module.exports = remoteDelta;
