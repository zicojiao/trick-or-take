// Shared deterministic rules for the server and the one-person local game.
// NPC state is private to the authoritative room; publicRoom omits its future plan.
// v3: fixed clock. v4/v5: varied tempos. v6: difficulty changes turn speed
// while Hard keeps roughly Medium's overall glance cadence.
// v7: one shared challenge with shuffled turn speeds and varied watch durations.
// v8: a gentle opening, then mixed sharp turns without a staged warning pose.
export const GAME_VERSION = 8;
export const SUPPORTED_RULES_VERSIONS = Object.freeze([3, 4, 5, 6, 7, 8]);
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const COUNTDOWN_MS = 3000;
export const ROUND_MS = 60000;
export const WARNING_MS = 900;
export const AWAY_MIN_MS = 2400;
export const AWAY_MAX_MS = 4400;
export const WATCH_MIN_MS = 1200;
export const WATCH_MAX_MS = 1800;
export const HOLD_LEASE_MS = 1500;
export const OFFLINE_MS = 6000;
export const STUN_MS = 1800;
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({awayMin:3800,awayMax:6000,warning:1400,watchMin:1000,watchMax:1500}),
  medium: Object.freeze({awayMin:2400,awayMax:4400,warning:900,watchMin:1200,watchMax:1800}),
  hard: Object.freeze({awayMin:1000,awayMax:2000,warning:550,watchMin:800,watchMax:1200}),
});
// Independent wait, turn and watch choices avoid a learnable fixed rhythm.
const sharedV7 = Object.freeze({
  firstWait: [3200, 4800],
  quick: [1700, 2500], normal: [3200, 5000], long: [5800, 8200],
  quickChance: .24, longChance: .22,
  turns: {fast: [550, 750], normal: [900, 1300], slow: [1450, 1900]},
  watches: {brief: [850, 1200], normal: [1300, 1850], long: [2100, 2700]},
});
export const SHARED_TURN_TIMINGS_BY_VERSION = Object.freeze({
  7: sharedV7,
  8: Object.freeze({...sharedV7,
    turns: {fast: [380, 520], normal: [750, 1100], slow: [1400, 1850]},
  }),
});
export const SHARED_TURN_TIMING = SHARED_TURN_TIMINGS_BY_VERSION[GAME_VERSION];
const sharedProfile = room => SHARED_TURN_TIMINGS_BY_VERSION[room.gameVersion];
// Immutable per-version profiles so older tickets and rooms keep their clock.
export const TURN_TIMINGS_BY_VERSION = Object.freeze({
  4: Object.freeze({
    easy:{quick:[2000,3000],normal:[3800,5800],long:[6500,9000],quickChance:.20,longChance:.25,warning:[1100,1900],fastChance:.20,watch:[1000,2300]},
    medium:{quick:[950,1700],normal:[2400,4200],long:[5600,8500],quickChance:.30,longChance:.24,warning:[750,1500],fastChance:.40,watch:[950,2600]},
    hard:{quick:[650,1100],normal:[1300,2400],long:[3800,6200],quickChance:.42,longChance:.18,warning:[550,1100],fastChance:.65,watch:[750,2400]},
  }),
  5: Object.freeze({
    // Easy: long steal windows and a slow, readable stop → listen → peek.
    easy:{quick:[2800,4200],normal:[4800,7200],long:[8000,11000],quickChance:.12,longChance:.38,warning:[1500,2200],fastChance:.12,watch:[1200,2000]},
    // Medium: classic tension — clear warning, mixed cadence.
    medium:{quick:[1400,2200],normal:[2800,4500],long:[5500,8000],quickChance:.26,longChance:.24,warning:[950,1400],fastChance:.30,watch:[1000,1800]},
    // Hard: frequent glances and a razor warning. Always warns; never snaps to watching.
    hard:{quick:[550,950],normal:[1100,1900],long:[2400,4000],quickChance:.48,longChance:.12,warning:[320,520],fastChance:.75,watch:[700,1300]},
  }),
  6: Object.freeze({
    // Easy gives time to collect and a generous, readable turn.
    easy:{quick:[3000,4400],normal:[5000,7400],long:[8000,10500],quickChance:.12,longChance:.32,warning:[1500,2100],fastChance:.15,watch:[1100,1800]},
    // Medium mixes short and long breaks with a clear reaction window.
    medium:{quick:[1700,2500],normal:[3200,5000],long:[5800,8200],quickChance:.24,longChance:.22,warning:[900,1350],fastChance:.35,watch:[1050,1750]},
    // Hard has the same wait mix as Medium. The turn itself is faster; a
    // slightly longer watch balances the whole cycle instead of spamming turns.
    hard:{quick:[1700,2500],normal:[3200,5000],long:[5800,8200],quickChance:.24,longChance:.22,warning:[360,580],fastChance:.65,watch:[1450,2150]},
  }),
});
// Retained for consumers replaying the last selectable-difficulty ruleset.
export const TURN_TIMINGS = TURN_TIMINGS_BY_VERSION[6];
const timing = room => DIFFICULTIES[room.difficulty || 'medium'];
const turnProfile = room => (TURN_TIMINGS_BY_VERSION[room.gameVersion] || TURN_TIMINGS)[room.difficulty || 'medium'];

const activePhases = new Set(['countdown', 'playing']);
const fail = code => {throw new Error(code);};
const online = (player, now) => !player.left && now - player.lastSeen <= OFFLINE_MS;
const rounded = value => Math.round(value * 100) / 100;

function time(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail('invalid_time');
  return value;
}
function requireVersion(room) {
  if (!SUPPORTED_RULES_VERSIONS.includes(room?.gameVersion)) fail('room_version_changed');
}
function makePlayer(player, now) {
  if (!player || typeof player.id !== 'string' || !player.id || typeof player.name !== 'string' || !player.name.trim()) fail('invalid_player');
  return {
    id: player.id, name: player.name.trim(), avatar: player.avatar ?? 0, uid: player.uid ?? 0,
    tokenHash: player.tokenHash ?? '', ready: false, joinedAt: now, lastSeen: now, left: false,
    score: 0, roundScore: 0, holding: false, heldSince: 0, pending: 0,
    stunnedUntil: 0, catches: 0, inputSeq: -1,
  };
}
function event(room, type, at, playerId = null, details = {}) {
  room.eventSeq += 1;
  room.events.push({id: room.eventSeq, type, at, playerId, ...details});
  if (room.events.length > 20) room.events.splice(0, room.events.length - 20);
}
function dropHold(player) {
  player.holding = false; player.heldSince = 0; player.pending = 0;
}
function transferOwner(room, now) {
  const owner = room.players.find(player => player.id === room.ownerId);
  if (owner && online(owner, now)) return;
  const replacement = room.players.find(player => online(player, now));
  if (replacement && room.ownerId !== replacement.id) {
    room.ownerId = replacement.id;
    event(room, 'owner', now, replacement.id);
  }
}
function initialSeed(code, now) {
  // Local callers may provide a reproducible seed. The HTTP service always
  // supplies independent cryptographic randomness for online room creation.
  let seed = now >>> 0;
  for (const char of String(code)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return seed;
}
function random(room) {
  let value = room.npcState = (room.npcState + 0x6d2b79f5) >>> 0;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}
function interval(room, minimum, maximum) {
  return minimum + Math.floor(random(room) * (maximum - minimum + 1));
}
function nextTurnSpeed(room) {
  if (!room.turnBag.length) {
    if (room.gameVersion >= 8) {
      // Two sharp turns per five, separated by breathing room. Choose valid
      // positions directly so the end of a bag cannot leave an unavoidable pair.
      const pairs = room.lastTurnSpeed === 'fast'
        ? [[1,3],[1,4],[2,4]]
        : [[0,2],[0,3],[0,4],[1,3],[1,4],[2,4]];
      const pair = pairs[Math.floor(random(room) * pairs.length)];
      room.turnBag = Array(5).fill('normal');
      for (const index of pair) room.turnBag[index] = 'fast';
      const gentle = room.turnBag.map((speed,index) => speed === 'normal' ? index : -1).filter(index => index >= 0);
      room.turnBag[gentle[Math.floor(random(room) * gentle.length)]] = 'slow';
      return room.turnBag.shift();
    }
    room.turnBag = ['slow', 'normal', 'fast', 'normal'];
    // A shuffled bag guarantees contrast without unlucky streaks of fast turns.
    for (let i = room.turnBag.length - 1; i > 0; i--) {
      const j = Math.floor(random(room) * (i + 1));
      [room.turnBag[i], room.turnBag[j]] = [room.turnBag[j], room.turnBag[i]];
    }
  }
  if (room.lastTurnSpeed === 'fast' && room.turnBag[0] === 'fast') {
    const other = room.turnBag.findIndex(speed => speed !== 'fast');
    [room.turnBag[0], room.turnBag[other]] = [room.turnBag[other], room.turnBag[0]];
  }
  return room.turnBag.shift();
}
function scheduleSharedLook(room, at) {
  const p = sharedProfile(room), opening = room.turnCount === 0;
  const roll = random(room);
  let tempo = opening ? 'normal' : roll < p.quickChance ? 'quick' : roll < p.quickChance + p.longChance ? 'long' : 'normal';
  if (tempo === 'quick' && room.quickStreak >= 2 || tempo === 'long' && room.lastTempo === 'long') tempo = 'normal';
  room.quickStreak = tempo === 'quick' ? room.quickStreak + 1 : 0;
  room.lastTempo = tempo;
  room.nextLookAt = at + interval(room, ...(opening ? p.firstWait : p[tempo]));
  const speed = opening ? room.gameVersion >= 8 ? 'slow' : 'normal' : nextTurnSpeed(room);
  room.lastTurnSpeed = speed;
  room.nextWarningMs = interval(room, ...p.turns[speed]);
  room.turnCount += 1;
}
function sharedWatchDuration(room) {
  const roll = random(room);
  let kind = room.turnCount === 1 ? 'normal' : roll < .30 ? 'brief' : roll < .75 ? 'normal' : 'long';
  if (kind === 'long' && room.lastWatch === 'long') kind = 'normal';
  room.lastWatch = kind;
  return interval(room, ...sharedProfile(room).watches[kind]);
}
// Draw only at simulation boundaries, never per frame or per network request.
// The next wait and turn speed stay private until their warning actually starts.
function scheduleLook(room,at) {
  if(room.gameVersion >= 7){scheduleSharedLook(room,at);return;}
  if(room.gameVersion===3){room.nextLookAt=at+interval(room,timing(room).awayMin,timing(room).awayMax);return;}
  const p=turnProfile(room),roll=random(room);
  let tempo=roll<p.quickChance?'quick':roll<p.quickChance+p.longChance?'long':'normal';
  // Cap rapid returns so Hard stays intense without becoming unreadable spam.
  if(tempo==='quick'&&room.quickStreak>=2||tempo==='long'&&room.lastTempo==='long')tempo='normal';
  room.quickStreak=tempo==='quick'?(room.quickStreak||0)+1:0;room.lastTempo=tempo;
  room.nextLookAt=at+interval(room,...p[tempo]);
  // Every turn keeps a real warning beat. FastChance only shortens within the band.
  const [min,max]=p.warning,split=Math.round(min+(max-min)*.4);
  room.nextWarningMs=random(room)<p.fastChance?interval(room,min,split):interval(room,split+1,max);
}
function lobby(room) {
  room.phase = 'lobby'; room.guardianId = null;
  room.startsAt = 0; room.endsAt = 0; room.nextAt = 0;
  room.attention = 'away'; room.lookAt = 0; room.watchUntil = 0;
  room.nextLookAt = 0; room.activity = 'cooking'; room.message = null;
  // Keep roundIndex and inputSeq monotonic across rematches.
  for (const player of room.players) {
    dropHold(player); player.ready = false; player.score = 0; player.roundScore = 0;
    player.stunnedUntil = 0; player.catches = 0;
  }
}
function startMatch(room, at) {
  room.roundIndex += 1;
  room.guardianId = 'hostess'; room.phase = 'countdown';
  room.startsAt = at + COUNTDOWN_MS; room.endsAt = room.startsAt + ROUND_MS;
  room.nextAt = 0; room.attention = 'away'; room.lookAt = 0; room.watchUntil = 0;
  room.activity = 'cooking'; room.message = null;
  room.quickStreak=0;room.lastTempo=null;room.warningMs=timing(room).warning;
  if(room.gameVersion >= 7){room.turnBag=[];room.turnCount=0;room.lastTurnSpeed=null;room.lastWatch=null;}
  scheduleLook(room,room.startsAt);
  for (const player of room.players) {
    dropHold(player); player.score = 0; player.roundScore = 0; player.stunnedUntil = 0; player.catches = 0;
  }
  event(room, 'countdown', at, 'hostess', {roundIndex: room.roundIndex});
}
function candyForDuration(ms) {
  const seconds = Math.max(0, ms) / 1000;
  return seconds <= 2 ? 6 * seconds + 1.5 * seconds * seconds : 18 + 12 * (seconds - 2);
}
function catchPlayer(room, player, at) {
  const bankedLost = player.score, pendingLost = player.pending;
  player.score = 0; player.roundScore = 0;
  dropHold(player);
  player.stunnedUntil = at + STUN_MS;
  player.catches += 1;
  event(room, 'catch', at, player.id, {guardianId: 'hostess', lost: bankedLost + pendingLost, bankedLost, pendingLost});
}

export function createRoom({code, player, mode = 'online', seed, difficulty = 'medium', rulesVersion=GAME_VERSION}, now) {
  time(now);
  if (!['online', 'solo'].includes(mode)) fail('invalid_mode');
  if (!Object.hasOwn(DIFFICULTIES, difficulty)) fail('invalid_difficulty');
  if (seed !== undefined && (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)) fail('invalid_seed');
  if(!SUPPORTED_RULES_VERSIONS.includes(rulesVersion))fail('room_version_changed');
  if(rulesVersion >= 7)difficulty = 'medium'; // Historical levels are replay-only.
  const member = makePlayer(player, now);
  const room = {
    gameVersion: rulesVersion, mode, difficulty, code, ownerId: member.id, players: [member],
    phase: 'lobby', roundIndex: -1, guardianId: null,
    startsAt: 0, endsAt: 0, nextAt: 0, lastTick: now,
    attention: 'away', lookAt: 0, watchUntil: 0, activity: 'cooking',
    npcState: seed ?? initialSeed(code, now), nextLookAt: 0,
    events: [], eventSeq: 0, version: 0, createdAt: now, expiresAt: now + ROOM_TTL_MS,
    message: null,
  };
  event(room, 'join', now, member.id);
  return room;
}

export function joinRoom(room, player, now) {
  advanceRoom(room, now);
  if (activePhases.has(room.phase)) fail('match_in_progress');
  if (room.players.some(member => member.id === player.id)) fail('already_a_member');
  if (room.players.filter(member => !member.left).length >= (room.mode === 'solo' ? 1 : MAX_PLAYERS)) fail('room_full');
  room.players = room.players.filter(member => !member.left);
  const member = makePlayer(player, room.lastTick);
  room.players.push(member);
  transferOwner(room, room.lastTick);
  event(room, 'join', room.lastTick, member.id);
  return room;
}

/** Process time boundaries in chronological order. D1 commit order decides
 * concurrent input; client clocks cannot backdate a release or an NPC turn.
 */
export function advanceRoom(room, now) {
  requireVersion(room); time(now);
  const target = Math.max(now, room.lastTick);
  let cursor = room.lastTick;
  for (let steps = 0; steps < 256; steps++) {
    let next = target;
    const boundary = at => {if (at >= cursor && at < next) next = at;};
    if (room.phase === 'countdown') boundary(room.startsAt);
    if (room.phase === 'playing') {
      boundary(room.endsAt);
      if (room.attention === 'away') boundary(room.nextLookAt);
      if (room.attention === 'warning') boundary(room.lookAt);
      if (room.attention === 'watching') boundary(room.watchUntil);
      for (const player of room.players) if (player.holding) boundary(player.lastSeen + HOLD_LEASE_MS);
    }
    const owner = room.players.find(player => player.id === room.ownerId);
    if (owner && online(owner, cursor)) boundary(owner.lastSeen + OFFLINE_MS + 1);

    if (room.phase === 'playing' && room.attention !== 'watching') {
      for (const player of room.players) if (player.holding) player.pending = candyForDuration(next - player.heldSince);
    }
    cursor = next; room.lastTick = cursor;
    // An expired lease releases before a simultaneous watch, without banking.
    for (const player of room.players) {
      if (player.holding && (player.left || cursor >= player.lastSeen + HOLD_LEASE_MS)) dropHold(player);
    }
    transferOwner(room, cursor);

    if (room.phase === 'countdown' && cursor >= room.startsAt) {
      room.phase = 'playing';
      event(room, 'round-start', room.startsAt, 'hostess', {roundIndex: room.roundIndex});
    }
    if (room.phase === 'playing' && cursor >= room.endsAt) {
      for (const player of room.players) {
        // Only a still-valid hand settles; expired leases were dropped above.
        if (player.holding) {
          player.score += player.pending; player.roundScore += player.pending;
        }
        dropHold(player);
      }
      room.phase = 'finished'; room.attention = 'away';
      room.lookAt = 0; room.watchUntil = 0; room.nextLookAt = 0;
      event(room, 'finished', room.endsAt, 'hostess');
    }
    if (room.phase === 'playing' && room.attention === 'away' && cursor >= room.nextLookAt) {
      room.attention = 'warning';
      room.warningMs=room.gameVersion===3?timing(room).warning:room.nextWarningMs;
      room.lookAt = room.nextLookAt + room.warningMs;
      const watch=room.gameVersion===3?[timing(room).watchMin,timing(room).watchMax]:turnProfile(room).watch;
      room.watchUntil = room.lookAt + (room.gameVersion >= 7 ? sharedWatchDuration(room) : interval(room,...watch));
      event(room, 'warning', room.nextLookAt, 'hostess', {activity: room.activity});
      room.nextLookAt = 0;
    }
    if (room.phase === 'playing' && room.attention === 'warning' && cursor >= room.lookAt) {
      room.attention = 'watching';
      event(room, 'watch', room.lookAt, 'hostess');
      for (const player of room.players) if (player.holding && !player.left) catchPlayer(room, player, room.lookAt);
    }
    if (room.phase === 'playing' && room.attention === 'watching' && cursor >= room.watchUntil) {
      const at = room.watchUntil;
      room.attention = 'away'; room.lookAt = 0; room.watchUntil = 0;
      room.activity = room.activity === 'cooking' ? 'cleaning' : 'cooking';
      scheduleLook(room,at);
      event(room, 'away', at, 'hostess', {activity: room.activity});
    }
    if (cursor >= target) return room;
  }
  fail('invalid_room');
}

function validateCommand(command) {
  if (!command || Array.isArray(command) || typeof command !== 'object') fail('invalid_command');
  const shapes = {
    ready: ['type', 'ready'], start: ['type'], hold: ['type', 'held', 'seq', 'roundIndex'],
    heartbeat: ['type'], leave: ['type'], again: ['type'], remove: ['type', 'playerId'],
  };
  const keys = Object.hasOwn(shapes, command.type) ? shapes[command.type] : null;
  if (!keys || Object.keys(command).some(key => !keys.includes(key))) fail('invalid_command');
  if (command.type === 'ready' && typeof command.ready !== 'boolean') fail('invalid_command');
  if (command.type === 'remove' && (typeof command.playerId !== 'string' || !command.playerId || command.playerId.length > 64)) fail('invalid_command');
  if (command.type === 'hold' && (typeof command.held !== 'boolean' || !Number.isSafeInteger(command.seq) || command.seq < 0
    || !Number.isSafeInteger(command.roundIndex) || command.roundIndex < 0)) fail('invalid_command');
}

export function applyCommand(room, playerId, command, now) {
  validateCommand(command); advanceRoom(room, now); now = room.lastTick;
  const player = room.players.find(member => member.id === playerId);
  if (!player) fail('not_a_member');
  if (player.left) fail('member_left');
  player.lastSeen = now; transferOwner(room, now);
  if (command.type === 'heartbeat') return room;
  if (command.type === 'leave') {
    player.left = true; player.ready = false; dropHold(player);
    event(room, 'leave', now, player.id); transferOwner(room, now);
    return room;
  }
  if (command.type === 'remove') {
    if (room.ownerId !== playerId) fail('owner_only');
    if (room.phase !== 'lobby') fail('lobby_only');
    if (command.playerId === playerId) fail('cannot_remove_self');
    const target = room.players.find(member => member.id === command.playerId && !member.left);
    if (!target) fail('not_a_member');
    if (online(target, now)) fail('player_online');
    target.left = true; target.ready = false; dropHold(target);
    event(room, 'leave', now, target.id);
    return room;
  }
  if (command.type === 'ready') {
    if (room.phase !== 'lobby') fail('lobby_only');
    player.ready = command.ready; return room;
  }
  if (command.type === 'start') {
    if (room.ownerId !== playerId) fail('owner_only');
    if (room.phase !== 'lobby') fail('lobby_only');
    const roster = room.players.filter(member => !member.left);
    if (roster.length < (room.mode === 'solo' ? 1 : MIN_PLAYERS)) fail('not_enough_players');
    if (roster.some(member => !member.ready || !online(member, now))) fail('players_not_ready');
    startMatch(room, now); return room;
  }
  if (command.type === 'again') {
    if (room.ownerId !== playerId) fail('owner_only');
    if (room.phase !== 'finished') fail('match_not_finished');
    room.players = room.players.filter(member => !member.left);
    lobby(room); return room;
  }
  if (command.roundIndex !== room.roundIndex) fail('stale_round');
  if (room.phase !== 'playing') fail('round_not_playing');
  if (command.seq <= player.inputSeq) return room;
  player.inputSeq = command.seq;
  if (!command.held) {
    if (player.holding) {
      player.score += player.pending; player.roundScore += player.pending;
    }
    dropHold(player);
  } else if (!player.holding && player.stunnedUntil <= now) {
    if (room.attention === 'watching') catchPlayer(room, player, now);
    else {player.holding = true; player.heldSince = now; player.pending = 0;}
  }
  return room;
}

export function publicRoom(room, viewerId, now) {
  advanceRoom(room, now);
  const viewer = room.players.find(player => player.id === viewerId);
  if (!viewer) fail('not_a_member');
  if (viewer.left) fail('member_left');
  const players = room.players.map(player => ({
    id: player.id, name: player.name, avatar: player.avatar, uid: player.uid,
    ready: player.ready, joinedAt: player.joinedAt, left: player.left, online: online(player, room.lastTick),
    // Derive the whole total before rounding the separate display balances.
    wholeCandy: Math.floor(player.score + player.pending + 1e-9),
    wholePending: Math.floor(player.pending + 1e-9),
    score: rounded(player.score), roundScore: rounded(player.roundScore), catches: player.catches,
    holding: player.holding, heldSince: player.heldSince, pending: rounded(player.pending),
    stunnedUntil: player.stunnedUntil, viewMasked: false,
    ...(player.id === viewerId ? {inputSeq: player.inputSeq} : {}),
  }));
  return {
    gameVersion: room.gameVersion, mode: room.mode, difficulty: room.difficulty || 'medium', warningMs: room.warningMs||timing(room).warning,
    code: room.code, ownerId: room.ownerId, players,
    phase: room.phase, roundIndex: room.roundIndex, guardianId: room.guardianId,
    startsAt: room.startsAt, endsAt: room.endsAt, nextAt: room.nextAt, lastTick: room.lastTick,
    attention: room.attention, activity: room.activity, lookAt: room.lookAt, watchUntil: room.watchUntil,
    events: room.events.map(item => ({...item})), version: room.version,
    createdAt: room.createdAt, expiresAt: room.expiresAt, message: room.message,
    serverNow: room.lastTick, viewMasked: false,
  };
}
