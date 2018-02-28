var async = require('async');
var config = {username: 'username', context: 'test'};

if(/^win/.test(process.platform)) {
  config.balloonDir = 'C:\\Users\\username\\Balloon';
  config.configDir = 'C:\\Users\\username\\.balloon';
  config.apiUrl = 'https://example.com/api/v1/';
  config.username = 'username';
  config.password = 'secret';
} else {
  config.balloonDir = '/Users/username/Balloon';
  config.configDir = '/Users/username/.balloon';
  config.apiUrl = 'https://example.com/api/v1/';
  config.username = 'username';
  config.password = 'secret';
}

var fs = require('fs');
var path = require('path');
var assert = require('chai').assert;

var syncFactory = require('../../../sync.js');
var syncDb = require('../../../lib/sync-db.js');
var ignoreDb = require('../../../lib/ignore-db.js');

var loggerFactory = require('./logger-factory.js')

var mockControllerFactory = require('../mocks/mock-controller.js');

module.exports = function(test) {
  return function(done) {
    var mockController = new mockControllerFactory();

    var pathFixtures = path.join(__dirname, '..', 'fixtures', test.fixtures);
    mockController.setup(pathFixtures);

    var logger = new loggerFactory(config);
    var sync = new syncFactory(config, logger);

    var newIgnoredIds = require(path.join(pathFixtures, 'newIgnoredIds.json'));


    sync.updateSelectiveSync(newIgnoredIds).then(function(result) {
      var expectedFiles = require(path.join(pathFixtures, 'expected-local-fs.json'));
      var expectedDb = require(path.join(pathFixtures, 'expected-local-synced.json'));
      var actualFiles = mockController.registry.fsWrap.getFiles();
      var actualDb = [];
      var actualIgnoreDb = [];
      var expectedIgnoreDb = [];

      async.parallel([
        (cb) => {
          var pathExpectedIgnoreDb = path.join(pathFixtures, 'expected-local-ignore-db.json');
          if(fs.existsSync(pathExpectedIgnoreDb)) {
            expectedIgnoreDb = require(pathExpectedIgnoreDb);
            mockController.registry.ignoreDb.getNodeList((err, nodes) => {
              actualIgnoreDb = nodes;
              cb(null);
            });
          } else {
            cb(null);
          }
        },
        (cb) => {
          mockController.registry.syncDb.getNodeList((err, nodes) => {
            actualDb = nodes;
            cb(null);
          });
        }
      ], (err, results) => {

        mockController.tearDown();

        assert.deepEqual(actualFiles, expectedFiles);
        assert.deepEqual(actualDb, expectedDb);
        assert.deepEqual(actualIgnoreDb, expectedIgnoreDb);

        done();
      });
    }, done).catch(done);
  }
}
