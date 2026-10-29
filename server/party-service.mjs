import { GAME_VERSION, SUPPORTED_RULES_VERSIONS, createRoom, joinRoom, applyCommand, publicRoom } from '../public/party/engine.mjs';
import {createSoloTicket, saveOnlineResults, submitScore, listScores} from './leaderboard.mjs';
import {createSharedResult,getSharedResult} from './sharing.mjs';

// Existing letter-code invitations remain valid until their rooms expire.
const CODE_PATTERN = /^(?:[0-9]{6}|[A-HJ-NP-Z2-9]{6})$/;
const ID_PATTERN = /^[a-f0-9]{32}$/;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const MAX_BODY_BYTES = 2048;
const CAS_ATTEMPTS = 12;
const avatars = new Set(['pumpkin', 'cat', 'ghost', 'bat', 'witch', 'skull']);

const errorStatus = {
  invalid_body: 400, invalid_name: 400, invalid_avatar: 400, invalid_code: 400, invalid_player: 400,
  invalid_command: 400, origin_forbidden: 403, auth_required: 401, invalid_membership: 401,
  room_not_found: 404, action_not_found: 404, method_not_allowed: 405, body_too_large: 413,
  unsupported_media_type: 415, owner_only: 403,
  not_a_member: 401, member_left: 401, not_enough_players: 409, players_not_ready: 409,
  lobby_only: 409, round_not_playing: 409, stale_round: 409, room_version_changed: 409,
  match_not_finished: 409, match_in_progress: 409, room_full: 409,
  already_a_member: 409, room_busy: 503, service_unavailable: 503,
  cannot_remove_self: 400, player_online: 409,
  voice_unconfigured: 503, voice_unavailable: 503,
  invalid_difficulty:400, invalid_mode:400, invalid_trace:400, invalid_result:400, result_not_found:404,
  share_not_found:404,
};

function fail(code) {
  const error = new Error(code);
  error.code = code;
  error.status = errorStatus[code] ?? 500;
  throw error;
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomCode() {
  let value;
  do { value = new DataView(randomBytes(4).buffer).getUint32(0); }
  while (value >= 4_294_000_000);
  return String(value % 1_000_000).padStart(6, '0');
}

async function hashToken(code, playerId, token) {
  const input = new TextEncoder().encode(`${code}:${playerId}:${token}`);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', input)));
}

function sameHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== 64 || b.length !== 64) return false;
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function normalizeCode(value) {
  if (typeof value !== 'string') fail('invalid_code');
  const code = value.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) fail('invalid_code');
  return code;
}

function validateProfile(body) {
  if (typeof body.name !== 'string') fail('invalid_name');
  const name = body.name.trim();
  if (!name || [...name].length > 20 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(name)) fail('invalid_name');
  const avatar = body.avatar ?? 'pumpkin';
  if (!(Number.isInteger(avatar) && avatar >= 0 && avatar < 6) && !avatars.has(avatar)) fail('invalid_avatar');
  return { name, avatar };
}

function objectWithKeys(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) fail('invalid_body');
}

function sameOrigin(request) {
  const supplied = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site' || (supplied && supplied !== new URL(request.url).origin)) fail('origin_forbidden');
  // Browser POST fetches send Origin. A code is not permission to act cross-origin.
  if (request.method !== 'GET' && !supplied) fail('origin_forbidden');
}

async function readBody(request, limit = MAX_BODY_BYTES) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) fail('unsupported_media_type');
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) fail('body_too_large');
  if (!request.body) fail('invalid_body');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        fail('body_too_large');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('invalid_body'); }
}

function bearer(request) {
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.get('authorization') ?? '');
  if (!match || !TOKEN_PATTERN.test(match[1])) fail('auth_required');
  return match[1];
}

function requireDatabase(db) {
  if (!db || typeof db.prepare !== 'function') fail('service_unavailable');
  return db;
}

async function loadRoom(db, code) {
  const row = await db.prepare('SELECT state, version, expires_at FROM party_rooms WHERE code = ?').bind(code).first();
  if (!row || row.expires_at <= Date.now()) fail('room_not_found');
  const room = JSON.parse(row.state);
  // Do not run the new NPC clock against an older human-guardian snapshot.
  // Existing records expire normally; the client can create a fresh room.
  if (!SUPPORTED_RULES_VERSIONS.includes(room.gameVersion)) fail('room_version_changed');
  room.version = row.version;
  return room;
}

/** Server-only identity lookup for voice and room mutations. No raw token is persisted. */
export async function authenticateMember(db, code, playerId, token) {
  requireDatabase(db);
  code = normalizeCode(code);
  if (!ID_PATTERN.test(playerId ?? '') || !TOKEN_PATTERN.test(token ?? '')) fail('invalid_membership');
  const room = await loadRoom(db, code);
  const player = room.players.find(member => member.id === playerId && !member.left);
  const digest = await hashToken(code, playerId, token);
  if (!player || !sameHash(player.tokenHash, digest)) fail('invalid_membership');
  return { room, player };
}

async function identity(code, profile) {
  const token = hex(randomBytes(32));
  const id = hex(randomBytes(16));
  const uid = (new DataView(randomBytes(4).buffer).getUint32(0) & 0x7fffffff) || 1;
  return { token, player: { ...profile, id, uid, tokenHash: await hashToken(code, id, token) } };
}

async function saveRoom(db, room, priorVersion, now) {
  room.version = priorVersion + 1;
  const saved = await db.prepare('UPDATE party_rooms SET state = ?, version = ?, expires_at = ? WHERE code = ? AND version = ? AND expires_at > ?')
    .bind(JSON.stringify(room), room.version, room.expiresAt, room.code, priorVersion, now).run();
  return saved.meta.changes === 1;
}

async function retryPause(attempt) {
  // Small randomized backoff prevents all six polling clients from retrying in lockstep.
  if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 3 + Math.floor(Math.random() * Math.min(50, attempt * 8))));
}

async function create(db, profile, difficulty) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode();
    const member = await identity(code, profile);
    const now = Date.now();
    const seed = new DataView(randomBytes(4).buffer).getUint32(0);
    const room = createRoom({ code, player: member.player, mode: 'online', seed, difficulty }, now);
    room.channel = `pumpkin_${hex(randomBytes(16))}`;
    const inserted = await db.prepare('INSERT OR IGNORE INTO party_rooms (code, state, version, expires_at) VALUES (?, ?, ?, ?)')
      .bind(code, JSON.stringify(room), room.version, room.expiresAt).run();
    if (inserted.meta.changes === 1) return json({ room: publicRoom(room, member.player.id, now), playerId: member.player.id, token: member.token, serverNow: now }, 201);
  }
  fail('room_busy');
}

async function join(db, code, profile) {
  const member = await identity(code, profile);
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    await retryPause(attempt);
    const room = await loadRoom(db, code);
    const priorVersion = room.version;
    const now = Date.now();
    // UID collisions are improbable but must not accidentally share an RTC identity.
    while (room.players.some(player => player.uid === member.player.uid)) member.player.uid = (member.player.uid % 0x7fffffff) + 1;
    joinRoom(room, member.player, now);
    if (await saveRoom(db, room, priorVersion, now)) return json({ room: publicRoom(room, member.player.id, now), playerId: member.player.id, token: member.token, serverNow: now }, 201);
  }
  fail('room_busy');
}

async function state(db, code, playerId, token, command) {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    await retryPause(attempt);
    const { room } = await authenticateMember(db, code, playerId, token);
    const priorVersion = room.version;
    // Fresh time on every retry: a losing CAS cannot overwrite a later look or release.
    // The successful database serialization order is authoritative. No client timestamp
    // can backdate input, including a release that was delayed by network contention.
    const now = Date.now();
    if(command?.type === 'again') await saveOnlineResults(db, room, playerId);
    applyCommand(room, playerId, command ?? { type: 'heartbeat' }, now);
    if (await saveRoom(db, room, priorVersion, now)) {
      // A departed member gets an acknowledgement, not a fresh room snapshot.
      if (command?.type === 'leave') return json({ room: null, left: true, serverNow: now });
      const resultId = await saveOnlineResults(db, room, playerId);
      const resultPublished = resultId ? !!await db.prepare('SELECT 1 FROM leaderboard_entries WHERE source_id = ?').bind(resultId).first() : false;
      return json({ room: publicRoom(room, playerId, now), serverNow: now, resultId, resultPublished });
    }
  }
  fail('room_busy');
}

function voiceConfigured(env) {
  return /^[a-f0-9]{32}$/i.test(env.AGORA_APP_ID ?? '') && /^[a-f0-9]{32}$/i.test(env.AGORA_APP_CERTIFICATE ?? '');
}

/** Shared route handler; env.DB is a real Worker D1 binding. */
export async function handlePartyRequest(request, env, action) {
  try {
    sameOrigin(request);
    if (action === 'config') {
      if (request.method !== 'GET') fail('method_not_allowed');
      return json({ voiceConfigured: voiceConfigured(env) });
    }
    if(action === 'leaderboard') {
      if(request.method !== 'GET') fail('method_not_allowed');
      return json(await listScores(requireDatabase(env.DB), new URL(request.url)));
    }
    if(action === 'shared-result') {
      if(request.method!=='GET')fail('method_not_allowed');
      const result=await getSharedResult(requireDatabase(env.DB),new URL(request.url).searchParams.get('id'));
      if(!result)fail('share_not_found');return json({result});
    }
    if(action === 'solo-ticket' || action === 'submit-score'||action==='share-result') {
      if(request.method !== 'POST') fail('method_not_allowed');
      const body = await readBody(request, action === 'solo-ticket' ? MAX_BODY_BYTES : 32768);
      objectWithKeys(body, action === 'solo-ticket' ? ['difficulty','rulesVersion'] : action==='share-result'?['runId','trace']:['runId','name','trace']);
      const db = requireDatabase(env.DB);
      return json(action === 'solo-ticket' ? await createSoloTicket(db,body.difficulty,body.rulesVersion??GAME_VERSION)
        : action==='share-result'?await createSharedResult(db,body,bearer(request)):await submitScore(db,body,bearer(request)));
    }
    if (!['create', 'join', 'state', 'voice','signal'].includes(action)) fail('action_not_found');
    if (request.method !== 'POST') fail('method_not_allowed');
    const body = await readBody(request);
    const allowed = { create: ['name', 'avatar', 'difficulty'], join: ['code', 'name', 'avatar'], state: ['code', 'playerId', 'command'], voice: ['code', 'playerId'],signal:['code','playerId'] };
    objectWithKeys(body, allowed[action]);
    const db = requireDatabase(env.DB);
    if (action === 'create') return await create(db, validateProfile(body), body.difficulty);
    const code = normalizeCode(body.code);
    if (action === 'join') return await join(db, code, validateProfile(body));
    const token = bearer(request);
    if (!ID_PATTERN.test(body.playerId ?? '')) fail('invalid_membership');
    if (action === 'state') return await state(db, code, body.playerId, token, body.command);
    const { room, player } = await authenticateMember(db, code, body.playerId, token);
    if (!voiceConfigured(env)) fail('voice_unconfigured');
    const { generateVoiceCredentials,generateSignalCredentials } = await import('./agora-token.mjs');
    return json(await (action==='signal'?generateSignalCredentials:generateVoiceCredentials)(env, room, player));
  } catch (error) {
    // Never surface SQL, stack traces, raw provider errors, or credential material.
    const candidate = error?.code ?? error?.message;
    const code = Object.hasOwn(errorStatus, candidate) ? candidate : 'service_unavailable';
    return json({ error: code }, errorStatus[code]);
  }
}
