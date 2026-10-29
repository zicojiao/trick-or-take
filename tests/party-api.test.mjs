import test from 'node:test';
import assert from 'node:assert/strict';

const service = await import('../server/party-service.mjs').catch(() => ({}));
const { handlePartyRequest, authenticateMember } = service;
const origin = 'https://pumpkin.example';

async function database(t) {
  assert.equal(typeof handlePartyRequest, 'function', 'the real D1-backed API handler must exist');
  const { Miniflare } = await import('miniflare');
  const mf = new Miniflare({
    modules: true, script: 'export default {fetch(){return new Response("party test")}}',
    compatibilityDate: '2026-04-01', d1Databases: { DB: 'party-test' },
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await db.exec('CREATE TABLE party_rooms (code TEXT PRIMARY KEY NOT NULL, state TEXT NOT NULL, version INTEGER NOT NULL, expires_at INTEGER NOT NULL)');
  return db;
}

async function request(db, action, body, token, options = {}) {
  const headers = { 'content-type': 'application/json', origin, ...options.headers };
  if (token) headers.authorization = `Bearer ${token}`;
  const input = new Request(`${origin}/api/party/${action}`, {
    method: options.method ?? 'POST', headers,
    body: options.method === 'GET' ? undefined : (options.raw ?? JSON.stringify(body)),
  });
  const response = await handlePartyRequest(input, { DB: db, ...options.env }, action);
  return { response, data: await response.json() };
}

async function create(db, name = 'Mallow') {
  const result = await request(db, 'create', { name, avatar: 'pumpkin' });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  return result.data;
}

test('create and join persist real D1 state with unique room-scoped capabilities and private channels', async t => {
  const db = await database(t);
  const owner = await create(db);
  assert.match(owner.room.code, /^\d{6}$/, 'new rooms use six digits');
  const joined = await request(db, 'join', { code: owner.room.code.toLowerCase(), name: 'Nougat', avatar: 1 });
  assert.equal(joined.response.status, 201);
  const friend = joined.data;
  assert.equal(friend.room.players.length, 2);
  assert.equal(friend.room.gameVersion, 7);
  assert.equal(friend.room.mode, 'online');
  assert.notEqual(owner.playerId, friend.playerId);
  assert.notEqual(owner.token, friend.token);
  assert.match(owner.token, /^[a-f0-9]{64}$/);
  assert.equal('tokenHash' in friend.room.players[0], false);
  assert.equal('channel' in friend.room, false);
  assert.equal(joined.response.headers.get('cache-control'), 'no-store');
  const row = await db.prepare('SELECT state, version FROM party_rooms WHERE code = ?').bind(owner.room.code).first();
  const stored = JSON.parse(row.state);
  assert.equal(row.version, 1);
  assert.equal(stored.players[0].tokenHash.includes(owner.token), false);
  assert.match(stored.players[0].tokenHash, /^[a-f0-9]{64}$/);
  assert.match(stored.channel, /^pumpkin_[a-f0-9]{32}$/);
  assert.ok(stored.players[0].uid > 0);
  assert.notEqual(stored.players[0].uid, stored.players[1].uid);
  const member = await authenticateMember(db, owner.room.code, owner.playerId, owner.token);
  assert.equal(member.player.id, owner.playerId);
  assert.equal(member.room.channel, stored.channel);
});

test('leading-zero numeric codes and legacy letter invitations both remain joinable', async t => {
  const db = await database(t);
  for (const code of ['001234', 'ABCDEF']) {
    const owner = await create(db);
    const row = await db.prepare('SELECT state FROM party_rooms WHERE code = ?').bind(owner.room.code).first();
    const room = {...JSON.parse(row.state), code};
    await db.prepare('UPDATE party_rooms SET code = ?, state = ? WHERE code = ?')
      .bind(code, JSON.stringify(room), owner.room.code).run();
    const joined = await request(db, 'join', {code, name: 'Friend'});
    assert.equal(joined.response.status, 201);
    assert.equal(joined.data.room.code, code);
    assert.equal(joined.data.room.players.length, 2);
  }
});

test('a code alone, another member token, and a token from another room cannot control a player', async t => {
  const db = await database(t);
  const owner = await create(db);
  const other = await create(db, 'Other room');
  const friend = (await request(db, 'join', { code: owner.room.code, name: 'Friend' })).data;
  for (const token of [undefined, 'f'.repeat(64), friend.token, other.token]) {
    const response = await request(db, 'state', { code: owner.room.code, playerId: owner.playerId, command: { type: 'ready', ready: true } }, token);
    assert.equal(response.response.status, 401);
    assert.equal(response.data.room, undefined);
  }
  const valid = await request(db, 'state', { code: owner.room.code, playerId: owner.playerId }, owner.token);
  assert.equal(valid.response.status, 200);
  assert.equal(valid.data.room.players[0].ready, false);
  assert.equal(valid.data.token, undefined, 'the capability is returned only at creation/join');
});

test('simultaneous independent members can ready and join without lost updates', async t => {
  const db = await database(t);
  const owner = await create(db);
  const joined = await Promise.all(Array.from({ length: 5 }, (_, i) => request(db, 'join', { code: owner.room.code, name: `Friend ${i}` })));
  for (const result of joined) assert.equal(result.response.status, 201, JSON.stringify(result.data));
  const members = [owner, ...joined.map(result => result.data)];
  const full = await request(db, 'join', { code: owner.room.code, name: 'Too many' });
  assert.equal(full.response.status, 409);
  assert.equal(full.data.error, 'room_full');
  const ready = await Promise.all(members.map(member => request(db, 'state', {
    code: owner.room.code, playerId: member.playerId, command: { type: 'ready', ready: true },
  }, member.token)));
  for (const result of ready) assert.equal(result.response.status, 200, JSON.stringify(result.data));
  const start = await request(db, 'state', { code: owner.room.code, playerId: owner.playerId, command: { type: 'start' } }, owner.token);
  assert.equal(start.response.status, 200);
  assert.equal(start.data.room.phase, 'countdown');
  assert.equal(start.data.room.players.length, 6);
  assert.equal(start.data.room.players.every(member => member.ready), true);
  assert.equal(start.data.room.guardianId, 'hostess');
  assert.equal(start.data.room.endsAt - start.data.room.startsAt, 60000);
  assert.equal(start.data.room.roundOrder, undefined);
  const late = await request(db, 'join', { code: owner.room.code, name: 'Late friend' });
  assert.equal(late.data.error, 'match_in_progress');
});

test('state heartbeats reconnect the same member and leaving revokes membership', async t => {
  const db = await database(t);
  const owner = await create(db);
  const friend = (await request(db, 'join', { code: owner.room.code, name: 'Friend' })).data;
  const resumed = await request(db, 'state', { code: owner.room.code, playerId: owner.playerId }, owner.token);
  assert.equal(resumed.data.room.players.length, 2);
  assert.equal(resumed.data.room.players[0].online, true);
  const left = await request(db, 'state', { code: owner.room.code, playerId: owner.playerId, command: { type: 'leave' } }, owner.token);
  assert.equal(left.response.status, 200);
  assert.equal(left.data.left, true);
  const remaining = await request(db, 'state', { code: owner.room.code, playerId: friend.playerId }, friend.token);
  assert.equal(remaining.data.room.ownerId, friend.playerId);
  const revoked = await request(db, 'state', { code: owner.room.code, playerId: owner.playerId }, owner.token);
  assert.equal(revoked.response.status, 401);
});

test('concurrent press and release never restore an older hold, and all humans are thieves', async t => {
  const db = await database(t);
  const owner = await create(db);
  const friend = (await request(db, 'join', { code: owner.room.code, name: 'Friend' })).data;
  const { applyCommand, advanceRoom } = await import('../public/party/engine.mjs');
  const row = await db.prepare('SELECT state FROM party_rooms WHERE code = ?').bind(owner.room.code).first();
  const room = JSON.parse(row.state);
  const now = Date.now();
  room.lastTick = now - 3000;
  for (const member of room.players) {
    member.lastSeen = now - 3000;
    applyCommand(room, member.id, { type: 'ready', ready: true }, now - 3000);
  }
  applyCommand(room, owner.playerId, { type: 'start' }, now - 3000);
  advanceRoom(room, now);
  for (const member of room.players) member.lastSeen = now;
  await db.prepare('UPDATE party_rooms SET state = ? WHERE code = ?').bind(JSON.stringify(room), room.code).run();
  const commands = [{ type: 'hold', held: true, seq: 10, roundIndex: 0 }, { type: 'hold', held: false, seq: 11, roundIndex: 0 }];
  const results = await Promise.all(commands.map(command => request(db, 'state', { code: room.code, playerId: friend.playerId, command }, friend.token)));
  for (const result of results) assert.equal(result.response.status, 200);
  const mine = await request(db, 'state', { code: room.code, playerId: friend.playerId }, friend.token);
  const player = mine.data.room.players.find(member => member.id === friend.playerId);
  assert.equal(player.holding, false);
  assert.equal(player.inputSeq, 11);
  const observer = await request(db, 'state', { code: room.code, playerId: owner.playerId }, owner.token);
  const visible = observer.data.room.players.find(member => member.id === friend.playerId);
  assert.equal(observer.data.room.viewMasked, false);
  assert.equal(visible.holding, false);
  assert.equal(visible.pending, 0);
  assert.equal(visible.inputSeq, undefined);
  assert.equal(/npcState|nextLookAt|tokenHash|seed/i.test(JSON.stringify(observer.data.room)), false);
  const ownerHold = await request(db, 'state', { code: room.code, playerId: owner.playerId, command: { type: 'hold', held: true, seq: 1, roundIndex: 0 } }, owner.token);
  assert.equal(ownerHold.response.status, 200);
  const forbiddenLook = await request(db, 'state', { code: room.code, playerId: owner.playerId, command: { type: 'look', roundIndex: 0 } }, owner.token);
  assert.equal(forbiddenLook.response.status, 400);
  assert.equal(forbiddenLook.data.error, 'invalid_command');
  const stale = await request(db, 'state', { code: room.code, playerId: friend.playerId, command: { type: 'hold', held: true, seq: 12, roundIndex: 1 } }, friend.token);
  assert.equal(stale.response.status, 409);
  assert.equal(stale.data.error, 'stale_round');
});

test('HTTP boundaries reject cross-origin, oversized, malformed, and unexpected input before mutating', async t => {
  const db = await database(t);
  const cases = [
    [{ name: 'Valid' }, { headers: { origin: 'https://other.example' } }, 403],
    [{ name: 'Valid' }, { headers: { origin: 'null' } }, 403],
    [{ name: 'Valid' }, { headers: { 'sec-fetch-site': 'cross-site' } }, 403],
    [{ name: 'Valid' }, { headers: { 'content-type': 'text/plain' } }, 415],
    [{ name: 'Valid' }, { raw: '{' }, 400],
    [{ name: 'Valid' }, { raw: ' '.repeat(2500) + '{}' }, 413],
    [{ name: 'Valid' }, { headers: { 'content-length': '9000' } }, 413],
    [{ name: 'Valid', score: 999 }, {}, 400],
    [{ name: 'Valid', mode: 'solo' }, {}, 400],
    [{ name: '\u0000Bad' }, {}, 400],
    [{ name: 'a'.repeat(21) }, {}, 400],
    [{ name: 'Valid', avatar: { html: '<script>' } }, {}, 400],
  ];
  for (const [body, options, status] of cases) {
    const result = await request(db, 'create', body, undefined, options);
    assert.equal(result.response.status, status, JSON.stringify({ body, options, response: result.data }));
    assert.equal(typeof result.data.error, 'string');
  }
  const count = await db.prepare('SELECT COUNT(*) AS n FROM party_rooms').first();
  assert.equal(count.n, 0);
});

test('expired rooms cannot be resumed or joined and unavailable databases fail safely', async t => {
  const db = await database(t);
  const owner = await create(db);
  await db.prepare('UPDATE party_rooms SET expires_at = 0 WHERE code = ?').bind(owner.room.code).run();
  const expired = await request(db, 'state', { code: owner.room.code, playerId: owner.playerId }, owner.token);
  assert.equal(expired.response.status, 404);
  const join = await request(db, 'join', { code: owner.room.code, name: 'Friend' });
  assert.equal(join.response.status, 404);
  const missing = await request(undefined, 'create', { name: 'Friend' });
  assert.equal(missing.response.status, 503);
  assert.equal(missing.data.error, 'service_unavailable');
  assert.equal(JSON.stringify(missing.data).includes('SELECT'), false);
});

test('voice configuration is honest and voice credentials require valid room membership first', async t => {
  const db = await database(t);
  const owner = await create(db);
  const config = await request(db, 'config', null, undefined, { method: 'GET' });
  assert.equal(config.response.status, 200);
  assert.deepEqual(config.data, { voiceConfigured: false });
  const configured = await request(db, 'config', null, undefined, {
    method: 'GET', env: { AGORA_APP_ID: 'a'.repeat(32), AGORA_APP_CERTIFICATE: 'b'.repeat(32) },
  });
  assert.equal(configured.data.voiceConfigured, true);
  assert.equal(JSON.stringify(configured.data).includes('b'.repeat(32)), false);
  const denied = await request(db, 'voice', { code: owner.room.code, playerId: owner.playerId }, 'f'.repeat(64));
  assert.equal(denied.response.status, 401);
  const unavailable = await request(db, 'voice', { code: owner.room.code, playerId: owner.playerId }, owner.token);
  assert.equal(unavailable.response.status, 503);
  assert.equal(unavailable.data.error, 'voice_unconfigured');
});

test('offline lobby removal authenticates the owner and revokes only the removed seat', async t => {
  const db = await database(t);
  const owner = await create(db);
  const friend = (await request(db, 'join', { code: owner.room.code, name: 'Friend' })).data;
  const absent = (await request(db, 'join', { code: owner.room.code, name: 'Absent' })).data;
  for (const member of [owner, friend]) {
    const ready = await request(db, 'state', { code: owner.room.code, playerId: member.playerId, command: { type: 'ready', ready: true } }, member.token);
    assert.equal(ready.response.status, 200);
  }
  const row = await db.prepare('SELECT state FROM party_rooms WHERE code = ?').bind(owner.room.code).first();
  const stored = JSON.parse(row.state);
  stored.players.find(player => player.id === absent.playerId).lastSeen = Date.now() - 6001;
  await db.prepare('UPDATE party_rooms SET state = ? WHERE code = ?').bind(JSON.stringify(stored), owner.room.code).run();
  const remove = { type: 'remove', playerId: absent.playerId };
  const denied = await request(db, 'state', { code: owner.room.code, playerId: friend.playerId, command: remove }, friend.token);
  assert.equal(denied.response.status, 403);
  assert.equal(denied.data.error, 'owner_only');
  const removed = await request(db, 'state', { code: owner.room.code, playerId: owner.playerId, command: remove }, owner.token);
  assert.equal(removed.response.status, 200);
  assert.equal(removed.data.room.players.find(player => player.id === absent.playerId).left, true);
  const revoked = await request(db, 'state', { code: owner.room.code, playerId: absent.playerId }, absent.token);
  assert.equal(revoked.response.status, 401);
  const started = await request(db, 'state', { code: owner.room.code, playerId: owner.playerId, command: { type: 'start' } }, owner.token);
  assert.equal(started.response.status, 200);
  assert.equal(started.data.room.guardianId, 'hostess');
  assert.deepEqual(started.data.room.players.filter(player => !player.left).map(player => player.id), [owner.playerId, friend.playerId]);
});

test('old persisted room versions fail explicitly for join, resume and voice without rewriting data', async t => {
  const db = await database(t);
  const owner = await create(db);
  const row = await db.prepare('SELECT state FROM party_rooms WHERE code = ?').bind(owner.room.code).first();
  for (const version of [undefined, 2]) {
    const old = JSON.parse(row.state);
    if (version === undefined) delete old.gameVersion;
    else old.gameVersion = version;
    const saved = JSON.stringify(old);
    await db.prepare('UPDATE party_rooms SET state = ? WHERE code = ?').bind(saved, owner.room.code).run();
    for (const [action, body, token] of [
      ['join', {code: owner.room.code, name: 'Friend'}, undefined],
      ['state', {code: owner.room.code, playerId: owner.playerId}, owner.token],
      ['state', {code: owner.room.code, playerId: owner.playerId, command: {type: 'ready', ready: true}}, owner.token],
      ['voice', {code: owner.room.code, playerId: owner.playerId}, owner.token],
    ]) {
      const response = await request(db, action, body, token);
      assert.equal(response.response.status, 409);
      assert.equal(response.data.error, 'room_version_changed');
    }
    assert.equal((await db.prepare('SELECT state FROM party_rooms WHERE code = ?').bind(owner.room.code).first()).state, saved);
  }
});

test('RTM credentials authenticate the current member and never expose the certificate',async t=>{
 const db=await database(t),owner=await create(db),environment={AGORA_APP_ID:'a'.repeat(32),AGORA_APP_CERTIFICATE:'b'.repeat(32)},body={code:owner.room.code,playerId:owner.playerId};
 assert.equal((await request(db,'signal',body,'f'.repeat(64),{env:environment})).response.status,401);
 assert.equal((await request(db,'signal',body,owner.token)).response.status,503);
 const valid=await request(db,'signal',body,owner.token,{env:environment});assert.equal(valid.response.status,200);assert.equal(valid.data.userId,String(owner.room.players[0].uid));assert.match(valid.data.token,/^007/);assert.equal(JSON.stringify(valid.data).includes(environment.AGORA_APP_CERTIFICATE),false);
 await request(db,'state',{...body,command:{type:'leave'}},owner.token);
 assert.equal((await request(db,'signal',body,owner.token,{env:environment})).response.status,401);
});
