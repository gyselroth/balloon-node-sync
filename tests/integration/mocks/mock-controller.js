var sinon = require('sinon');

//Objects to mock
var syncDb = require('../../../lib/sync-db.js');
var transferDb = require('../../../lib/transfer-db.js');
var remoteDeltaLogDb = require('../../../lib/delta/remote-delta-log-db.js');
var fsWrap = require('../../../lib/fs-wrap.js');
var blnApi = require('../../../lib/bln-api.js');
var lastCursor = require('../../../lib/last-cursor.js');
var queueErrorDb = require('../../../lib/queue/queue-error-db.js');

//Mock objects and mock object factories
var syncDbFactory = require('./sync-db-factory.js');
var transferDbFactory = require('./transfer-db-factory.js');
var remoteDeltaLogDbFactory = require('./remote-delta-log-db-factory.js');
var fsWrapFactory = require('./fs-wrap-factory.js');
var blnApiFactory = require('./bln-api-factory.js');
var queueErrorDbFactory = require('./queue-error-db-factory.js');

var mockController = function() {
  this.registry = {};
};

mockController.prototype.setup = function(pathFixtures) {
  this.registry.syncDb = syncDbFactory(pathFixtures);
  this.registry.transferDb = transferDbFactory(pathFixtures);
  this.registry.remoteDeltaLogDb = remoteDeltaLogDbFactory(pathFixtures);
  this.registry.fsWrap = fsWrapFactory(pathFixtures);
  this.registry.blnApi = blnApiFactory(pathFixtures);
  this.registry.queueErrorDb = queueErrorDbFactory(pathFixtures);

  Object.keys(this.registry.syncDb.mock).forEach((key) => {
    sinon.stub(syncDb, key, this.registry.syncDb.mock[key]);
  });

  Object.keys(this.registry.transferDb.mock).forEach((key) => {
    sinon.stub(transferDb, key, this.registry.transferDb.mock[key]);
  });

  Object.keys(this.registry.remoteDeltaLogDb.mock).forEach((key) => {
    sinon.stub(remoteDeltaLogDb, key, this.registry.remoteDeltaLogDb.mock[key]);
  });

  Object.keys(this.registry.fsWrap.mock).forEach((key) => {
    sinon.stub(fsWrap, key, this.registry.fsWrap.mock[key]);
  });

  Object.keys(this.registry.blnApi.mock).forEach((key) => {
    sinon.stub(blnApi, key, this.registry.blnApi.mock[key]);
  });

  Object.keys(this.registry.queueErrorDb.mock).forEach((key) => {
    sinon.stub(queueErrorDb, key, this.registry.queueErrorDb.mock[key]);
  });

  sinon.stub(lastCursor, 'get', function() {return 'a'});
  sinon.stub(lastCursor, 'set', function(cursor) {});
}

mockController.prototype.tearDown = function() {
  Object.keys(this.registry.syncDb.mock).forEach((key) => {
    syncDb[key].restore();
  });

  Object.keys(this.registry.transferDb.mock).forEach((key) => {
    transferDb[key].restore();
  });

  Object.keys(this.registry.remoteDeltaLogDb.mock).forEach((key) => {
    remoteDeltaLogDb[key].restore();
  });

  Object.keys(this.registry.fsWrap.mock).forEach((key) => {
    fsWrap[key].restore();
  });

  Object.keys(this.registry.blnApi.mock).forEach((key) => {
    blnApi[key].restore();
  });

  Object.keys(this.registry.queueErrorDb.mock).forEach((key) => {
    queueErrorDb[key].restore();
  });

  lastCursor.get.restore();
  lastCursor.set.restore();

  this.registry.syncDb.tearDown();
  this.registry.queueErrorDb.tearDown();

  //reset this.registry
  this.registry = {};
}

module.exports = mockController;
