var testFactory = require('./lib/test-factory.js');
var mockdate = require('mockdate');

describe('apply-errors', function() {
  before(function() {
    mockdate.set('1/20/2017');
  });

  var tests = [
    {
      'title': 'Download with EPERM is rescheduled',
      'fixtures': 'apply-errors/test-1'
    }
  ];

  tests.forEach(function(test) {
    it(test.title + ' (' + test.fixtures.replace('conflicts/', '') + ')', testFactory(test));
  });

  after(function() {
    mockdate.reset();
  });
});
