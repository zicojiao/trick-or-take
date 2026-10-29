import test from 'node:test';
import assert from 'node:assert/strict';

const controls = await import('../public/party/controls.mjs').catch(() => ({}));
const {createHoldInput, createLocalClock} = controls;

test('the first primary pointer owns the hold and another finger cannot steal or release it', () => {
  const input = createHoldInput();
  assert.equal(input.held, false); assert.equal(input.pointerId, null);
  assert.equal(input.pressPointer(7), true);
  assert.equal(input.pressPointer(8, false), false);
  assert.equal(input.pressPointer(8, true), false);
  assert.equal(input.pointerId, 7);
  assert.equal(input.releasePointer(8), false);
  assert.equal(input.held, true);
  assert.equal(input.releasePointer(7), true);
  assert.equal(input.held, false); assert.equal(input.pointerId, null);
});

test('pointer and Space ownership overlap without either release cancelling the other', () => {
  const input = createHoldInput();
  input.pressPointer(1); input.pressKey('Space');
  input.releasePointer(1);
  assert.equal(input.held, true); assert.equal(input.pointerId, null);
  input.pressPointer(2); input.releaseKey('Space');
  assert.equal(input.held, true); assert.equal(input.pointerId, 2);
  input.releasePointer(2); assert.equal(input.held, false);
  input.pressKey('Space'); input.pressPointer(3);
  input.releaseKey('Space'); assert.equal(input.held, true);
});

test('only Space controls the keyboard hold and repeated keydown is idempotent', () => {
  const input = createHoldInput();
  for (const code of ['Enter', 'KeyW', ' ', 'Spacebar', '', undefined]) {
    assert.equal(input.pressKey(code), false); assert.equal(input.releaseKey(code), false);
  }
  assert.equal(input.held, false);
  assert.equal(input.pressKey('Space'), true); assert.equal(input.pressKey('Space'), false);
  assert.equal(input.releaseKey('Enter'), false); assert.equal(input.held, true);
  assert.equal(input.releaseKey('Space'), true); assert.equal(input.releaseKey('Space'), false);
  assert.equal(input.held, false);
});

test('clearing on blur releases both owners and stale releases cannot affect a new pointer', () => {
  const input = createHoldInput();
  input.pressPointer(1); input.pressKey('Space'); input.clear();
  assert.equal(input.held, false); assert.equal(input.pointerId, null);
  assert.equal(input.releaseKey('Space'), false);
  input.pressPointer(2); input.releasePointer(1);
  assert.equal(input.held, true); assert.equal(input.pointerId, 2);
  input.clear(); input.clear(); assert.equal(input.held, false);
});

test('invalid pointer identifiers do not acquire input ownership', () => {
  const input = createHoldInput();
  for (const id of [null, undefined, NaN, Infinity, -Infinity, -1, 1.5, '1']) {
    assert.equal(input.pressPointer(id), false);
    assert.equal(input.releasePointer(id), false);
  }
  assert.equal(input.pressPointer(0), true); assert.equal(input.pointerId, 0);
});

test('the local clock anchors its first frame and preserves fractional 60fps elapsed time', () => {
  const clock = createLocalClock(100000);
  assert.equal(clock.paused, false); assert.equal(clock.now, 100000);
  assert.deepEqual(clock.tick(200), {now: 100000, autoPaused: false});
  for (let i = 1; i <= 600; i++) clock.tick(200 + i * 1000 / 60);
  assert.equal(clock.now, 110000);
  assert.equal(Number.isSafeInteger(clock.now), true);
});

test('pause and resume discard hidden elapsed time and establish a fresh frame anchor', () => {
  const clock = createLocalClock(0);
  clock.tick(0); clock.tick(100); clock.pause();
  assert.equal(clock.paused, true);
  assert.deepEqual(clock.tick(60000), {now: 100, autoPaused: false});
  clock.resume(); assert.equal(clock.paused, false);
  assert.deepEqual(clock.tick(60100), {now: 100, autoPaused: false});
  assert.deepEqual(clock.tick(60140), {now: 140, autoPaused: false});
});

test('a frame gap above 500ms automatically pauses without adding the stalled time', () => {
  const clock = createLocalClock(5000);
  clock.tick(100); clock.tick(120);
  assert.deepEqual(clock.tick(621), {now: 5020, autoPaused: true});
  assert.equal(clock.paused, true);
  assert.deepEqual(clock.tick(10000), {now: 5020, autoPaused: false});
  clock.resume(); clock.tick(10020); clock.tick(10040);
  assert.equal(clock.now, 5040);
});

test('500ms frames are allowed and duplicate or backward timestamps cannot double count time', () => {
  const clock = createLocalClock(0);
  clock.tick(1000);
  assert.deepEqual(clock.tick(1500), {now: 500, autoPaused: false});
  assert.deepEqual(clock.tick(1500), {now: 500, autoPaused: false});
  assert.deepEqual(clock.tick(1400), {now: 500, autoPaused: false});
  assert.deepEqual(clock.tick(1510), {now: 510, autoPaused: false});
});

test('reset clears a paused clock and its old frame anchor while retaining fractional time', () => {
  const clock = createLocalClock(0.75);
  clock.tick(0); clock.tick(0.5);
  assert.equal(clock.now, 1);
  clock.pause(); clock.reset(100.75);
  assert.equal(clock.paused, false); assert.equal(clock.now, 100);
  clock.tick(10000); clock.tick(10000.5);
  assert.equal(clock.now, 101);
});

test('clock inputs must be finite nonnegative safe-range numbers and rejection leaves state unchanged', () => {
  for (const value of [NaN, Infinity, -Infinity, -1, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createLocalClock(value), /time/);
  }
  const clock = createLocalClock(20); clock.tick(100); clock.tick(110);
  for (const value of [NaN, Infinity, -Infinity, -1, '1', undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => clock.tick(value), /time/);
    assert.throws(() => clock.reset(value), /time/);
    assert.equal(clock.now, 30); assert.equal(clock.paused, false);
  }
  clock.tick(120); assert.equal(clock.now, 40);
});
