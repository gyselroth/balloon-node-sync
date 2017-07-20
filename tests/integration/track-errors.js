var testFactory = require('./lib/test-factory.js');
var mockdate = require('mockdate');

describe('track-errors', function() {
  before(function() {
    mockdate.set('2017-01-20T00:00:00.000Z');
  });

  var tests = [
    {
      'title': 'Download with EPERM is rescheduled',
      'fixtures': 'track-errors/test-1'
    }
  ];

  tests.forEach(function(test) {
    it(test.title + ' (' + test.fixtures.replace('conflicts/', '') + ')', testFactory(test));
  });

  after(function() {
    mockdate.reset();
  });
});
