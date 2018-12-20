var fs = require('fs');
var path = require('path');

var fsWrap = require('../../../lib/fs-wrap.js');
var utility = require('../../../lib/utility.js');
var BlnApiProgress = require('../../../lib/bln-api-progress.js');
var md5 = require('md5');

module.exports = function(pathFixtures) {
  var calls = [];
  var callResults = [];

  var callResultsFixture = path.join(pathFixtures, 'remote-call-results.json');
  if(fs.existsSync(callResultsFixture)) {
    var callResults = require(callResultsFixture);
  }

  function findCallResult(callIdentifier) {
    var foundCallResultIndex;
    var foundCallResult = callResults.find(function(item, index) {
      for(var property in callIdentifier) {
        if(!(property in item.identifier) || callIdentifier[property].toString() !== item.identifier[property].toString()) {
          return false;
        }
      }

      foundCallResultIndex = index;
      return true;
    });

    if(foundCallResultIndex !== undefined) callResults.splice(foundCallResultIndex, 1);
    return foundCallResult;
  }


  var blnApi = {
    createCollection: function(node, callback) {
      var identifier = {action: 'createCollection', name: node.name, parent: node.parent};
      calls.push(identifier);

      var foundCallResult = findCallResult(identifier);
      var err = null, result;

      if(foundCallResult) {
        err = foundCallResult.err;
        result = foundCallResult.result;
      } else {
        result = createRemoteId(node);
      }

      callback(err, result);
    },

    getAttributes: function(node, attributes, callback) {
      var version = parseInt(node.version || 0) + 1;
      var remoteId = node.remoteId || createRemoteId(node);

      if(!!(attributes && attributes.constructor && attributes.call && attributes.apply)) {
        callback = attributes;
        attributes = [];
      }

      var identifier = {action: 'getAttributes', name: node.name, parent: node.parent, attributes};
      calls.push(identifier);

      var foundCallResult = findCallResult(identifier);
      var err = null, result;

      if(foundCallResult) {
        err = foundCallResult.err;
        result = foundCallResult.result;
      } else {
        result = {
          version,
          hash: md5(version + remoteId),
          id: remoteId
        };
      }

      callback(err, result);
    },

    getAttributesByIds: function(id, attributes, callback) {
      if(!!(attributes && attributes.constructor && attributes.call && attributes.apply)) {
        callback = attributes;
        attributes = [];
      }

      var identifier = {action: 'getAttributesByIds', id, attributes};

      var foundCallResult = findCallResult(identifier);
      var err = null;
      var result = [];

      if(foundCallResult) {
        err = foundCallResult.err;
        result = foundCallResult.result;
      }

      return callback(null, result);
    },

    renameNode: function(node, callback) {
      var identifier = {action: 'renameNode', remoteId: node.remoteId, name: node.name};
      calls.push(identifier);

      var foundCallResult = findCallResult(identifier);
      var err = null, result;

      if(foundCallResult) {
        err = foundCallResult.err;
        result = foundCallResult.result;
      }

      callback(err, result);
    },

    moveNode: function(node, callback) {
      var identifier = {action: 'moveNode', remoteId: node.remoteId, parent: node.parent};
      calls.push(identifier);

      var foundCallResult = findCallResult(identifier);
      var err = null, result;

      if(foundCallResult) {
        err = foundCallResult.err;
        result = foundCallResult.result;
      }

      callback(err, result);
    },

    deleteNode: function(node, callback) {
      var identifier = {action: 'deleteNode', remoteId: node.remoteId};
      calls.push(identifier);

      var foundCallResult = findCallResult(identifier);
      var err = null, result;

      if(foundCallResult) {
        err = foundCallResult.err;
        result = foundCallResult.result;
      }

      callback(err, result);
    },

    uploadFile: function(node, callback) {
      var progress = new BlnApiProgress();
      try {
        fsWrap.createReadStream(utility.joinPath(node.parent, node.name));
      } catch(err) {
        return callback(err);
      }

      var result;
      var identifier = {action: 'uploadFile', name: node.name, parent: node.parent};
      calls.push(identifier);

      var foundCallResult = findCallResult(identifier);
      var err = null, result;

      if(foundCallResult) {
        err = foundCallResult.err;
        result = foundCallResult.result;
      } else if(node.remoteId === undefined) {
        result = {status: 201, data: createRemoteId(node)};
      } else {
        result = {status: 200, data: parseInt(node.version) + 1}
      }

      callback(err, result);
      return progress;
    },

    downloadFile: function(remoteId, version, node, callback) {
      var progress = new BlnApiProgress();

      try {
        fsWrap.createWriteStream(utility.joinPath(node.parent, node.name));
      } catch(err) {
        return callback(err);
      }

      var identifier = {action: 'downloadFile', remoteId, name: node.name, parent: node.parent};
      calls.push(identifier);

      var foundCallResult = findCallResult(identifier);
      var err = null, result;

      if(foundCallResult) {
        err = foundCallResult.err;
        result = foundCallResult.result;
      }

      callback(err, result);
      return progress;
    },

    nodeDelta: function(params, callback) {
      var cursor = params.cursor;
      var deltaNameParts = ['remote-delta'];

      if(params.id) deltaNameParts.push('id' + params.id);

      if(cursor) deltaNameParts.push(cursor);

      var deltaResult = require(path.join(pathFixtures, deltaNameParts.join('-') + '.json'));

      callback(null, deltaResult);
    },

    queryNodes: function(query, callback) {
      return callback(null, []);
    }
  }

  function createRemoteId(node) {
    //As operations can be async it is not possible to predict a numerique id, therefore we use path as unique id
    return path.posix.join(node.parent, node.name);
  }

  return {
    mock: blnApi,
    getCalls: function() {
      return calls;
    }
  };
};
