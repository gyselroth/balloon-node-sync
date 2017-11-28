var fs = require('fs-extra');
var path = require('path');
var async = require('async');

var assert = require('chai').assert;
var mockdate = require('mockdate');

var config = require('../../lib/config.js');
var syncDb = require('../../lib/sync-db.js');

config.setAll({
  balloonDir: '/Users/username/Balloon',
  configDir: '~/',
  username: 'username'
});

describe('syncDb', function() {
  var dbPath = path.join(__dirname, 'db');
  var fixturesPath = path.join(__dirname, 'fixtures/sync-db');
  var nodesFixturesPath = path.join(fixturesPath, 'nodes.db');
  var pathTmpCollectionFile = path.join(dbPath, 'nodes.db');

  before(function() {
    if(fs.existsSync(dbPath) === false) {
      fs.mkdirSync(dbPath);
    }

    mockdate.set('1/20/2017');
  });

  beforeEach(function(done) {
    if(fs.existsSync(pathTmpCollectionFile)) {
      fs.unlinkSync(pathTmpCollectionFile);
    }

    fs.copySync(nodesFixturesPath, pathTmpCollectionFile);

    syncDb.connect(__dirname, done);
  });

  describe('findOne', function() {
    it('should find a node by query', function(done) {
      syncDb.findOne({_id: 'f15da29bba0d4b29a14013b6c9889fd8'}, (err, result) => {
        var expected = {"name":"a.b","ino":"6","parent":"/a","directory":true,"remoteId":"6","remoteParent":"1","localParent":"1f8a31ca39924fe98456c1eb591f3bfc","_id":"f15da29bba0d4b29a14013b6c9889fd8"};

        assert.deepEqual(result, expected);
        done();
      });
    });
  });

  describe('findByLocalId', function() {
    it('should find a node by its remoteId', function(done) {
      syncDb.findByLocalId('f15da29bba0d4b29a14013b6c9889fd8', (err, result) => {
        var expected = {"name":"a.b","ino":"6","parent":"/a","directory":true,"remoteId":"6","remoteParent":"1","localParent":"1f8a31ca39924fe98456c1eb591f3bfc","_id":"f15da29bba0d4b29a14013b6c9889fd8"};

        assert.deepEqual(result, expected);
        done();
      });
    });

    it('should return undefined if node was not found', function(done) {
      syncDb.findByLocalId('a', (err, result) => {
        var expected = undefined;

        assert.deepEqual(result, expected);
        done();
      });
    });
  });

  describe('findByLocalParent', function() {
    it('should find nodes by its localParent', function(done) {
      syncDb.findByLocalParent('6cd326f8ae41434fb4d95d9ba4843112', (err, result) => {
        var expected = [
          {"name":"c.b","ino":"8","parent":"/c","directory":true,"remoteId":"8","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"4863767fac8c441fb45e81ba1b1099dd"},
          {"name":"c.txt","ino":"9","parent":"/c","directory":false,"remoteId":"9","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"4863767fac8c441fb45e81ba1b1099df"},
          {"name":"c.a","ino":"7","parent":"/c","directory":true,"remoteId":"7","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"603b051dbbb24a2a8a390a4f13f1a575"}
        ];

        assert.deepEqual(result, expected);
        done();
      });
    });

    it('should return empty array if no node was not found', function(done) {
      syncDb.findByLocalParent('a', (err, result) => {
        var expected = [];

        assert.deepEqual(result, expected);
        done();
      });
    });
  });

  describe('findByIno', function() {
    it('should find a node by its ino', function(done) {
      syncDb.findByIno('6', (err, result) => {
        var expected = {"name":"a.b","ino":"6","parent":"/a","directory":true,"remoteId":"6","remoteParent":"1","localParent":"1f8a31ca39924fe98456c1eb591f3bfc","_id":"f15da29bba0d4b29a14013b6c9889fd8"};

        assert.deepEqual(result, expected);
        done();
      });
    });

    it('should return undefined if node was not found', function(done) {
      syncDb.findByIno('99', (err, result) => {
        var expected = undefined;

        assert.deepEqual(result, expected);
        done();
      });
    });
  });

  describe('findByRemoteId', function() {
    it('should find a node by its remoteId', function(done) {
      syncDb.findByRemoteId('6', (err, result) => {
        var expected = {"name":"a.b","ino":"6","parent":"/a","directory":true,"remoteId":"6","remoteParent":"1","localParent":"1f8a31ca39924fe98456c1eb591f3bfc","_id":"f15da29bba0d4b29a14013b6c9889fd8"};

        assert.deepEqual(result, expected);
        done();
      });
    });

    it('should return undefined if node was not found', function(done) {
      syncDb.findByRemoteId('99', (err, result) => {
        var expected = undefined;

        assert.deepEqual(result, expected);
        done();
      });
    });
  });

  describe('findByPath', function() {
    it('should find a node by its path', function(done) {
      syncDb.findByPath('/a/a.b', (err, result) => {
        var expected = {"name":"a.b","ino":"6","parent":"/a","directory":true,"remoteId":"6","remoteParent":"1","localParent":"1f8a31ca39924fe98456c1eb591f3bfc","_id":"f15da29bba0d4b29a14013b6c9889fd8"};

        assert.deepEqual(result, expected);
        done();
      });
    });

    it('should return undefined if node was not found', function(done) {
      syncDb.findByPath('/x', (err, result) => {
        var expected = undefined;

        assert.deepEqual(result, expected);
        done();
      });
    });
  });

  describe('getDirectories', function() {
    it('should return all directories', function(done) {
      syncDb.getDirectories((err, result) => {
        var expected = [
          {"name":"d","ino":"4","parent":"/","directory":true,"remoteId":"4","remoteParent":"","localParent":null,"_id":"0362644e11a84e03847298862e267cc5"},
          {"name":"a","ino":"1","parent":"/","directory":true,"remoteId":"1","remoteParent":"","localParent":null,"_id":"1f8a31ca39924fe98456c1eb591f3bfc"},
          {"name":"b","ino":"2","parent":"/","directory":true,"remoteId":"2","remoteParent":"","localParent":null,"_id":"45b17866df1c44208df981260d8867c3"},
          {"name":"c.b","ino":"8","parent":"/c","directory":true,"remoteId":"8","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"4863767fac8c441fb45e81ba1b1099dd"},
          {"name":"c.a","ino":"7","parent":"/c","directory":true,"remoteId":"7","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"603b051dbbb24a2a8a390a4f13f1a575"},
          {"name":"c","ino":"3","parent":"/","directory":true,"remoteId":"3","remoteParent":"","localParent":null,"_id":"6cd326f8ae41434fb4d95d9ba4843112"},
          {"name":"a.a","ino":"5","parent":"/a","directory":true,"remoteId":"5","remoteParent":"1","localParent":"1f8a31ca39924fe98456c1eb591f3bfc","_id":"cd197caa14fa474ea38c9d2d53e3e67f"},
          {"name":"a.b","ino":"6","parent":"/a","directory":true,"remoteId":"6","remoteParent":"1","localParent":"1f8a31ca39924fe98456c1eb591f3bfc","_id":"f15da29bba0d4b29a14013b6c9889fd8"}
        ];

        assert.deepEqual(result, expected);
        done();
      });
    });
  });

  describe('getFiles', function() {
    it('should return all files', function(done) {
      syncDb.getFiles((err, result) => {
        var expected = [
          {"name":"c.txt","ino":"9","parent":"/c","directory":false,"remoteId":"9","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"4863767fac8c441fb45e81ba1b1099df"},
          {"name":"b.txt","ino":"10","parent":"/c/c.b","directory":false,"remoteId":"10","remoteParent":"8","localParent":"4863767fac8c441fb45e81ba1b1099dd","_id":"4863767fac8c441fb45e81ba1b1099dg"}
        ];

        assert.deepEqual(result, expected);
        done();
      });
    });
  });

  describe('create', function() {
    it('should create the node in the collection', function(done) {
      var newNode = {"name":"x","ino":"9","parent":"/","directory":true,"remoteId":"9","remoteParent":"","localParent":null};

      syncDb.create(newNode, (err, result) => {
        var expected = {"name":"x","ino":"9","parent":"/","directory":true,"remoteId":"9","remoteParent":"","localParent":null};

        assert.property(result, '_id');

        delete result._id;
        assert.deepEqual(result, expected);
        done();
      });
    });
  });

  describe('update', function() {
    it('should update the node in the collection', function(done) {
      var id = '4863767fac8c441fb45e81ba1b1099dd';
      var newNode = {"name":"c.b","ino":"8","parent":"/b","directory":true,"remoteId":"8","remoteParent":"2","localParent":"45b17866df1c44208df981260d8867c3","_id":"4863767fac8c441fb45e81ba1b1099dd"};

      syncDb.update(id, newNode, (err, result) => {
        var expected = 1;


        assert.deepEqual(result, expected);

        syncDb.findByLocalId(id, (err, result) => {
          var expected = {"name":"c.b","ino":"8","parent":"/b","directory":true,"remoteId":"8","remoteParent":"2","localParent":"45b17866df1c44208df981260d8867c3","_id":"4863767fac8c441fb45e81ba1b1099dd"};

          assert.deepEqual(result, expected);
          done();
        });
      });
    });

    it('should update parent paths for children of directories in the collection', function(done) {
      var id = '1f8a31ca39924fe98456c1eb591f3bfc';
      var newNode = {"name":"a-renamed","ino":"1","parent":"/","directory":true,"remoteId":"1","remoteParent":"","localParent":null,"_id":"1f8a31ca39924fe98456c1eb591f3bfc"}

      syncDb.update(id, newNode, (err, result) => {
        var expected = 1;

        assert.deepEqual(result, expected);

        syncDb.findByLocalParent('1f8a31ca39924fe98456c1eb591f3bfc', (err, result) => {
          var expected = [
            {"name":"a.a","ino":"5","parent":"/a-renamed","directory":true,"remoteId":"5","remoteParent":"1","localParent":"1f8a31ca39924fe98456c1eb591f3bfc","_id":"cd197caa14fa474ea38c9d2d53e3e67f"},
            {"name":"a.b","ino":"6","parent":"/a-renamed","directory":true,"remoteId":"6","remoteParent":"1","localParent":"1f8a31ca39924fe98456c1eb591f3bfc","_id":"f15da29bba0d4b29a14013b6c9889fd8"}
          ];

          assert.deepEqual(result, expected);
          done();
        });
      });
    });
  });



  describe('remove', function() {
    it('should remove a record by id', function(done) {
      syncDb.remove('4863767fac8c441fb45e81ba1b1099dd', (err, numRemoved) => {
        assert.deepEqual(numRemoved, 1);
        done();
      });
    });
  });

  describe('delete', function() {
    it('should delete the node in the collection', function(done) {
      var id = '4863767fac8c441fb45e81ba1b1099dd';

      syncDb.delete(id, (err, result) => {
        var expected = true;

        assert.deepEqual(result, expected);

        syncDb.findByLocalId(id, (err, result) => {
          var expected = undefined;

          assert.deepEqual(result, expected);
          done();
        });
      });
    });

    it('should remove children', function(done) {
      var id = '1f8a31ca39924fe98456c1eb591f3bfc';

      syncDb.delete(id, (err, result) => {

        syncDb.findByLocalId('f15da29bba0d4b29a14013b6c9889fd8', (err, result) => {
          var expected = undefined;

          assert.deepEqual(result, expected);
          done();
        });
      });
    });
  });

  describe('deleteChildren', function() {
    it('should remove all children recursively', function(done) {
      var id = '6cd326f8ae41434fb4d95d9ba4843112';
      var idsToRemove = [
        '4863767fac8c441fb45e81ba1b1099dg',
        '4863767fac8c441fb45e81ba1b1099df',
        '4863767fac8c441fb45e81ba1b1099dd',
        '603b051dbbb24a2a8a390a4f13f1a575'
      ];

      syncDb.deleteChildren(id, (err, result) => {
        async.map(idsToRemove, (id, cb) => {
          syncDb.findByLocalId(id, (err, result) => {
            var expected = undefined;

            assert.deepEqual(result, expected);
            cb();
          });
        }, done);
      });
    });
  });

  describe('findDirectoriesByParent', function() {
    it('should return all directories of a certain parent', function(done) {
      syncDb.findDirecotriesByParent('/c', (err, result) => {
        var expected = [
          {"name":"c.b","ino":"8","parent":"/c","directory":true,"remoteId":"8","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"4863767fac8c441fb45e81ba1b1099dd"},
          {"name":"c.a","ino":"7","parent":"/c","directory":true,"remoteId":"7","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"603b051dbbb24a2a8a390a4f13f1a575"}
        ];

        assert.deepEqual(result, expected);
        done();
      });
    });
  });

  describe('findByParent', function() {
    it('should return all nodes of a certain parent', function(done) {
      syncDb.findByParent('/c', (err, result) => {
        var expected = [
          {"name":"c.b","ino":"8","parent":"/c","directory":true,"remoteId":"8","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"4863767fac8c441fb45e81ba1b1099dd"},
          {"name":"c.txt","ino":"9","parent":"/c","directory":false,"remoteId":"9","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"4863767fac8c441fb45e81ba1b1099df"},
          {"name":"c.a","ino":"7","parent":"/c","directory":true,"remoteId":"7","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"603b051dbbb24a2a8a390a4f13f1a575"}
        ];

        assert.deepEqual(result, expected);
        done();
      });
    });
  });

  afterEach(function() {
    if(fs.existsSync(pathTmpCollectionFile)) {
      fs.unlinkSync(pathTmpCollectionFile);
    }
  });

  after(function() {
    if(fs.existsSync(pathTmpCollectionFile)) {
      fs.unlinkSync(pathTmpCollectionFile);
    }

    if(fs.existsSync(dbPath) === false) {
      fs.rmdirSync(dbPath);
    }
  });
});

describe('syncDb queryChildrenByPath', function() {
  var dbPath = path.join(__dirname, 'db');
  var fixturesPath = path.join(__dirname, 'fixtures/sync-db');
  var nodesFixturesPath = path.join(fixturesPath, 'nodes-query-children-by-path.db');
  var pathTmpCollectionFile = path.join(dbPath, 'nodes.db');

  before(function() {
    if(fs.existsSync(dbPath) === false) {
      fs.mkdirSync(dbPath);
    }
  });

  beforeEach(function(done) {
    if(fs.existsSync(pathTmpCollectionFile)) {
      fs.unlinkSync(pathTmpCollectionFile);
    }

    fs.copySync(nodesFixturesPath, pathTmpCollectionFile);

    syncDb.connect(__dirname, done);
  });

  it('should execute a given query on the given path and all dependents', function(done) {
    syncDb.queryChildrenByPath('/c', {'$or': [
      {'remoteActions.create': {$exists: true}},
      {'remoteActions.move': {$exists: true}}
    ]}, false, (err, result) => {
      var expected = [
        {"name":"c.b","ino":"8","parent":"/c","directory":true,"remoteActions": {"create": true},"remoteId":"8","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"4863767fac8c441fb45e81ba1b1099dd"},
        {"name":"c.a","ino":"7","parent":"/c","directory":true,"remoteActions": {"move": {"parent": "parent"}},"remoteId":"7","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"603b051dbbb24a2a8a390a4f13f1a575"}
      ];

      assert.deepEqual(result, expected);
      done();
    });
  });

  it('should return an empty array if no node matches the query', function(done) {
    syncDb.queryChildrenByPath('/c', {'$or': [
      {'localActions.create': {$exists: true}},
      {'localActions.move': {$exists: true}}
    ]}, false, (err, result) => {
      var expected = [];

      assert.deepEqual(result, expected);
      done();
    });
  });

  it('should match the path correctly', function(done) {
    syncDb.queryChildrenByPath('/c', {}, false, (err, result) => {
      var expected = [
        {"name":"c.b","ino":"8","parent":"/c","directory":true,"remoteActions": {"create": true},"remoteId":"8","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"4863767fac8c441fb45e81ba1b1099dd"},
        {"name":"c.txt","ino":"9","parent":"/c","directory":false,"remoteId":"9","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"4863767fac8c441fb45e81ba1b1099df"},
        {"name":"b.txt","ino":"10","parent":"/c/c.b","directory":false,"remoteActions": {"rename": {"parent": "parent"}},"remoteId":"10","remoteParent":"8","localParent":"4863767fac8c441fb45e81ba1b1099dd","_id":"4863767fac8c441fb45e81ba1b1099dg"},
        {"name":"c.a","ino":"7","parent":"/c","directory":true,"remoteActions": {"move": {"parent": "parent"}},"remoteId":"7","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"603b051dbbb24a2a8a390a4f13f1a575"},
        {"name":"c","ino":"3","parent":"/","directory":true,"remoteId":"3","remoteParent":"","localParent":null,"_id":"6cd326f8ae41434fb4d95d9ba4843112"},
        {"name":"c.c","ino":"11","parent":"/c","directory":true,"remoteActions": {"delete": true},"remoteId":"11","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"6cd326f8ae41434fb4d95d9ba4843116"}
      ];

      assert.deepEqual(result, expected);
      done();
    });
  });

  it('should exclude the parent if excludeSelf is true', function(done) {
    syncDb.queryChildrenByPath('/c', {}, true, (err, result) => {
      var expected = [
        {"name":"c.b","ino":"8","parent":"/c","directory":true,"remoteActions": {"create": true},"remoteId":"8","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"4863767fac8c441fb45e81ba1b1099dd"},
        {"name":"c.txt","ino":"9","parent":"/c","directory":false,"remoteId":"9","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"4863767fac8c441fb45e81ba1b1099df"},
        {"name":"b.txt","ino":"10","parent":"/c/c.b","directory":false,"remoteActions": {"rename": {"parent": "parent"}},"remoteId":"10","remoteParent":"8","localParent":"4863767fac8c441fb45e81ba1b1099dd","_id":"4863767fac8c441fb45e81ba1b1099dg"},
        {"name":"c.a","ino":"7","parent":"/c","directory":true,"remoteActions": {"move": {"parent": "parent"}},"remoteId":"7","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"603b051dbbb24a2a8a390a4f13f1a575"},
        {"name":"c.c","ino":"11","parent":"/c","directory":true,"remoteActions": {"delete": true},"remoteId":"11","remoteParent":"3","localParent":"6cd326f8ae41434fb4d95d9ba4843112","_id":"6cd326f8ae41434fb4d95d9ba4843116"}
      ];

      assert.deepEqual(result, expected);
      done();
    });
  });

  afterEach(function() {
    if(fs.existsSync(pathTmpCollectionFile)) {
      fs.unlinkSync(pathTmpCollectionFile);
    }
  });

  after(function() {
    mockdate.reset();

    if(fs.existsSync(pathTmpCollectionFile)) {
      fs.unlinkSync(pathTmpCollectionFile);
    }

    if(fs.existsSync(dbPath) === false) {
      fs.rmdirSync(dbPath);
    }
  });

});
