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
    },
    {
      'title': 'Download is not rescheduled if node delta contains a newer version',
      'fixtures': 'apply-errors/test-2'
    }
  ];

  tests.forEach(function(test) {
    it(test.title + ' (' + test.fixtures.replace('conflicts/', '') + ')', testFactory(test));
  });

  after(function() {
    mockdate.reset();
  });
});
