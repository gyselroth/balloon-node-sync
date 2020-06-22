var testFactory = require('./lib/test-factory.js');
var mockdate = require('mockdate');

describe('ignore', function() {
  before(function() {
    mockdate.set('1/20/2017');
  });

  var tests = [
    {
      'title': 'ignores remotely created nodes if they are at an ignored path',
      'fixtures': 'ignore/test-1'
    },
    {
      'title': 'ignores remotely created nodes if they are at an ignored path',
      'fixtures': 'ignore/test-2'
    },
    {
      'title': 'ignores changes to local nodes if they are at an ignored path',
      'fixtures': 'ignore/test-3'
    },
    {
      'title': 'ignores created local nodes if they are at an ignored path',
      'fixtures': 'ignore/test-4'
    },
    {
      'title': 'creates local nodes if ignored path has been localy renamed',
      'fixtures': 'ignore/test-5'
    },
    {
      'title': 'should not remotely delete nodes which are at an ignored path',
      'fixtures': 'ignore/test-6'
    },
  ];

  tests.forEach(function(test) {
    it(test.title + ' (' + test.fixtures.replace('local/', '') + ')', testFactory(test));
  });

  after(function() {
    mockdate.reset();
  });
});
