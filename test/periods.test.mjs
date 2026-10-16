import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodOf } from '../src/periods.js';

test('dates map to wars by official ranges', () => {
  assert.equal(periodOf('1948-05-15').key, 'independence');
  assert.equal(periodOf('1967-06-06').key, 'sixday');
  assert.equal(periodOf('1973-10-06').key, 'yomkippur');
  assert.equal(periodOf('2023-10-07').key, 'swords');
  assert.equal(periodOf('1938-10-30').key, 'prestate');
});

test('dates outside every war are "between wars"', () => {
  assert.equal(periodOf('1994-10-10').key, 'other');
  assert.equal(periodOf('1967-06-11').key, 'other');
});
