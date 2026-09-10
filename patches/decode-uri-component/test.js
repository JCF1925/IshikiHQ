'use strict';

var assert = require('node:assert/strict');
var test = require('node:test');
var decodeUriComponent = require('./index');

test('decodes percent-encoded and plus-encoded spaces', function () {
  assert.equal(decodeUriComponent('Ishiki%20Mobile'), 'Ishiki Mobile');
  assert.equal(decodeUriComponent('Ishiki+Mobile'), 'Ishiki Mobile');
});

test('preserves malformed percent sequences without throwing', function () {
  assert.equal(decodeUriComponent('%E0%A4%A'), '%E0%A4%A');
  assert.equal(decodeUriComponent('%C3%A5%E0%A4%A'), 'å%E0%A4%A');
});

test('handles a large malformed input without recursive fallback', function () {
  var malformed = '%E0%A4'.repeat(100000);
  assert.equal(decodeUriComponent(malformed), malformed);
});