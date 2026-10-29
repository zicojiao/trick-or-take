import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom, joinRoom, advanceRoom, applyCommand, publicRoom} from '../public/party/engine.mjs';

const player = id => ({id, name: `Friend ${id}`, avatar: 0, uid: Number(id.slice(1)) + 1, tokenHash: `secret-${id}`});
function roomWith(count = 3, options = {}) {
  const room = createRoom({code: 'ABC234', player: player('p0'), seed: 12345, ...options}, 0);
  for (let i = 1; i < count; i++) joinRoom(room, player(`p${i}`), 0);
  return room;
}
function playing(count = 3, options = {}) {
  const room = roomWith(count, options);
  for (const p of room.players) applyCommand(room, p.id, {type: 'ready', ready: true}, 0);
  applyCommand(room, 'p0', {type: 'start'}, 0);
  advanceRoom(room, 3000);
  return room;
}
function heartbeatAll(room, until) {
  for (let at = room.lastTick + 1000; at < until; at += 1000) {
    for (const p of room.players.filter(p => !p.left)) applyCommand(room, p.id, {type: 'heartbeat'}, at);
  }
  for (const p of room.players.filter(p => !p.left)) applyCommand(room, p.id, {type: 'heartbeat'}, until);
  return room;
}
function hold(room, id, held, seq, at, roundIndex = room.roundIndex) {
  return applyCommand(room, id, {type: 'hold', held, seq, roundIndex}, at);
}
function nextWarning(room) {
  while (room.attention !== 'warning' && room.lastTick < room.endsAt) heartbeatAll(room, room.lastTick + 100);
  assert.equal(room.attention, 'warning');
  return room.lookAt;
}
function safeFinish(remaining) {
  for (let seed = 1; seed <= 100; seed++) {
    const room = playing(2, {seed});
    hold(room, 'p0', true, 1, 3000); hold(room, 'p0', false, 2, 3500);
    advanceRoom(room, room.endsAt - remaining);
    const nextWatch = room.attention === 'away' ? room.nextLookAt + room.nextWarningMs : room.lookAt;
    if (room.attention !== 'watching' && nextWatch >= room.endsAt) return room;
  }
  assert.fail('a seeded schedule must provide a safe final stealing window');
}

test('online matches require two to six ready players and only the owner can start', () => {
  const room = roomWith(1);
  assert.equal(room.gameVersion, 6); assert.equal(room.mode, 'online');
  assert.throws(() => applyCommand(room, 'p0', {type: 'start'}, 0), /not_enough_players/);
  joinRoom(room, player('p1'), 0);
  assert.throws(() => applyCommand(room, 'p1', {type: 'start'}, 0), /owner_only/);
  assert.throws(() => applyCommand(room, 'p0', {type: 'start'}, 0), /players_not_ready/);
  for (let i = 2; i < 6; i++) joinRoom(room, player(`p${i}`), 0);
  assert.throws(() => joinRoom(room, player('p6'), 0), /room_full/);
  for (const p of room.players) applyCommand(room, p.id, {type: 'ready', ready: true}, 0);
  applyCommand(room, 'p0', {type: 'start'}, 0);
  assert.equal(room.phase, 'countdown'); assert.equal(room.startsAt, 3000); assert.equal(room.guardianId, 'hostess');
  assert.throws(() => joinRoom(room, player('p7'), 0), /match_in_progress/);
});

test('local solo has exactly one human thief and needs no bot or network seat', () => {
  const room = playing(1, {mode: 'solo'});
  assert.equal(room.mode, 'solo'); assert.equal(room.players.length, 1); assert.equal(room.guardianId, 'hostess');
  hold(room, 'p0', true, 1, 3000); hold(room, 'p0', false, 2, 3500);
  assert.equal(room.players[0].score, 3.375);
  assert.throws(() => joinRoom(roomWith(1, {mode: 'solo'}), player('p1'), 0), /room_full/);
});

test('one match lasts sixty seconds and the NPC never rotates a human into guarding', () => {
  const room = playing();
  assert.equal(room.endsAt - room.startsAt, 60000);
  heartbeatAll(room, room.endsAt - 1);
  assert.equal(room.phase, 'playing'); assert.equal(room.guardianId, 'hostess'); assert.equal(room.roundIndex, 0);
  heartbeatAll(room, room.endsAt);
  assert.equal(room.phase, 'finished'); assert.equal(room.roundIndex, 0);
  advanceRoom(room, room.lastTick + 100000); assert.equal(room.phase, 'finished');
});

test('every human including the owner can steal and bank in the same match', () => {
  const room = playing(6);
  for (const p of room.players) hold(room, p.id, true, 1, 3000);
  for (const p of room.players) hold(room, p.id, false, 2, 3500);
  assert.equal(room.players.every(p => p.score === 3.375 && !p.holding), true);
  assert.equal(room.players.some(p => p.id === room.guardianId), false);
});

test('stealing ramps from six to twelve per second and only a release banks it', () => {
  const room = playing(); hold(room, 'p0', true, 1, 3000);
  heartbeatAll(room, 4000); assert.equal(room.players[0].pending, 7.5); assert.equal(room.players[0].score, 0);
  heartbeatAll(room, 5000); assert.equal(room.players[0].pending, 18);
  hold(room, 'p0', false, 2, 5300);
  assert.ok(Math.abs(room.players[0].score - 21.6) < 1e-9); assert.equal(room.players[0].pending, 0);
});

test('whole held candy never rounds a fractional treat above the authoritative total', () => {
  const room = playing(1, {mode: 'solo', seed: 1});
  hold(room, 'p0', true, 1, 3000);
  const snapshot = publicRoom(room, 'p0', 3160);
  assert.ok(Math.abs(room.players[0].pending - 0.9984) < 1e-9);
  assert.equal(snapshot.players[0].pending, 1, 'the animation balance retains its legacy rounded precision');
  assert.equal(snapshot.players[0].wholePending, 0);
  assert.equal(snapshot.players[0].wholeCandy, 0);
  hold(room, 'p0', false, 2, 3160);
  assert.equal(publicRoom(room, 'p0', 3160).players[0].wholeCandy, 0);
});

test('public whole candy uses the raw total and cannot drop when rounded fractions are banked', () => {
  const room = playing(1, {mode: 'solo', seed: 1});
  hold(room, 'p0', true, 1, 3000); hold(room, 'p0', false, 2, 3500);
  hold(room, 'p0', true, 3, 3500);
  const held = publicRoom(room, 'p0', 3600).players[0];
  assert.equal(held.score, 3.38); assert.equal(held.pending, 0.62);
  assert.equal(Math.floor(held.score + held.pending), 4, 'separately rounded fields are not an authoritative whole total');
  assert.equal(held.wholeCandy, 3);
  hold(room, 'p0', false, 4, 3600);
  const banked = publicRoom(room, 'p0', 3600).players[0];
  assert.equal(banked.score, 3.99); assert.equal(banked.pending, 0);
  assert.equal(banked.wholeCandy, held.wholeCandy, 'a release at the same time only moves candy between hand and bank');
});

test('the NPC automatically warns and watches with bounded variable timing and switches chores', () => {
  const room = playing(); const lookAt = nextWarning(room);
  const warning = room.events.find(e => e.type === 'warning');
  assert.ok(warning.at - room.startsAt >= 1400 && warning.at - room.startsAt <= 8000);
  assert.ok(lookAt-warning.at>=950&&lookAt-warning.at<=1400);
  heartbeatAll(room, lookAt); assert.equal(room.attention, 'watching');
  assert.ok(room.watchUntil - lookAt >= 1000 && room.watchUntil - lookAt <= 1800);
  const end = room.watchUntil; heartbeatAll(room, end);
  assert.equal(room.attention, 'away'); assert.equal(room.activity, 'cleaning');
  const secondLook = nextWarning(room); const secondWarning = room.events.filter(e => e.type === 'warning').at(-1);
  assert.ok(secondWarning.at - end >= 1400 && secondWarning.at - end <= 8000);
  heartbeatAll(room, secondLook); heartbeatAll(room, room.watchUntil); assert.equal(room.activity, 'cooking');
});

test('equal seeds replay the NPC schedule while different seeds change its turns', () => {
  const timeline = seed => {
    const room = playing(2, {seed}); const turns = []; let eventId = 0;
    for (let at = 3100; at <= room.endsAt; at += 100) {
      advanceRoom(room, at);
      for (const e of room.events) if (e.id > eventId && e.type === 'warning') turns.push(e.at);
      eventId = room.eventSeq;
    }
    return turns;
  };
  assert.deepEqual(timeline(781), timeline(781)); assert.notDeepEqual(timeline(781), timeline(782));
  assert.ok(timeline(781).length >= 7);
});

test('release before the NPC watch boundary escapes; holding at it is caught without elimination', () => {
  const safe = playing(); const caught = playing(); const at = nextWarning(safe);
  assert.equal(nextWarning(caught), at);
  hold(safe, 'p0', true, 1, at - 400); hold(caught, 'p0', true, 1, at - 400);
  hold(safe, 'p0', false, 2, at - 1); heartbeatAll(safe, at); heartbeatAll(caught, at);
  assert.ok(safe.players[0].score > 0); assert.equal(safe.players[0].stunnedUntil, 0);
  assert.equal(caught.players[0].score, 0); assert.equal(caught.players[0].pending, 0);
  assert.equal(caught.players[0].stunnedUntil, at + 1800); assert.equal(caught.players[0].catches, 1);
  assert.equal(caught.players[0].left, false); assert.equal(caught.players.slice(1).every(p => p.score === 0), true);
});

test('a new hold while watched confiscates banked candy and the thief can earn again after the stun', () => {
  const room = playing(); hold(room, 'p0', true, 1, 3000); hold(room, 'p0', false, 2, 3500);
  const banked = room.players[0].score; const at = nextWarning(room); heartbeatAll(room, at);
  hold(room, 'p0', true, 3, at);
  assert.equal(room.players[0].score, 0); assert.equal(room.players[0].roundScore, 0);
  assert.equal(room.players[0].pending, 0); assert.equal(room.players[0].stunnedUntil, at + 1800);
  const caught = room.events.findLast(event => event.type === 'catch');
  assert.deepEqual(caught, {id: caught.id, type: 'catch', at, playerId: 'p0', guardianId: 'hostess',
    lost: banked, bankedLost: banked, pendingLost: 0});
  hold(room, 'p0', true, 4, at + 100); assert.equal(room.players[0].catches, 1);
  heartbeatAll(room, at + 1800); hold(room, 'p0', true, 5, room.lastTick); assert.equal(room.players[0].holding, true);
  hold(room, 'p0', false, 6, at + 2300);
  assert.equal(room.players[0].score, 3.375); assert.equal(room.players[0].roundScore, 3.375);
  assert.equal(room.players[0].left, false); assert.equal(room.phase, 'playing');
});

test('watch-boundary capture confiscates the bank and the hand together without affecting other thieves', () => {
  const room = playing(2);
  for (const p of room.players) hold(room, p.id, true, 1, 3000);
  for (const p of room.players) hold(room, p.id, false, 2, 3500);
  const banked = room.players[0].score;
  const at = nextWarning(room);
  hold(room, 'p0', true, 3, at - 400); heartbeatAll(room, at);
  const thief = room.players[0], friend = room.players[1];
  assert.equal(thief.score, 0); assert.equal(thief.roundScore, 0); assert.equal(thief.pending, 0);
  assert.equal(thief.holding, false); assert.equal(thief.heldSince, 0); assert.equal(thief.catches, 1);
  assert.equal(thief.stunnedUntil, at + 1800);
  assert.equal(friend.score, banked); assert.equal(friend.roundScore, banked); assert.equal(friend.catches, 0);
  assert.equal(friend.stunnedUntil, 0);
  const snapshot = publicRoom(room, 'p0', at);
  assert.deepEqual(snapshot.players.map(p => p.wholeCandy), [0, 3]);
  const caught = snapshot.events.findLast(event => event.type === 'catch');
  assert.equal(caught.playerId, 'p0'); assert.equal(caught.at, at);
  assert.equal(caught.bankedLost, banked); assert.ok(Math.abs(caught.pendingLost - 2.64) < 1e-12);
  assert.equal(caught.lost, caught.bankedLost + caught.pendingLost);
  assert.ok(Math.abs(caught.lost - (banked + 2.64)) < 1e-12);
  // A delayed release cannot restore the confiscated hand or bank it twice.
  hold(room, 'p0', false, 4, at + 1); hold(room, 'p0', false, 4, at + 2);
  assert.equal(thief.score, 0); assert.equal(thief.roundScore, 0);
  assert.equal(room.events.filter(event => event.type === 'catch').length, 1);
});

test('confiscation reverses a final lead and equal remaining scores stay tied', () => {
  const room = playing(3);
  for (const p of room.players) hold(room, p.id, true, 1, 3000);
  hold(room, 'p2', false, 2, 3250); hold(room, 'p1', false, 2, 3500); hold(room, 'p0', false, 2, 4000);
  assert.ok(room.players[0].score > room.players[1].score && room.players[1].score > room.players[2].score);
  const at = nextWarning(room);
  hold(room, 'p0', true, 3, at - 400); hold(room, 'p2', true, 3, at - 400);
  heartbeatAll(room, at); heartbeatAll(room, room.endsAt);
  const final = publicRoom(room, 'p1', room.endsAt);
  assert.equal(final.phase, 'finished');
  const standings = [...final.players].sort((a, b) => b.score - a.score);
  assert.deepEqual(standings.map(p => [p.id, p.score]), [['p1', 3.38], ['p0', 0], ['p2', 0]]);
  assert.deepEqual(final.players.map(p => p.roundScore), [0, 3.38, 0]);
  assert.equal(final.players.every(p => p.pending === 0 && !p.holding), true);
  assert.equal(final.players[0].score, final.players[2].score, 'both confiscated players have the same remaining total');
});

test('old input sequences cannot uncover a player who already released', () => {
  const room = playing(); hold(room, 'p0', true, 10, 3000); hold(room, 'p0', false, 11, 3400);
  hold(room, 'p0', true, 10, 3500); assert.equal(room.players[0].holding, false); assert.equal(room.players[0].inputSeq, 11);
  assert.throws(() => hold(room, 'p0', true, 12, 3500, 1), /stale_round/);
});

test('rematches advance the match generation so old-match inputs cannot apply', () => {
  const room = playing(2); hold(room, 'p0', true, 1, 3000); hold(room, 'p0', false, 2, 3500);
  heartbeatAll(room, room.endsAt); applyCommand(room, 'p0', {type: 'again'}, room.lastTick);
  assert.equal(room.phase, 'lobby'); assert.equal(room.players.every(p => !p.ready && p.score === 0), true);
  for (const p of room.players) applyCommand(room, p.id, {type: 'ready', ready: true}, room.lastTick);
  applyCommand(room, 'p0', {type: 'start'}, room.lastTick); assert.equal(room.roundIndex, 1);
  heartbeatAll(room, room.startsAt);
  assert.throws(() => hold(room, 'p0', true, 3, room.lastTick, 0), /stale_round/);
  hold(room, 'p0', true, 3, room.lastTick); assert.equal(room.players[0].holding, true);
});

test('a silent hold expires after 1500ms without banking or a later false catch', () => {
  const room = playing(); hold(room, 'p0', true, 1, 3000);
  advanceRoom(room, 4499); assert.equal(room.players[0].holding, true);
  advanceRoom(room, 4500); assert.equal(room.players[0].holding, false); assert.equal(room.players[0].pending, 0);
  advanceRoom(room, 10000); assert.equal(room.players[0].catches, 0); assert.equal(room.players[0].score, 0);
});

test('an offline owner transfers management while the NPC match continues for others', () => {
  const room = playing();
  for (const at of [3000, 4000, 5000, 6001, 7000]) applyCommand(room, 'p1', {type: 'heartbeat'}, at);
  assert.equal(room.ownerId, 'p1'); assert.equal(room.phase, 'playing'); assert.equal(room.guardianId, 'hostess');
  assert.equal(room.events.some(e => e.type === 'abort'), false); assert.equal(room.endsAt, 63000);
});

test('leaving revokes a seat and transfers ownership without aborting the active match', () => {
  const room = playing(); applyCommand(room, 'p1', {type: 'heartbeat'}, 3500); hold(room, 'p0', true, 1, 3500);
  applyCommand(room, 'p0', {type: 'leave'}, 3600);
  assert.equal(room.ownerId, 'p1'); assert.equal(room.phase, 'playing'); assert.equal(room.players[0].holding, false);
  assert.throws(() => applyCommand(room, 'p0', {type: 'heartbeat'}, 3700), /member_left/);
  assert.throws(() => publicRoom(room, 'p0', 3700), /member_left/);
});

test('a long clock advance exactly matches smaller NPC, lease and terminal advances', () => {
  const room = playing(); hold(room, 'p0', true, 1, 3500);
  const bulk = structuredClone(room); const chunks = structuredClone(room);
  advanceRoom(bulk, 100000);
  for (let at = 3600; at <= 100000; at += 100) advanceRoom(chunks, at);
  assert.deepEqual(bulk, chunks);
});

test('the sixty-second boundary banks a valid hand once and agrees with smaller time advances', () => {
  const room = safeFinish(100);
  hold(room, 'p0', true, 3, room.lastTick); assert.equal(room.players[0].holding, true);
  const chunks = structuredClone(room);
  assert.equal(publicRoom(room, 'p0', room.endsAt - 1).players[0].wholeCandy, 3);
  advanceRoom(room, room.endsAt);
  for (let at = chunks.lastTick + 5; at <= chunks.endsAt; at += 5) advanceRoom(chunks, at);
  assert.deepEqual(room, chunks);
  assert.equal(room.phase, 'finished'); assert.equal(room.players[0].holding, false);
  assert.equal(room.players[0].pending, 0);
  assert.equal(room.players[0].score, 3.99); assert.equal(room.players[0].roundScore, 3.99);
  assert.equal(publicRoom(room, 'p0', room.endsAt).players[0].wholeCandy, 3);
  advanceRoom(room, room.endsAt + 10000);
  assert.equal(room.players[0].score, 3.99); assert.equal(room.players[0].roundScore, 3.99);
  assert.equal(room.events.filter(event => event.type === 'finished').length, 1);
  assert.throws(() => hold(room, 'p0', false, 4, room.lastTick), /round_not_playing/);
});

test('a hold lease expiring before or exactly at the finish cannot bank expired candy', () => {
  for (const remaining of [1501, 1500]) {
    const room = safeFinish(remaining), banked = room.players[0].score;
    hold(room, 'p0', true, 3, room.lastTick);
    advanceRoom(room, room.endsAt);
    assert.equal(room.phase, 'finished'); assert.equal(room.players[0].holding, false);
    assert.equal(room.players[0].pending, 0); assert.equal(room.players[0].catches, 0);
    assert.equal(room.players[0].score, banked); assert.equal(room.players[0].roundScore, banked);
  }
});

test('a real catch just before the finish stays confiscated at settlement', () => {
  let room;
  for (let seed = 1; seed <= 100; seed++) {
    const candidate = playing(2, {seed});
    hold(candidate, 'p0', true, 1, 3000); hold(candidate, 'p0', false, 2, 3500);
    advanceRoom(candidate, candidate.endsAt - 1);
    if (candidate.attention === 'watching') {room = candidate; break;}
  }
  assert.ok(room);
  hold(room, 'p0', true, 3, room.lastTick);
  assert.equal(room.players[0].catches, 1); assert.equal(room.players[0].score, 0);
  advanceRoom(room, room.endsAt);
  const final = publicRoom(room, 'p0', room.endsAt);
  assert.equal(final.phase, 'finished'); assert.equal(final.players[0].score, 0);
  assert.equal(final.players[0].roundScore, 0); assert.equal(final.players[0].pending, 0);
});

test('a newcomer cannot erase a finished score before a rematch', () => {
  const room = playing(2); hold(room, 'p0', true, 1, 3000); hold(room, 'p0', false, 2, 3500);
  heartbeatAll(room, room.endsAt); joinRoom(room, player('p2'), room.lastTick);
  assert.equal(room.phase, 'finished'); assert.equal(room.players[0].score, 3.375); assert.equal(room.ownerId, 'p0');
});

test('public snapshots show thieves but never credentials or the future NPC plan', () => {
  const room = playing(); hold(room, 'p0', true, 1, 3000); const view = publicRoom(room, 'p1', 3400);
  assert.equal(view.guardianId, 'hostess'); assert.equal(view.viewMasked, false); assert.equal(view.players[0].holding, true);
  assert.equal(view.players[0].inputSeq, undefined); assert.equal(view.players[1].inputSeq, -1);
  assert.equal(view.lookAt, 0); assert.equal(view.watchUntil, 0);
  assert.equal(/secret-|tokenHash|rng|seed|nextLook|npcState/i.test(JSON.stringify(view)), false);
  view.players[0].score = 999; view.events[0].type = 'forged';
  assert.equal(room.players[0].score, 0); assert.equal(room.events[0].type, 'join');
});

test('no human can trigger a look or forge malformed commands', () => {
  const room = playing();
  for (const cmd of [
    {type: 'look', roundIndex: 0}, {type: 'hold', held: true, seq: 1, roundIndex: 0, score: 999},
    {type: 'hold', held: 'yes', seq: 1, roundIndex: 0}, {type: 'hold', held: true, seq: -1, roundIndex: 0},
    {type: 'hold', held: true, seq: 1, roundIndex: 0.5}, {type: 'ready', ready: 'yes'},
  ]) assert.throws(() => applyCommand(room, 'p0', cmd, 3000), /invalid_command/);
  assert.throws(() => applyCommand(room, 'unknown', {type: 'heartbeat'}, 3000), /not_a_member/);
  assert.throws(() => roomWith(1, {mode: 'bots'}), /invalid_mode/);
  assert.throws(() => roomWith(1, {seed: 'not-a-seed'}), /invalid_seed/);
});

test('old persisted game versions get an explicit recoverable error', () => {
  for (const version of [undefined, 2]) {
    const room = roomWith();
    if (version === undefined) delete room.gameVersion;
    else room.gameVersion = version;
    const saved = structuredClone(room);
    assert.throws(() => advanceRoom(room, 1000), /room_version_changed/);
    assert.throws(() => publicRoom(room, 'p0', 1000), /room_version_changed/);
    assert.throws(() => applyCommand(room, 'p0', {type: 'ready', ready: true}, 1000), /room_version_changed/);
    assert.deepEqual(room, saved, 'legacy rooms must not be advanced or silently rewritten');
  }
});

test('only the lobby owner can remove another offline seat and let remaining players start', () => {
  const room = roomWith(); applyCommand(room, 'p0', {type: 'heartbeat'}, 5000); applyCommand(room, 'p1', {type: 'heartbeat'}, 5000);
  assert.throws(() => applyCommand(room, 'p1', {type: 'remove', playerId: 'p2'}, 6001), /owner_only/);
  assert.throws(() => applyCommand(room, 'p0', {type: 'remove', playerId: 'p0'}, 6001), /cannot_remove_self/);
  assert.throws(() => applyCommand(room, 'p0', {type: 'remove', playerId: 'p1'}, 6001), /player_online/);
  for (const cmd of [{type: 'remove'}, {type: 'remove', playerId: ''}, {type: 'remove', playerId: 'p2', score: 999}]) {
    assert.throws(() => applyCommand(room, 'p0', cmd, 6001), /invalid_command/);
  }
  applyCommand(room, 'p0', {type: 'remove', playerId: 'p2'}, 6001); assert.equal(room.players[2].left, true);
  for (const p of room.players.filter(p => !p.left)) applyCommand(room, p.id, {type: 'ready', ready: true}, 6001);
  applyCommand(room, 'p0', {type: 'start'}, 6001); assert.equal(room.phase, 'countdown');
  assert.throws(() => applyCommand(room, 'p0', {type: 'remove', playerId: 'p1'}, 13000), /lobby_only/);
});
