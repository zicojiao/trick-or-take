import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRoom, applyCommand, publicRoom, WARNING_MS} from '../public/party/engine.mjs';
import {createHoldInput} from '../public/party/controls.mjs';
import {pollCommand} from '../public/party/input.mjs';

const source = await readFile(new URL('../public/party/app.mjs', import.meta.url), 'utf8');

// Execute the real browser command handler with only its network/UI boundaries
// substituted. Loading this function avoids a synthetic DOM or RTC SDK in a
// session-policy test; all branching and request-generation code remains real.
function client(respond, appSource = source) {
  const start = appSource.indexOf('async function command(');
  const end = appSource.indexOf('\nasync function roomAction(', start);
  assert.ok(start >= 0 && end > start, 'the app command handler must be available');
  const state = {
    session: {code: 'ABC234', playerId: 'a'.repeat(32), token: 'b'.repeat(64)},
    room: {code: 'ABC234', ownerId: 'a'.repeat(32), phase: 'lobby', version: 1},
    localRoom: null, epoch: 1, offset: 0, online: true,
    calls: [], messages: [], resets: 0,signaling:{pulse(){}},
    Date,
  };
  Object.assign(state, {
    api: async (action, body, identity) => {
      state.calls.push({action, body, identity});
      return respond(body.command);
    },
    accept: data => {state.room = data.room;},
    resetRoom: () => {state.room = state.session = null; state.epoch += 1; state.resets += 1;},
    errorCopy: error => error.code,
    toast: message => {state.messages.push(message);},
    clearHold: () => {}, render: () => {},
  });
  const context = vm.createContext(state);
  vm.runInContext(appSource.slice(start, end), context, {filename: 'app-command-under-test.mjs'});
  return {state, command: context.command};
}

test('a stale owner action preserves the authenticated seat and polling can update ownership', async () => {
  const nextRoom = {code: 'ABC234', ownerId: 'c'.repeat(32), phase: 'lobby', version: 2};
  const {state, command} = client(async request => {
    if (request.type === 'start') throw Object.assign(new Error('owner_only'), {code: 'owner_only', status: 403});
    return {room: nextRoom};
  });
  const identity = state.session;
  await command({type: 'start'});
  assert.equal(state.resets, 0, 'a management denial must not revoke membership');
  assert.equal(state.session, identity);
  assert.deepEqual(state.messages, ['owner_only']);
  await command({type: 'heartbeat'}, {silent: true});
  assert.equal(state.room.ownerId, 'c'.repeat(32));
  assert.equal(state.calls.length, 2);
  assert.equal(state.calls[1].identity, identity);
  assert.equal(state.calls[1].body.playerId, identity.playerId);
});

test('an actual membership rejection still clears the expired seat', async () => {
  const {state, command} = client(async () => {
    throw Object.assign(new Error('invalid_membership'), {code: 'invalid_membership', status: 401});
  });
  await command({type: 'heartbeat'}, {silent: true});
  assert.equal(state.resets, 1);
  assert.equal(state.session, null);
  assert.equal(state.room, null);
  assert.deepEqual(state.messages, ['invalid_membership']);
});

test('a delayed obsolete response cannot rewind the clock offset of a newer snapshot', async () => {
  let respond;
  const delayed = new Promise(resolve => {respond = resolve;});
  const {state, command} = client(() => delayed);
  state.Date = {now: () => 1000};
  const pending = command({type: 'heartbeat'});
  // Another request completed first and supplied the newer state and clock.
  state.room = {...state.room, version: 4};
  state.offset = 23;
  respond({room: {...state.room, version: 2}, serverNow: 10});
  await pending;
  assert.equal(state.offset, 23, 'ignoring a stale snapshot must also ignore its clock sample');
  assert.equal(state.room.version, 4);
});

test('a catch safety release supersedes an outstanding press in either delivery order', () => {
  const start = source.indexOf('function accept(data) {');
  const end = source.indexOf('async function command(', start);
  assert.ok(start >= 0 && end > start, 'the app snapshot handler must be available');
  for (const pressFirst of [true, false]) {
    const server = createRoom({code: 'SOLO', mode: 'solo', seed: 712, player: {id: 'you', name: 'You'}}, 100000);
    applyCommand(server, 'you', {type: 'ready', ready: true}, 100000);
    applyCommand(server, 'you', {type: 'start'}, 100000);
    applyCommand(server, 'you', {type: 'hold', held: true, seq: 1, roundIndex: 0}, 103100);
    server.version = 1;
    const before = publicRoom(server, 'you', 103100);
    const catchAt = server.nextLookAt + server.nextWarningMs;
    for (let at = 104000; at < catchAt; at += 1000) applyCommand(server, 'you', {type: 'heartbeat'}, at);
    applyCommand(server, 'you', {type: 'heartbeat'}, catchAt);
    server.version = 2;
    const caught = publicRoom(server, 'you', catchAt);
    assert.equal(caught.players[0].catches, 1);

    const input = createHoldInput(); input.pressPointer(1);
    const state = {
      room: before, session: {playerId: 'you'},
      seq: 3, holding: true, input, // Release 2 and press 3 are still in flight.
      lastSuccess: 0, online: true, lastEvent: 999, localRoom: null, Date,lastSignalEvent:0,signaling:{pulse(){}},
      score: player => Math.floor(player?.score || 0), now: () => catchAt,
      saveSession() {}, render() {}, sound() {}, feedback() {}, tr: english => english,
    };
    const context = vm.createContext(state);
    vm.runInContext(`function mine() {return room.players.find(player => player.id === session.playerId);}\n${source.slice(start, end)}`,
      context, {filename: 'app-accept-under-test.mjs'});
    context.accept({room: caught});
    const retry = pollCommand(state.room, 'you', state.holding, state.seq);
    assert.equal(state.holding, false);
    assert.equal(input.held, false);
    assert.equal(retry.command.held, false);
    assert.ok(retry.command.seq > 3, 'the forced release must supersede the pending press');

    const delayedPress = {type: 'hold', held: true, seq: 3, roundIndex: 0};
    const at = caught.players[0].stunnedUntil + 1;
    const commands = pressFirst ? [delayedPress, retry.command] : [retry.command, delayedPress];
    for (let i = 0; i < commands.length; i++) applyCommand(server, 'you', commands[i], at + i);
    assert.equal(server.players[0].holding, false, `pressFirst=${pressFirst}`);
  }
});
