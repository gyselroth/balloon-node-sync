var testFactory = require('./lib/test-selective-factory.js');
var mockdate = require('mockdate');

describe('selective', function() {
  before(function() {
    mockdate.set('1/20/2017');
  });

  var tests = [
   {
      'title': 'removes a collection when it is newly ignored',
      'fixtures': 'selective/test-1'
    },
    {
      'title': 'removes a collection recursively when it is newly ignored',
      'fixtures': 'selective/test-2'
    },
    {
      'title': 'keeps localy created nodes in newly ignored collection',
      'fixtures': 'selective/test-3'
    },
    {
      'title': 'keeps localy changed nodes in newly ignored collection',
      'fixtures': 'selective/test-4'
    },
    {
      'title': 'keeps localy deleted and recreated nodes in newly ignored collection',
      'fixtures': 'selective/test-5'
    },
    {
      'title': 'adds unignored collection to syncDb and forces download at next sync cycle',
      'fixtures': 'selective/test-6'
    },
  ];

  tests.forEach(function(test) {
    it(test.title + ' (' + test.fixtures.replace('local/', '') + ')', testFactory(test));
  });

  after(function() {
    mockdate.reset();
  });
});
