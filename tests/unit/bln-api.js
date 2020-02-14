var fs = require('fs');

var stream = require('stream');
var events = require('events');
var chai = require('chai');
var assert = chai.assert;
var sinon = require('sinon');
var sinonChai = require('chai-sinon');
var mockdate = require('mockdate');

chai.should();
chai.use(sinonChai);

var config = require('../../lib/config.js');
var blnApi = require('../../lib/bln-api.js');
var blnApiRequest = require('../../lib/bln-api-request.js');
var fsWrap = require('../../lib/fs-wrap.js');
var utility = require('../../lib/utility.js');
var transferDb = require('../../lib/transfer-db.js');

config.setAll({
  balloonDir: '/Users/username/Balloon',
  configDir: '~/',
  username: 'username'
});

function stubApiRequest(expectdResult) {
  var result = expectdResult || {};
  sinon.stub(fs, 'createReadStream').callsFake(function() {
    var rs = new stream.Readable();
    rs._read = function(n) {
      return '';
    }

    return rs;
  });

  sinon.stub(blnApiRequest, 'sendRequest').callsFake(function() {
    arguments[arguments.length - 1](null, result);
    //TODO pixtron - return a request mock
    return {
      pipe: function() {},
      on: function() {},
      pause: function() {},
      resume: function() {},
      ondata: function() {},
      once: function() {},
      emit: function() {},
      end: function() {},
      write: function() {}
    }
  });

  sinon.stub(blnApiRequest, 'sendStreamingRequest').callsFake(function() {
    //TODO pixtron - return a request mock
    var emitter = new events.EventEmitter();
    var stub = {
      pipe: function() {},
      on: function(event, cb) {
        emitter.on(event, cb);
      },
      pause: function() {},
      resume: function() {},
      ondata: function() {},
      once: function() {},
      emit: function(event) {},
      end: function() {},
      write: function() {}
    }

    setTimeout(() => {
      emitter.emit('bln-error', 'emitting an error to stop request');
    }, 1);

    return stub;
  });
}

describe('blnApi', function() {
  before(function() {
    mockdate.set('1/20/2017');

    sinon.stub(fsWrap, 'createWriteStream').callsFake(function() {
      return stream.Writable;
    });

    sinon.stub(fsWrap, 'lstatSync').callsFake(function() {
      return {
        size: 2,
        ino: 1,
        mtime: new Date()
      };
    });

    sinon.stub(utility, 'uuid4').callsFake(function() {
      return '58a5fae2-431a-4fbb-83f3-5c4f4fb9773c';
    });
  });

  describe('createCollection', function() {
    it('should call the correct endpoint', function() {
      stubApiRequest()

      var node = {name: 'a.a', parent: '/a'};
      blnApi.createCollection(node, sinon.spy());
      blnApiRequest.sendRequest.should.have.been.calledWith('post', '/collection', {p: '/a/a.a'});
    });

    it('should return the id of the creatd node', function(done) {
      var expectedResult = {status: 201, data: '58760130a641e6ff1a8b45bf'};
      stubApiRequest(expectedResult);

      var node = {name: 'a.a', parent: '/a'};

      blnApi.createCollection(node, (err, nodeId) => {
        assert.equal(err, null);
        assert.equal(nodeId, expectedResult.data);

        done();
      });
    });
  });

  describe('getAttributes', function() {
    it('should call the correct endpoint', function() {
      stubApiRequest()

      var node = {parent: '/a', name: 'a.txt'};
      blnApi.getAttributes(node, sinon.spy());
      blnApiRequest.sendRequest.should.have.been.calledWith('get', '/node/attributes', {p: '/a/a.txt'});
    });

    it('should accept an optional parameter \'attributes\'', function() {
      stubApiRequest()

      var node = {parent: '/a', name: 'a.txt'};
      var attributes = ['hash', 'parent', 'version'];
      blnApi.getAttributes(node, attributes, sinon.spy());
      blnApiRequest.sendRequest.should.have.been.calledWith('get', '/node/attributes', {p: '/a/a.txt', attributes: attributes});
    });

    it('should call the callback with the recieved attributes', function(done) {
      var expectedResult = {status: 200, data: {hash: 'asd', version: '4'}};
      stubApiRequest(expectedResult);

      var node = {parent: '/a', name: 'a.txt'};
      blnApi.getAttributes(node, (err, attributes) => {
        assert.equal(err, null);
        assert.equal(attributes, expectedResult.data);

        done();
      });
    });
  });

  describe('renameNode', function() {
    it('should call the correct endpoint', function() {
      stubApiRequest();

      var node = {remoteId: '1', name: 'newName'};
      blnApi.renameNode(node, sinon.spy());

      blnApiRequest.sendRequest.should.have.been.calledWith('post', '/node/name', {name: node.name, id: node.remoteId});
    });
  });

  describe('moveNode', function() {
    it('should call the correct endpoint', function() {
      stubApiRequest();

      var node = {remoteId: '1', parent: '/a'};
      blnApi.moveNode(node, sinon.spy());

      blnApiRequest.sendRequest.should.have.been.calledWith('post', '/node/move', {destp: node.parent, id: node.remoteId});
    });
  });

  describe('deleteNode', function() {
    it('should call the correct endpoint', function() {
      stubApiRequest();

      var node = {remoteId: '1'};
      blnApi.deleteNode(node, sinon.spy());

      blnApiRequest.sendRequest.should.have.been.calledWith('delete', '/node', {id: node.remoteId});
    });
  });

  describe('uploadFile', function() {
    before(function() {
      sinon.stub(fsWrap, 'existsSync').callsFake(function(path) {
        return path === '/a.txt';
      });
      sinon.stub(transferDb, 'getUploadByTransferId').callsFake(function(transferId, callback) {
        var newTransfer = {
          type: 'upload',
          transferId,
          chunkgroup: utility.uuid4(),
          chunksComplete: 0,
          created: new Date()
        }

        callback(null, newTransfer);
      });
      sinon.stub(transferDb, 'remove').callsFake(function(id, callback) {
        callback(null);
      });
      sinon.stub(transferDb, 'update').callsFake(function(id, newTransfer, callback){
        callback(null);
      })
    });

    it('should call the correct endpoint', function() {
      stubApiRequest();

      var node = {name: 'a.txt', parent: '/'};
      blnApi.uploadFile(node, sinon.spy());

      blnApiRequest.sendRequest.should.have.been.calledWith('put', '/file/chunk', {
        chunkgroup: '58a5fae2-431a-4fbb-83f3-5c4f4fb9773c',
        chunks: 1,
        index: 1,
        p: '/a.txt',
        size: 2
      });
    });

    it('should return the request result', function(done) {
      var expectedResult = {status: 201, data: '58760130a641e6ff1a8b45bf'};
      stubApiRequest(expectedResult);

      var node = {name: 'a.txt', parent: '/'};

      blnApi.uploadFile(node, (err, result) => {
        assert.equal(err, null);
        assert.equal(result, expectedResult);

        done();
      });
    });

    it('should return an error if source file does not exist', function(done) {
      stubApiRequest();

      var node = {name: 'b.txt', parent: '/'};

      blnApi.uploadFile(node, (err, result) => {
        assert.equal(result, undefined);
        assert.equal(err.code, 'E_BLN_API_UPLOAD_SRC_NOTEXISTS');

        done();
      });
    });

    after(function() {
      fsWrap.existsSync.restore();
      transferDb.getUploadByTransferId.restore();
      transferDb.remove.restore();
      transferDb.update.restore();
    });
  });

  describe('downloadFile', function() {
    before(function() {
      sinon.stub(transferDb, 'getDownloadByTransferId').callsFake(function(transferId, callback) {
        var result = {
          activeTransfer: {
            type: 'download',
            transferId,
            tempName: utility.uuid4(),
            created: new Date()
          },
          offset: 0
        };

        callback(null, result);
      });
    });

    sinon.stub(fsWrap, 'existsSyncTemp').callsFake(function() { return false});

    it('should call the correct endpoint', function(done) {
      stubApiRequest();

      var node = {remoteId: '1', parent: '/', name: 'a.txt'};
      blnApi.downloadFile('1', 1, node, sinon.spy());

      blnApiRequest.sendStreamingRequest.should.have.been.calledWith('get', '/node', {id: node.remoteId, download: true, offset: 0});

      setTimeout(done, 2);
    });

    after(function() {
      transferDb.getDownloadByTransferId.restore();
      fsWrap.existsSyncTemp.restore();
    })
  });

  describe('nodeDelta', function() {
    it('should call the correct endpoint', function() {
      stubApiRequest();

      blnApi.nodeDelta({cursor: 'a'}, sinon.spy());

      blnApiRequest.sendRequest.should.have.been.calledWith('get', '/node/delta', {attributes: ['parent', 'hash', 'version', 'size'], cursor: 'a'});
    });

    it('should be possible to get delta without params set', function() {
      stubApiRequest();

      blnApi.nodeDelta(sinon.spy());

      blnApiRequest.sendRequest.should.have.been.calledWith('get', '/node/delta', {attributes: ['parent', 'hash', 'version', 'size']});
    });

    it('should set the correct params', function() {
      stubApiRequest();

      blnApi.nodeDelta({id: '12'}, sinon.spy());

      blnApiRequest.sendRequest.should.have.been.calledWith('get', '/node/delta', {attributes: ['parent', 'hash', 'version', 'size'], id: '12'});
    });

    it('should unset a undefined cursor', function() {
      stubApiRequest();

      blnApi.nodeDelta({cursor: undefined}, sinon.spy());

      blnApiRequest.sendRequest.should.have.been.calledWith('get', '/node/delta', {attributes: ['parent', 'hash', 'version', 'size']});
    });
  });

  afterEach(function() {
    fs.createReadStream.restore();
    blnApiRequest.sendRequest.restore();
    blnApiRequest.sendStreamingRequest.restore();
  });

  after(function() {
    mockdate.reset();
    fsWrap.createWriteStream.restore();
    fsWrap.lstatSync.restore();
    utility.uuid4.restore();
  });
});
