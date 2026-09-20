// Frani Channel Pass — unit tests for membership, expiry stacking, and access.

import assert from 'node:assert/strict';
import {
  newState,
  extendExpiry,
  grantPass,
  isActiveMember,
  cancelMembership,
  activeMembers,
  addPost,
  membershipStatus,
} from '../src/channel.js';
import { toBaseUnits } from '../src/amounts.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok -', name);
  } catch (err) {
    console.error('FAIL -', name);
    console.error(err);
    process.exitCode = 1;
  }
}

const DAY = 86400000;

function fresh() {
  return newState({ channelName: 'Test', network: 'testnet2' });
}

test('grantPass activates a member for the pass duration', () => {
  const s = fresh();
  const now = 1_000_000_000_000;
  grantPass(s, 'alice', { days: 30, paidBase: toBaseUnits('5', 8) }, now);
  assert.equal(isActiveMember(s, 'alice', now + DAY), true);
  assert.equal(isActiveMember(s, 'alice', now + 31 * DAY), false);
});

test('paying again stacks days from current expiry', () => {
  const now = 1_000_000_000_000;
  const cur = now + 10 * DAY;
  const next = extendExpiry(cur, 30, now);
  assert.equal(next, cur + 30 * DAY); // extends from the future expiry, not now
});

test('paying after expiry stacks from now', () => {
  const now = 1_000_000_000_000;
  const expired = now - DAY;
  const next = extendExpiry(expired, 30, now);
  assert.equal(next, now + 30 * DAY);
});

test('grantPass accumulates totalPaid and extends', () => {
  const s = fresh();
  const now = 1_000_000_000_000;
  grantPass(s, 'bob', { days: 30, paidBase: toBaseUnits('5', 8) }, now);
  grantPass(s, 'bob', { days: 30, paidBase: toBaseUnits('5', 8) }, now + DAY);
  assert.equal(s.members.bob.totalPaidBase, toBaseUnits('10', 8));
  // second grant extends from first expiry
  assert.ok(s.members.bob.expiresAt > now + 59 * DAY);
});

test('cancel stops access', () => {
  const s = fresh();
  const now = 1_000_000_000_000;
  grantPass(s, 'carol', { days: 30, paidBase: '1' }, now);
  cancelMembership(s, 'carol');
  assert.equal(isActiveMember(s, 'carol', now + DAY), false);
});

test('activeMembers excludes expired and cancelled', () => {
  const s = fresh();
  const now = 1_000_000_000_000;
  grantPass(s, 'a', { days: 30, paidBase: '1' }, now);
  grantPass(s, 'b', { days: 30, paidBase: '1' }, now - 40 * DAY); // expired
  grantPass(s, 'c', { days: 30, paidBase: '1' }, now);
  cancelMembership(s, 'c');
  const active = activeMembers(s, now + DAY);
  assert.deepEqual(active.map((m) => m.pubkey), ['a']);
});

test('addPost increments ids', () => {
  const s = fresh();
  const p1 = addPost(s, 'hello');
  const p2 = addPost(s, 'world');
  assert.equal(p1.id, 'POST-0001');
  assert.equal(p2.id, 'POST-0002');
  assert.equal(s.posts.length, 2);
});

test('membershipStatus reports days left', () => {
  const s = fresh();
  const now = 1_000_000_000_000;
  grantPass(s, 'd', { days: 10, paidBase: '1' }, now);
  const st = membershipStatus(s, 'd', now);
  assert.equal(st.active, true);
  assert.equal(st.daysLeft, 10);
});

console.log(`\n${passed} checks passed.`);
