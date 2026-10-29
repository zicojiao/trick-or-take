import {track} from './analytics.mjs';
import {MESSAGES} from './messages.mjs';
import {createRoom, applyCommand, publicRoom, DIFFICULTIES, GAME_VERSION} from './engine.mjs';
import {PAGE_META, requestLanguage} from './locale.mjs';
import {randomNickname} from './profile.mjs';
import {createChoiceGroup} from './choice.mjs';
import {createScene} from './scene.mjs';
import {createVoice} from './voice.mjs';
import {pollCommand} from './input.mjs';
import {createHoldInput, createLocalClock} from './controls.mjs';
import {installInteractions} from './interaction.mjs';
import {createResultSharing} from './sharing.mjs';
import {createSoloMusic} from './music.mjs';
import {createSignaling} from './signaling.mjs';
import './stage-fit.mjs';

installInteractions(document,window);

const $ = id => document.getElementById(id);
const read = (store, key) => {try {return store.getItem(key);} catch {return null;}};
const write = (store, key, value) => {try {value === null ? store.removeItem(key) : store.setItem(key, value);} catch {}};
const show = (id, value) => {$(id).hidden = !value;};
const setText = (id, value) => {if ($(id).textContent !== String(value)) $(id).textContent = value;};
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const {en,zh}=MESSAGES;
let lang = requestLanguage(location.origin + location.pathname + location.search);
let difficulty = Object.hasOwn(DIFFICULTIES,read(localStorage,'candy-difficulty')) ? read(localStorage,'candy-difficulty') : 'medium';
let avatar = Math.abs(Number(read(localStorage, 'pumpkin-avatar')) || 0) % 3;
let mode = 'solo', room = null, session = null, localRoom = null;
let holding = false, seq = 0, epoch = 0, offset = 0, lastSuccess = 0, online = true;
let lastEvent = 0, lastUi = 0, lastLocalTick = 0, pollTimer, pollFlight;
let entryBusy = false, roomBusy = false, artReady = false, artFailed = false;
let rosterSignature = '', resultSignature = '', toastTimer, feedbackTimer, finaleTimer;
const bestKey = () => difficulty === 'medium' ? 'candy-local-best-v6' : 'candy-local-best-v6-' + difficulty;
let finishedBest = false, best = Math.max(0, Number(read(localStorage, bestKey())) || 0);
let soloStarting = false, soloTicket = null, soloTrace = [], resultIdentity = null;
let publication = {state:'idle'}, publicationKey = '', boardEpoch = 0, boardState = 'loading', publishNameDefault = true;
let voiceState = {state: 'idle', muted: false}, config = {voiceConfigured: null}, levels = {};
let configState = 'loading', configPromise;
let soundEnabled = read(localStorage, 'candy-sound') !== 'false', audioContext, audioOutput;
let musicEnabled=read(localStorage,'candy-music')!=='false';
let signalState={state:'idle'},rtmRefreshPending=false,lastSignalEvent=0;
let helpPausedLocal = false, leavePausedLocal = false;
const input = createHoldInput();
const clock = createLocalClock();
const scene = createScene($('party-canvas'));
const tr = (english, chinese) => lang === 'zh' ? chinese : english;
const t = key => (lang === 'zh' ? zh : en)[key] ?? en[key] ?? key;
const roomPath = code => (lang === 'zh' ? '/zh?room=' : '/?room=') + code;
const now = () => localRoom ? clock.now : Math.round(Date.now() + offset);
const mine = () => room?.players.find(player => player.id === session?.playerId);
const isOwner = () => !!room && room.ownerId === session?.playerId;
const active = () => !!room && ['countdown', 'playing'].includes(room.phase);
const lagging = () => !!session && !localRoom && (!online || Date.now() - lastSuccess > 1800);
// Use the authoritative whole total: rounded pocket/hand subtotals can add up
// to an extra candy which would disappear when they are banked together.
const score = player => Number.isFinite(player?.wholeCandy)
  ? player.wholeCandy : Math.floor((player?.score || 0) + (player?.pending || 0) + 1e-9);
const orderedPlayers = () => [...(room?.players || [])].sort((a, b) => score(b) - score(a) || a.joinedAt - b.joinedAt);
const rank = player => 1 + (room?.players || []).filter(other => score(other) > score(player)).length;

function avatarElement(player) {
  const element = node('span', 'avatar-sprite');
  element.dataset.avatar = String((Number(player.avatar) || 0) % 3);
  element.setAttribute('aria-hidden', 'true');
  return element;
}
function toast(message) {
  setText('toast', message); show('toast', true);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => show('toast', false), 4500);
}
function feedback(message) {
  setText('stage-feedback', message); show('stage-feedback', true);
  clearTimeout(feedbackTimer); feedbackTimer = setTimeout(() => show('stage-feedback', false), 1400);
}
function getAudio(){
  if(!audioContext||audioContext.state==='closed'){
    const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return null;
    audioContext=new Audio();audioOutput=audioContext.createGain();audioOutput.gain.value=.75;audioOutput.connect(audioContext.destination);
  }
  return {context:audioContext,output:audioOutput};
}
const music=createSoloMusic({getAudio,onStatus:state=>{document.body.dataset.music=state;}});
function syncMusic(){music.sync({enabled:soundEnabled&&musicEnabled,solo:!!localRoom,active:active(),paused:clockPaused(),hidden:document.hidden,attention:room?.attention});}
function playTone(type, frequency, start, duration, level, endFrequency) {
  const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + .016);
  gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(gain); gain.connect(audioOutput);
  oscillator.start(start); oscillator.stop(start + duration + .02);
}
function sound(kind) {
  if (!soundEnabled) return;
  try {
    if(!getAudio())return;
    void audioContext.resume().catch(() => {});
    const start = audioContext.currentTime;
    if (kind === 'finish' || kind === 'best') {
      // D minor tiptoe, then a bright lift: the heist got away with it.
      [293.66, 349.23, 440, 587.33].forEach((frequency, index) => {
        playTone('triangle', frequency, start + index * .08, .26, .05);
        playTone('sine', frequency / 2, start + index * .08, .3, .028);
      });
      for (const frequency of [293.66, 349.23, 440]) playTone('sine', frequency, start + .36, .72, .03);
      playTone('triangle', 880, start + .62, .28, .035);
      if (kind === 'best') {
        playTone('triangle', 1174.66, start + .78, .42, .04);
        playTone('sine', 587.33, start + .78, .5, .03);
      }
      return;
    }
    const notes = kind === 'catch' ? [260, 190] : kind === 'warning' ? [520, 620] : [730, 930];
    notes.forEach((frequency, index) => playTone('sine', frequency, start + index * .09, .14, .045));
  } catch {}
}
function clearFinale() {
  clearTimeout(finaleTimer); finaleTimer = null;
  const finale = $('finale');
  finale.replaceChildren(); finale.hidden = true;
}
function celebrate(bestRound) {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reduced) {clearFinale(); return;}
  const finale = $('finale');
  const glyphs = ['✿', '❀', '🍬', '✦', '★'];
  const colors = ['#e07a9a', '#f2b15a', '#c9a0e0', '#f4d56a', '#ef8b6a', '#8fceab'];
  const count = bestRound ? 40 : 30;
  const petals = [];
  for (let i = 0; i < count; i++) {
    const petal = document.createElement('span');
    const angle = -Math.PI / 2 + (i / count - .5) * Math.PI * 1.65;
    const distance = 120 + (i * 47) % 210;
    petal.textContent = glyphs[i % glyphs.length];
    petal.style.color = colors[i % colors.length];
    petal.style.fontSize = `${14 + (i % 5) * 4}px`;
    petal.style.setProperty('--dx', `${Math.round(Math.cos(angle) * distance)}px`);
    petal.style.setProperty('--dy', `${Math.round(Math.sin(angle) * distance + 160)}px`);
    petal.style.setProperty('--spin', `${i % 2 ? '' : '-'}${160 + (i % 4) * 40}deg`);
    petal.style.animationDelay = `${(i % 7) * 0.045}s`;
    petals.push(petal);
  }
  finale.replaceChildren(...petals); finale.hidden = false;
  clearTimeout(finaleTimer);
  finaleTimer = setTimeout(clearFinale, 4200);
}
function errorCopy(error) {
  const copy = {
    invalid_name: ['Give yourself a name first.', '先填一个可爱的名字吧。'],
    invalid_code: ['Enter the six-digit room code.', '请输入 6 位数字房间码。'],
    room_not_found: ['That room does not exist, or has expired.', '没有找到这个房间，或房间已过期。'],
    room_expired: ['This kitchen has closed. Create a new room.', '房间已过期，请重新建房。'],
    room_full: ['Six little rascals already. The room is full.', '已经有 6 只小坏蛋，房间满了。'],
    match_in_progress: ['They are mid-heist. Join after the match.', '大家正在偷糖，请本局结束后再加入。'],
    not_enough_players: ['Invite at least one friend first.', '至少再叫上一位朋友。'],
    players_not_ready: ['Everyone needs to be ready and connected.', '需要所有人在线并准备好。'],
    room_version_changed: ['The kitchen has been updated. Create or join a new room.', '小厨房已经升级，请重新创建或加入房间。'],
    owner_only: ['The room host can do that.', '这一步由房主操作哦。'],
    invalid_membership: ['Your seat has expired. Please rejoin.', '座位已失效，请重新加入。'],
    not_a_member: ['Your seat is no longer in this room.', '你已不在这个房间里，请重新加入。'],
    member_left: ['You left the room. Join again to play.', '你已离开房间，重新加入后再玩。'],
    room_busy: ['The kitchen is busy. Try once more.', '厨房有点忙，请重试。'],
    rate_limited: ['A little too fast. Try again shortly.', '操作太快了，请稍等再试。'],
    invalid_trace: ['This run could not be verified. Start a new game to try again.', '本局记录无法验证，请重新开始一局。'],
    result_not_found: ['This result has expired. Play a new round.', '成绩记录已过期，请重新玩一局。'],
    match_not_finished: ['Finish the full game before submitting your score.', '请完成整局游戏后再提交成绩。'],
    invalid_difficulty: ['Choose Easy, Medium or Hard.', '请选择简单、中等或困难。'],
    voice_unconfigured: ['Voice is not configured yet. The game still works.', '语音尚未配置，仍然可以正常玩游戏。'],
    voice_sdk_load: ['The voice service could not load. Please retry.', '语音服务加载失败，请重试。'],
    PERMISSION_DENIED: ['Allow microphone access, then try again.', '请允许麦克风权限后再试。'],
    NotAllowedError: ['Allow microphone access, then try again.', '请允许麦克风权限后再试。'],
    DEVICE_NOT_FOUND: ['Connect a microphone, then try again.', '没有找到麦克风，请连接后再试。'],
    DEVICES_NOT_FOUND: ['Connect a microphone, then try again.', '没有找到麦克风，请连接后再试。'],
    NotFoundError: ['Connect a microphone, then try again.', '没有找到麦克风，请连接后再试。'],
    voice_autoplay: ['Tap Join voice again to enable sound.', '再点一次加入语音，以开启声音。'],
    voice_session_changed: ['Your voice session changed. Join voice again.', '语音会话已变化，请重新加入语音。'],
  };
  const key = error?.code || error?.message;
  return copy[key]?.[lang === 'zh' ? 1 : 0] || tr('Could not connect. Please try again.', '暂时连接不上，请重试。');
}

async function api(action, body = {}, identity = null, {keepalive = false} = {}) {
  const get = action === 'config' || action === 'leaderboard' || action.startsWith('leaderboard?') || action.startsWith('shared-result?');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), ['create','join','solo-ticket','voice','signal'].includes(action)?15000:4500);
  try {
    const response = await fetch('/api/party/' + action, {
      method: get ? 'GET' : 'POST',
      headers: get ? {} : {'Content-Type': 'application/json', ...(identity ? {Authorization: 'Bearer ' + identity.token} : {})},
      body: get ? undefined : JSON.stringify(body),
      signal: controller.signal, keepalive, cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'server_error'), {code: data.error, status: response.status});
    return data;
  } finally {clearTimeout(timer);}
}
function saveSession() {
  if (session && !localRoom) write(sessionStorage, 'candy-room-v2', JSON.stringify({...session, seq}));
}
function accept(data) {
  const next = data?.room;
  if (!next || (room?.code === next.code && next.version < room.version)) return;
  const previousPhase = room?.phase, previousRound = room?.roundIndex, previousScore = score(mine());
  room = next; lastSuccess = Date.now(); online = true;
  if(data.resultId && session) resultIdentity = {runId:data.resultId,token:session.token,published:data.resultPublished};
  seq = Math.max(seq, mine()?.inputSeq ?? 0);
  if (previousRound !== room.roundIndex || room.phase !== 'playing' || mine()?.stunnedUntil > now()) {
    // A safety release must supersede every in-flight press, even if that press
    // has not appeared in a snapshot yet.
    if (holding) seq += 1;
    if(localRoom && holding && room.phase === 'playing') recordSolo(false);
    input.clear(); holding = false;
  }
  for (const event of room.events || []) {
    if (event.id <= lastEvent) continue;
    lastEvent = event.id;
    if (now() - event.at > 2300) continue;
    if (event.type === 'catch' && event.playerId === session?.playerId) {
      const lost = Math.max(0, Math.floor((Number(event.lost) || 0) + 1e-9));
      track('player_caught',{mode:localRoom?'solo':'friends',difficulty:room.difficulty,candy_lost:lost});
      feedback(lost > 0 ? tr('BONK! All ' + lost + ' treats confiscated.', '啪！' + lost + ' 颗糖，全部没收！')
        : tr('BONK! Caught red-handed.', '啪！抓到你了，糖果清零！'));
      sound('catch');
    } else if (event.type === 'warning') sound('warning');
  }
  if (score(mine()) > previousScore && holding === false && previousPhase === 'playing') sound('bank');
  if (room.phase === 'playing' && previousPhase !== 'playing') track('round_started',{mode:localRoom?'solo':'friends',difficulty:room.difficulty});
  if (previousPhase === 'finished' && room.phase !== 'finished') clearFinale();
  if (room.phase === 'finished' && previousPhase !== 'finished') {
    track('round_finished',{mode:localRoom?'solo':'friends',difficulty:room.difficulty,score:score(mine())});
    let record = false;
    if (localRoom) {
      record = score(mine()) > best;
      finishedBest = record;
      best = Math.max(best, score(mine()));
      write(localStorage, bestKey(), String(best));
    }
    sound(record ? 'best' : 'finish');
    celebrate(record);
  }
  saveSession(); render();
  if(!localRoom&&room.ownerId===session?.playerId){const latest=room.events?.at(-1)?.id||0;if(latest>lastSignalEvent){lastSignalEvent=latest;signaling.pulse(room.version);}}
}
function recordSolo(held) {
  if(!localRoom || localRoom.phase !== 'playing' || clock.now >= localRoom.endsAt)return;
  if((soloTrace.at(-1)?.held || false) === held)return;
  soloTrace.push({at:Math.max(0,clock.now-localRoom.startsAt),held});
}
async function command(commandValue, {silent = false, keepalive = false,announce=true} = {}) {
  if (!session || !room) return;
  if (localRoom) {
    try {
      if(commandValue.type === 'hold') recordSolo(commandValue.held);
      applyCommand(localRoom, session.playerId, commandValue, clock.now);
      localRoom.version += 1;
      accept({room: publicRoom(localRoom, session.playerId, clock.now)});
    } catch (error) {if (!silent) toast(errorCopy(error));}
    return;
  }
  const requestEpoch = epoch, identity = session, started = Date.now();
  try {
    const data = await api('state', {code: identity.code, playerId: identity.playerId, command: commandValue}, identity, {keepalive});
    if (requestEpoch !== epoch) return;
    if (room?.code === data.room?.code && data.room.version < room.version) return;
    if (Number.isFinite(data.serverNow)) offset = data.serverNow - (started + Date.now()) / 2;
    accept(data);
    if(announce&&commandValue?.type!=='heartbeat')signaling.pulse(data.room?.version);
  } catch (error) {
    if (requestEpoch !== epoch) return;
    if (['stale_round', 'round_not_playing'].includes(error.code)) return;
    if (error.status === 401 || ['invalid_membership', 'not_a_member', 'member_left', 'room_expired', 'room_not_found', 'room_version_changed'].includes(error.code)) {
      const message = errorCopy(error); resetRoom(false); toast(message); return;
    }
    if (!error.status) {online = false; clearHold(false); render();}
    if (!silent) toast(errorCopy(error));
  }
}
async function roomAction(commandValue) {
  if (roomBusy) return;
  const requestEpoch = epoch;
  roomBusy = true; render();
  try {await command(commandValue);} finally {if (epoch === requestEpoch) {roomBusy = false; render();}}
}
async function poll() {
  clearTimeout(pollTimer);
  if (!session || localRoom) return;
  const requestEpoch = epoch;
  if (pollFlight?.epoch === requestEpoch) return;
  rtmRefreshPending=false;
  const ticket = pollFlight = {epoch: requestEpoch};
  const next = pollCommand(room, session.playerId, holding, seq);
  seq = next.seq; saveSession();
  try {await command(next.command, {silent: true,announce:false});}
  finally {
    if (pollFlight === ticket) pollFlight = null;
    if (requestEpoch === epoch && session && !localRoom) {
      pollTimer = setTimeout(poll, rtmRefreshPending?40:document.hidden || !active() ? 900 : 250);
    }
  }
}
function startPoll() {clearTimeout(pollTimer); pollTimer = setTimeout(poll, 80);}
function leaveIdentity(identity) {
  if (identity?.token) void api('state', {code: identity.code, playerId: identity.playerId, command: {type: 'leave'}}, identity, {keepalive: true}).catch(() => {});
}
function resetRoom(sendLeave = true) {
  const oldIdentity = !localRoom ? session : null;
  epoch += 1; clearTimeout(pollTimer);void signaling.leave();lastSignalEvent=0;rtmRefreshPending=false;
  input.clear(); holding = false; session = room = localRoom = null;
  entryBusy = roomBusy = false; seq = lastEvent = 0; offset = 0;
  soloStarting = false; soloTicket = null; soloTrace = []; resultIdentity = null;
  publication = {state:'idle'}; publicationKey = '';
  finishedBest = false; rosterSignature = resultSignature = '';
  helpPausedLocal = false; clock.pause();
  leavePausedLocal = false;
  for (const id of ['help-dialog', 'pause-dialog', 'leave-dialog']) if ($(id).open) $(id).close();
  write(sessionStorage, 'candy-room-v2', null);
  write(sessionStorage, 'pumpkin-room', null);
  history.replaceState(null, '', lang === 'zh' ? '/zh' : '/');
  void voice.leave(); levels = {};
  if (sendLeave) {$('code-input').value='';leaveIdentity(oldIdentity);}
  show('stage-feedback', false); show('entry-error', false); clearFinale();
  setText('invite-status','');
  render();
}
function selectMode(nextMode) {
  if (mode === nextMode) return;
  resetRoom(); mode = nextMode; track('mode_selected',{mode:nextMode==='online'?'friends':'solo'}); render();
}
async function enter(action) {
  if (entryBusy || room || mode !== 'online') return;
  const name = $('name-input').value.trim(), code = $('code-input').value.trim().toUpperCase();
  if (!name || (action === 'join' && !/^[A-Z0-9]{6}$/.test(code))) {
    setText('entry-error', errorCopy({code: name ? 'invalid_code' : 'invalid_name'}));
    show('entry-error', true); $(name ? 'code-input' : 'name-input').focus(); return;
  }
  const requestEpoch = ++epoch;
  entryBusy = true; show('entry-error', false); render();
  try {
    const started = Date.now();
    const data = await api(action, {name, avatar, ...(action === 'join' ? {code} : {difficulty})});
    const identity = {code: data.room.code, playerId: data.playerId, token: data.token};
    if (requestEpoch !== epoch) {leaveIdentity(identity); return;}
    session = identity; seq = 0; lastEvent = 0;
    if (Number.isFinite(data.serverNow)) offset = data.serverNow - (started + Date.now()) / 2;
    write(localStorage, 'pumpkin-name', name);
    history.replaceState(null, '', roomPath(data.room.code));
    accept(data); track(action === 'create' ? 'room_created' : 'room_joined',{difficulty:data.room.difficulty}); startPoll(); void refreshConfig(true);
  } catch (error) {
    if (requestEpoch !== epoch) return;
    setText('entry-error', errorCopy(error)); show('entry-error', true);
  } finally {
    if (requestEpoch === epoch) {entryBusy = false; render();}
  }
}

async function startSolo() {
  if (!artReady || soloStarting) return;
  if(soundEnabled)void music.unlock();
  resetRoom(); mode = 'solo'; clock.reset(Date.now());
  const requestEpoch = epoch;
  soloStarting = true; render();
  let ticket;
  try {ticket = await api('solo-ticket',{difficulty,rulesVersion:GAME_VERSION});} catch {ticket = null;}
  if(requestEpoch !== epoch)return;
  soloTicket = ticket;
  soloStarting = false; clock.reset(Date.now());
  const name = $('name-input').value.trim() || tr('You', '你');
  const seed = soloTicket?.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
  localRoom = createRoom({code: 'SOLO', mode: 'solo', seed, difficulty, rulesVersion:soloTicket?.rulesVersion??GAME_VERSION, player: {id: 'you', name, avatar, uid: 1}}, clock.now);
  session = {code: 'SOLO', playerId: 'you', token: ''}; seq = 0; lastLocalTick = clock.now;
  applyCommand(localRoom, 'you', {type: 'ready', ready: true}, clock.now);
  applyCommand(localRoom, 'you', {type: 'start'}, clock.now);
  localRoom.version += 1; accept({room: publicRoom(localRoom, 'you', clock.now)});
  sound('bank');
}
function localTick(stamp) {
  if (!localRoom || !active()) return;
  const tick = clock.tick(stamp);
  if (tick.autoPaused) {pauseLocal(true); return;}
  if (clock.paused || tick.now - lastLocalTick < 60) return;
  lastLocalTick = tick.now;
  applyCommand(localRoom, 'you', {type: 'heartbeat'}, tick.now);
  localRoom.version += 1;
  accept({room: publicRoom(localRoom, 'you', tick.now)});
}
function pauseLocal(display = true) {
  if (!localRoom || !active()) return;
  clearHold(); clock.pause();syncMusic();
  if (display && !$('pause-dialog').open && !$('help-dialog').open) $('pause-dialog').showModal();
}
function resumeLocal() {
  if(soundEnabled)void music.unlock();
  if ($('pause-dialog').open) $('pause-dialog').close();
  if (localRoom && active()) clock.resume();syncMusic();
}
function canHold() {
  return artReady && room?.phase === 'playing' && !clockPaused()
    && !$('help-dialog').open && !$('pause-dialog').open && !$('leave-dialog').open
    && (mine()?.stunnedUntil || 0) <= now() && !lagging();
}
function leaveNeedsConfirm() {
  return !!room && ['lobby', 'countdown', 'playing'].includes(room.phase);
}
function matchInProgress() {
  return !!room && ['countdown', 'playing'].includes(room.phase);
}
function openLeaveDialog() {
  const match = matchInProgress();
  setText('leave-title', match ? t('leaveTitle') : t('leaveRoomTitle'));
  setText('leave-copy', match ? t('leaveCopy') : t('leaveRoomCopy'));
  setText('leave-confirm', match ? t('leaveConfirm') : t('leaveRoomConfirm'));
  setText('leave-stay', match ? t('leaveStay') : t('leaveRoomStay'));
  setText('leave-eyebrow', t('leaveEyebrow'));
  if ($('pause-dialog').open) $('pause-dialog').close();
  if (localRoom && active() && !clock.paused) {
    clearHold(); clock.pause(); leavePausedLocal = true; syncMusic();
  }
  if (!$('leave-dialog').open) $('leave-dialog').showModal();
}
function stayInMatch() {
  if ($('leave-dialog').open) $('leave-dialog').close();
  if (leavePausedLocal && localRoom && active() && !document.hidden) {
    leavePausedLocal = false; clock.resume(); syncMusic();
  } else {
    leavePausedLocal = false;
    if (clockPaused() && active() && !$('pause-dialog').open) $('pause-dialog').showModal();
  }
}
function requestLeave() {
  if (!leaveNeedsConfirm()) {resetRoom(); return;}
  openLeaveDialog();
}
function confirmLeave() {
  leavePausedLocal = false;
  if ($('leave-dialog').open) $('leave-dialog').close();
  resetRoom();
}
function clockPaused() {return !!localRoom && clock.paused;}
function updateHold() {
  const desired = input.held;
  if (desired === holding) return;
  if (desired && !canHold()) {input.clear(); return;}
  holding = desired; seq += 1; saveSession(); renderTimers();
  if (room?.phase === 'playing') void command({type: 'hold', held: holding, seq, roundIndex: room.roundIndex}, {silent: !holding, keepalive: !holding});
}
function clearHold(send = true) {
  input.clear();
  if (!holding) return;
  holding = false; seq += 1; saveSession();
  if (send && room?.phase === 'playing') void command({type: 'hold', held: false, seq, roundIndex: room.roundIndex}, {silent: true, keepalive: true});
  renderTimers();
}
for (const target of [$('hold-button'), $('party-canvas')]) {
  target.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !canHold()) return;
    if (!input.pressPointer(event.pointerId, event.isPrimary)) return;
    event.preventDefault(); target.setPointerCapture?.(event.pointerId); updateHold();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) target.addEventListener(type, event => {
    if (input.releasePointer(event.pointerId)) {event.preventDefault(); updateHold();}
  });
}
window.addEventListener('pointerup', event => {if (input.releasePointer(event.pointerId)) updateHold();});
window.addEventListener('pointercancel', event => {if (input.releasePointer(event.pointerId)) updateHold();});
window.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.repeat) return;
  const element = document.activeElement;
  if (element?.isContentEditable || (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(element?.tagName) && element !== $('hold-button'))) return;
  if (!canHold()) return;
  event.preventDefault(); input.pressKey(event.code); updateHold();
});
window.addEventListener('keyup', event => {
  if (input.releaseKey(event.code)) {event.preventDefault(); updateHold();}
});
window.addEventListener('blur', () => {clearHold(); pauseLocal();});
window.addEventListener('pagehide', () => {clearHold(); if (localRoom) clock.pause();});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {clearHold(); pauseLocal();}
  else if (session && !localRoom) startPoll();
});

function readyRoster() {
  const players = room?.players.filter(player => !player.left) || [];
  return players.length >= 2 && players.every(player => player.ready && player.online !== false);
}
function renderRoster() {
  const signature = JSON.stringify([room.ownerId, room.players.map(player => [player.id, player.avatar, player.name, player.ready, player.online, player.left]), lang]);
  if (signature !== rosterSignature) {
    rosterSignature = signature; $('roster').replaceChildren();
    for (const player of room.players.filter(member => !member.left)) {
      const row = node('div', 'roster-row'); row.dataset.offline = String(player.online === false);
      row.append(avatarElement(player));
      const name = node('span', 'roster-name', player.name);
      const role = player.id === session.playerId ? tr('you', '你') : player.id === room.ownerId ? tr('room host', '房主') : '';
      if (role) name.append(node('small', '', role));
      const status = node('span', 'roster-state', player.online === false ? tr('offline', '离线') : player.ready ? tr('✓ ready', '✓ 准备') : tr('waiting', '准备中'));
      status.dataset.ready = String(player.ready); row.append(name, status);
      if (isOwner() && player.online === false && player.id !== session.playerId) {
        const remove = node('button', 'remove-seat', tr('Remove', '移除'));
        remove.setAttribute('aria-label', tr('Remove offline player ', '移除离线玩家 ') + player.name);
        remove.addEventListener('click', () => roomAction({type: 'remove', playerId: player.id})); row.append(remove);
      }
      $('roster').append(row);
    }
  }
  setText('room-code', room.code);
  setText('room-count', room.players.filter(player => !player.left).length + '/6');
  setText('ready-button', mine()?.ready ? tr('✓ Ready · undo', '✓ 已准备 · 取消') : t('ready'));
  $('ready-button').disabled = roomBusy || !artReady;
  $('start-button').disabled = roomBusy || !artReady || !readyRoster();
  show('start-button', isOwner());
  setText('lobby-note', readyRoster()
    ? tr('All little hands ready. The room host can start.', '小手都准备好了，房主可以开始。')
    : room.players.filter(player => !player.left).length < 2
      ? tr('Copy the invite and bring a friend. You both get to steal.', '复制邀请，叫上一位朋友。你们都负责偷糖。')
      : tr('Everyone gets ready first. Lily watches all of you.', '等所有人准备好。女主人会同时盯着大家哦。'));
}
function renderResults() {
  const signature = JSON.stringify([room.players.map(player => [player.id, player.name, player.score, player.left]), room.ownerId, lang, finishedBest]);
  if (signature !== resultSignature) {
    resultSignature = signature;
    const players = orderedPlayers(), topScore = score(players[0]), winners = players.filter(player => score(player) === topScore);
    setText('result-eyebrow', localRoom ? score(mine()) ? tr('CANDY POCKETED. MAKE YOUR ESCAPE!', '糖果到手，快跑！') : tr('EMPTY POCKETS. INNOCENT FACE.', '口袋空空，表情无辜。') : tr('THE GREAT LITTLE CANDY COUNT', '来数数，谁最会偷。'));
    setText('result-title', localRoom ? finishedBest ? tr('A delicious new best!', '新纪录！藏得真好。')
      : score(mine()) ? tr('A very sweet little haul.', '今天收获满满。') : tr('Not a single crumb. Lily wins this one.', '一颗都没拿到，这局莉莉赢了。')
      : winners.length > 1 ? tr('A very sweet tie.', '一样厉害，甜蜜平局。') : winners[0]?.id === session.playerId ? tr('The candy crown is yours!', '偷糖冠军就是你！') : tr((winners[0]?.name || '') + ' takes the candy crown.', (winners[0]?.name || '') + ' 偷到了冠军。'));
    setText('result-score', score(mine()));
    setText('result-copy', localRoom
      ? tr('Caught ' + (mine()?.catches || 0) + ' times · Personal best ' + best, '被抓 ' + (mine()?.catches || 0) + ' 次 · 本机纪录 ' + best + ' 颗')
      : tr('Your place: ' + rank(mine()) + ' / ' + players.length + '. Candy left at zero decides the winner. Equal totals tie.', '你排第 ' + rank(mine()) + ' / ' + players.length + ' 名。按时间结束时剩余的整颗糖排名，同分并列。'));
    $('final-scores').replaceChildren();
    if (!localRoom) for (const player of players) {
      const row = node('div', 'final-row');
      row.append(node('small', '', rank(player)), avatarElement(player), node('span', '', player.name), node('b', '', score(player)));
      $('final-scores').append(row);
    }
  }
  setText('again-button', localRoom || isOwner() ? t('again') : tr('Waiting for the room host…', '等房主再开一局…'));
  $('again-button').disabled = !artReady || roomBusy || (!localRoom && !isOwner());
}
function renderPublication() {
  const key = localRoom ? soloTicket?.runId || 'offline-' + room.createdAt : resultIdentity?.runId || room.code + ':' + room.roundIndex;
  if(key !== publicationKey) {
    publicationKey = key; publication = {state:!localRoom && resultIdentity?.published || read(sessionStorage,'candy-published-' + key) ? 'submitted' : 'idle'};
    publishNameDefault = true; $('publish-name').value = t('anonymousUser'); setText('publish-name-feedback','');
  }
  if(!localRoom && resultIdentity?.published)publication.state = 'submitted';
  const available = !!(localRoom ? soloTicket : resultIdentity);
  const done = ['submitted','skipped'].includes(publication.state);
  show('publish-controls',!done && available);
  $('submit-score').disabled = !available || publication.state === 'submitting';
  $('skip-score').disabled = publication.state === 'submitting';
  $('publish-name').disabled = $('publish-random-name').disabled = publication.state === 'submitting';
  setText('submit-score',publication.state === 'submitting' ? tr('Submitting…','正在提交…') : t('submitScore'));
  setText('publish-copy',!available ? tr('This round stays on this device. Connect before starting a new game to join the leaderboard.','本局成绩仅保存在本机。联网后重新开局，即可选择加入排行榜。')
    : tr('Your name and score will be public. It is your choice.','你的名字和成绩会公开显示。由你决定是否提交。'));
  setText('publish-status', publication.state === 'submitted' ? tr('✓ Score added to the leaderboard.','✓ 成绩已加入排行榜。')
    : publication.state === 'skipped' ? tr('Kept private. Your score was not published.','已保留为私人记录，没有公开成绩。')
    : publication.error || '');
}
async function publishScore() {
  if(room?.phase !== 'finished' || publication.state === 'submitting' || publication.state === 'submitted')return;
  const identity = localRoom ? soloTicket : resultIdentity;
  if(!identity)return;
  const name = $('publish-name').value.trim();
  if(!name) {publication.error = errorCopy({code:'invalid_name'});renderPublication();$('publish-name').focus();return;}
  const key = publicationKey;
  publication = {state:'submitting'};renderPublication();
  try {
    await api('submit-score',{runId:identity.runId,name,...(localRoom ? {trace:soloTrace} : {})},identity);
    write(sessionStorage,'candy-published-' + key,'true');
    if(publicationKey === key) {track('leaderboard_submitted',{mode:localRoom?'solo':'friends',difficulty:room.difficulty,score:score(mine())});publication = {state:'submitted'};renderPublication();if(boardOnDesktop())void refreshBoard();}
  } catch(error) {
    if(publicationKey === key) {publication = {state:'error',error:errorCopy(error)};renderPublication();}
  }
}
function renderBoardStatus(){setText('board-status',boardState === 'ready' ? '' : t({loading:'boardLoading',empty:'boardEmpty',error:'boardError'}[boardState]));}
async function refreshBoard() {
  const ticket = ++boardEpoch;
  $('board-rows').replaceChildren();
  boardState='loading';renderBoardStatus();
  try {
    const board = await api('leaderboard');
    if(ticket !== boardEpoch)return;
    for(const entry of board.entries) {
      const row = node('tr');
      row.append(node('td','',entry.rank),node('td','',entry.name),node('td','',entry.score));
      $('board-rows').append(row);
    }
    boardState=board.entries.length ? 'ready' : 'empty';renderBoardStatus();
  } catch {
    if(ticket === boardEpoch){boardState='error';renderBoardStatus();}
  }
}
const desktopMedia=window.matchMedia?.('(min-width:1100px)');
const boardOnDesktop=()=>!!desktopMedia?.matches;
function placeBoard(){
  const target=$(boardOnDesktop()?'desktop-board':'board-modal-slot');
  if($('board-content').parentElement!==target)target.append($('board-content'));
  if(boardOnDesktop()&&$('leaderboard-dialog').open)$('leaderboard-dialog').close();
  if(boardOnDesktop())void refreshBoard();
}
function openBoard() {
  clearHold();
  if(localRoom && active())pauseLocal();
  if(boardOnDesktop())$('desktop-board').scrollIntoView({block:'nearest'});
  else $('leaderboard-dialog').showModal();
  void refreshBoard();
}
function renderTimers() {
  const time = now(), player = mine(), phase = room?.phase;
  const stunned = (player?.stunnedUntil || 0) > time, lag = lagging();
  const warningLeft = phase === 'playing' && room.attention === 'warning'
    ? Math.max(0, Math.min(1, (room.lookAt - time) / (room.warningMs || 900))) : 0;
  $('attention-pill').style.setProperty('--warning-left', warningLeft.toFixed(3));
  setText('banked-score', score(player));
  const secondsLeft = phase === 'playing' ? Math.max(0, Math.ceil((room.endsAt - time) / 1000)) : phase === 'finished' ? 0 : 60;
  setText('time-left', secondsLeft);
  const urgent = phase === 'playing' && secondsLeft > 0 && secondsLeft <= 10;
  $('match-timer').dataset.urgency = urgent ? secondsLeft <= 5 ? 'final' : 'soon' : 'normal';
  $('match-timer').dataset.paused = String(!!localRoom && clock.paused);
  setText('timer-alert',urgent ? tr('Final ten seconds!', '最后十秒！') : '');
  if (phase === 'countdown') setText('countdown-number', Math.max(1, Math.ceil((room.startsAt - time) / 1000)));
  const speed = holding && player?.holding ? Math.min(12, 6 + Math.max(0, time - player.heldSince) / 1000 * 3) : 6;
  setText('speed-label', speed.toFixed(0) + tr(' / sec', ' / 秒'));
  $('speed-fill').style.width = ((speed - 6) / 6 * 82 + 18) + '%';
  const heldCandy = player?.wholePending ?? Math.floor(player?.pending || 0);
  setText('pending-label', tr(heldCandy + ' in your hands · included above. Get caught, lose everything.', '手里 ' + heldCandy + ' 颗，已计入总数。被抓全部清零！'));
  $('hold-button').disabled = !canHold();
  $('hold-button').dataset.held = String(holding);
  $('hold-button').dataset.danger = String(room?.attention === 'watching' && !stunned);
  $('hold-button').setAttribute('aria-pressed', String(holding));
  setText('hold-label', lag ? tr('Reconnecting…', '正在重连…')
    : stunned ? tr('Caught! Back in ' + Math.ceil((player.stunnedUntil - time) / 1000) + 's', '被抓包 · ' + Math.ceil((player.stunnedUntil - time) / 1000) + ' 秒')
    : room?.attention === 'watching' ? tr('Stay still', '别动')
    : holding ? tr('Release to hide', '松手装乖')
    : tr('Hold to steal', '按住偷糖'));
  setText('hold-copy', stunned ? tr('Candy lost. Try again soon.', '糖果全部没收，稍后再试')
    : room?.attention === 'watching' ? tr('Hold now = caught', '现在按住就会被抓')
    : room?.attention === 'warning' ? tr("She’s turning. Release!", '她要回头啦，快松手装乖！')
    : holding ? tr('Watch for her turn', '注意回头预警')
    : tr('Release to hide', '松手装乖'));
  show('network-note', lag);
  if (lag) setText('network-note', tr('Connection is delayed. Your little hands have stopped. Reconnecting…', '连接有延迟，已停止偷糖。正在重新连接……'));
  if (room && !localRoom) {
    setText('live-rank', rank(player));
    setText('rank-total', '/ ' + room.players.length);
  }
}
function render() {
  const phase = room?.phase || 'home', playing = phase === 'playing', inMatch = active();
  const previousView=document.body.dataset.view;
  document.body.dataset.view = phase; document.body.dataset.mode = mode;
  if(previousView!==phase)window.scrollTo?.(0,0);
  const joinCode = $('code-input').value.trim().toUpperCase();
  const invited = /^[A-Z0-9]{6}$/.test(joinCode);
  document.body.dataset.entry = invited ? 'join' : 'create';
  setText('online-title', invited ? tr('Join your friends.', '加入朋友的小分队。') : t('roomTitle'));
  setText('entry-copy', invited ? tr('Room ' + joinCode + ' · Enter your name to join.', '房间 ' + joinCode + ' · 填好名字就能加入。')
    : tr('Create a room, or enter a friend’s six-digit code. Everyone gets to steal.', '创建房间，或输入朋友的 6 位房间码。大家一起偷糖。'));
  document.body.dataset.attention = room?.attention || 'away';
  $('mode-solo').setAttribute('aria-pressed', String(mode === 'solo'));
  $('mode-online').setAttribute('aria-pressed', String(mode === 'online'));
  show('online-panel', mode === 'online' && !room);
  show('lobby-panel', phase === 'lobby');
  show('result-panel', phase === 'finished');
  show('countdown-overlay', phase === 'countdown');
  show('welcome-sticker', mode === 'solo' && !room);
  show('profile-block', !room);
  show('progress-block', inMatch || phase === 'finished');
  show('solo-start', mode === 'solo' && !room);
  show('hold-button', playing);
  show('waiting-note', !playing && !(mode === 'solo' && !room));
  show('best-block', mode === 'solo');
  show('match-block', mode === 'online' && !!room);
  show('pause-button', !!localRoom && inMatch);
  show('exit-match', inMatch);
  show('local-note', !room && mode === 'solo');
  show('voice-bar', mode === 'online' && !!room);
  show('home-info', !room);
  setText('voice-room-title', room ? tr('Room ', '房间 ') + room.code + ' · ' + room.players.filter(p=>!p.left).length + '/6' : tr('Room voice','房间语音'));
  show('scene-badge', !['lobby', 'finished'].includes(phase));
  $('solo-start').disabled = !artReady || soloStarting;
  setText('solo-start-label', soloStarting ? tr('Preparing your game…', '正在准备游戏…') : t('soloStart'));
  const level = room?.difficulty || difficulty;
  for(const key of Object.keys(DIFFICULTIES)) {
    $('difficulty-' + key).disabled = !!room || soloStarting;
  }
  difficultyChoice.setValue(level);
  $('create-button').disabled = $('join-button').disabled = entryBusy;
  $('random-name').disabled = $('name-input').disabled = entryBusy;
  setText('create-button-label', entryBusy ? tr('Connecting…', '正在连接…') : t('create'));
  setText('join-button', entryBusy ? tr('Joining…', '正在加入…') : t('join'));
  setText('best-score', best);
  setText('waiting-copy', phase === 'countdown' ? tr('Ready… steady… tiny hands!', '准备好你的小手……')
    : phase === 'finished' ? tr('A perfectly innocent little victory.', '今天也是清白的一天。')
    : tr('Bring your friends. Make a little mischief.', '叫上朋友，厨房更热闹。'));
  setText('scene-badge-text', localRoom || mode === 'solo' ? tr('SOLO · LOCAL PLAY', '单人 · 本地开玩')
    : room ? tr('ROOM ', '房间 ') + room.code + ' · ' + room.players.filter(player => !player.left).length + tr(' rascals', ' 只小坏蛋')
    : tr('2–6 FRIENDS · ONE KITCHEN', '2–6 位朋友 · 同一间厨房'));
  const attention = room?.attention || 'away';
  setText('attention-label', attention === 'warning' ? tr("She's turning! Let go!", '她要回头！快松手')
    : attention === 'watching' ? tr("Don't. Move.", '她盯着呢！别动')
    : tr("She's busy. Hehe.", '她正忙着呢，嘿嘿。'));
  document.querySelectorAll('.avatar-choice').forEach((button, index) => {
    const selected = index === avatar;
    button.disabled = !!room || entryBusy || soloStarting; button.setAttribute('aria-pressed', String(selected));
    button.children[1].textContent = characterName(index);
    button.children[2].textContent = selected ? tr('✓ Selected','✓ 已选择') : tr('Select','点击选择');
  });
  if (phase === 'lobby') renderRoster();
  if (phase === 'finished') {renderResults(); renderPublication();}
  show('music-button',mode==='solo'&&phase!=='finished');
  const musicOn=soundEnabled&&musicEnabled;
  $('music-button').setAttribute('aria-pressed',String(musicOn));
  $('music-button').setAttribute('aria-label',musicOn?tr('Music on','音乐已开'):tr('Music off','音乐已关'));
  $('music-button').setAttribute('title',tr('Music plays during solo rounds. Tap to change it.','仅在单人游戏中播放，点击开关音乐。'));
  renderVoice(); renderTimers(); resultSharing.refresh();syncMusic();syncSignaling();
}

const voice = createVoice({
  getCredentials: async () => {
    const identity = session, requestEpoch = epoch;
    if (!identity || localRoom) throw Object.assign(new Error('voice_not_member'), {code: 'voice_not_member'});
    const credentials = await api('voice', {code: identity.code, playerId: identity.playerId}, identity);
    if (requestEpoch !== epoch) throw Object.assign(new Error('voice_session_changed'), {code: 'voice_session_changed'});
    return credentials;
  },
  onStatus: status => {if(status.state==='connected' && voiceState.state!=='connected')track('voice_connected',{mode:'friends'});voiceState = status; renderVoice();},
  onLevels: value => {levels = value;},
});
function refreshConfig(force = false) {
  if (configPromise) return configPromise;
  if (!force && typeof config.voiceConfigured === 'boolean') return Promise.resolve(config);
  configState = 'loading'; renderVoice();
  configPromise = api('config').then(value => {
    if (typeof value.voiceConfigured !== 'boolean') throw new Error('invalid_config');
    config = value; configState = 'ready'; return value;
  }).catch(() => {
    config = {voiceConfigured: null}; configState = 'error'; return config;
  }).finally(() => {configPromise = null; renderVoice();});
  return configPromise;
}
function renderVoice() {
  const joined = ['connected', 'autoplay-blocked', 'reconnecting'].includes(voiceState.state);
  let label = t('voiceJoin'), status = tr('Join a room, then turn on your microphone.', '加入房间后，和朋友一起开麦。');
  if (room) {
    status = config.voiceConfigured ? tr('Voice is optional. You can play while muted.', '语音可选，静音也能正常偷糖。')
      : configState === 'loading' ? tr('Checking the voice connection…', '正在检查语音连接……')
      : configState === 'error' ? tr('Voice status could not load. Tap to retry.', '没能取得语音状态，点击即可重试。')
      : tr('Voice is not configured. The game is ready to play.', '语音尚未配置，游戏可以正常玩。');
    if (configState === 'error') label = tr('Retry voice', '重试语音');
  }
  if (voiceState.state === 'connecting') {status = tr('Connecting to your voice room…', '正在连接语音房间……'); label = tr('Connecting…', '连接中…');}
  if (voiceState.state === 'connected') {status = voiceState.muted ? tr('Connected · microphone muted', '语音已连接 · 麦克风静音') : tr('Connected · your friends can hear you', '语音已连接 · 朋友能听见你'); label = voiceState.muted ? tr('Unmute', '打开麦克风') : tr('Mute', '静音');}
  if (voiceState.state === 'reconnecting') {status = tr('Voice is reconnecting…', '语音正在重连……'); label = voiceState.muted ? tr('Unmute', '打开麦克风') : tr('Mute', '静音');}
  if (voiceState.state === 'autoplay-blocked') {status = tr('Tap once more to enable voice sound.', '再点击一次，以开启语音声音。'); label = tr('Enable sound', '开启声音');}
  if (voiceState.state === 'error') status = errorCopy({code: voiceState.errorCode});
  setText('voice-status', status); setText('voice-button', label);
  $('voice-status').dataset.errorCode = voiceState.errorCode || '';
  $('voice-button').disabled = !room || !!localRoom || config.voiceConfigured === false || configState === 'loading' || voiceState.state === 'connecting';
  $('voice-button').dataset.active = String(joined);
  show('voice-leave', joined || voiceState.state === 'connecting');
}
function refreshFromSignal(){
  if(!session||localRoom)return;rtmRefreshPending=true;clearTimeout(pollTimer);pollTimer=setTimeout(poll,40);
}
const signaling=createSignaling({
  getCredentials:async()=>{const identity=session,started=epoch;if(!identity||localRoom)throw new Error('signal_not_member');
    const result=await api('signal',{code:identity.code,playerId:identity.playerId},identity);if(started!==epoch)throw new Error('signal_session_changed');return result;},
  onHint:refreshFromSignal,
  onStatus:state=>{signalState=state;document.body.dataset.rtm=state.state;renderSignal();},
  onTraffic:traffic=>{document.body.dataset.rtmSent=String(traffic.sent);document.body.dataset.rtmReceived=String(traffic.received);},
});
function syncSignaling(){if(session&&!localRoom)void signaling.connect(session.code+':'+session.playerId);renderSignal();}
function renderSignal(){
  const visible=!!room&&!localRoom;show('signal-line',visible);
  const state=signalState.state;
  setText('signal-status',state==='connected'?tr('RTM live sync','RTM 实时同步'):state==='connecting'?tr('Connecting live sync…','正在连接实时同步…'):state==='reconnecting'?tr('Reconnecting sync…','正在重连同步…'):tr('Backup sync active','备用同步已启用'));
  $('signal-status').dataset.state=state;$('signal-status').dataset.errorCode=signalState.errorCode||'';
  show('signal-retry',visible&&['error','reconnecting'].includes(state));setText('signal-retry',tr('Retry','重试'));
}
function applyLanguage() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = PAGE_META[lang].title;
  const home=lang==='zh'?'/zh':'/';
  for(const page of ['privacy','terms'])$('home-link-'+page).setAttribute('href',home==='/'?'/'+page:home+'/'+page);
  $('home-link-home-how').setAttribute('href',home+'#home-how');
  $('home-link-faq').setAttribute('href',home+'#faq');
  const brand=$('brand-link'); if(brand) brand.setAttribute('href',home);
  $('meta-description').content = PAGE_META[lang].description;
  for(const type of ['og','twitter']) {
    $('meta-' + type + '-title').content = PAGE_META[lang].title;
    $('meta-' + type + '-description').content = PAGE_META[lang].description;
  }
  $('meta-og-locale').content = PAGE_META[lang].locale;
  $('brand-link').setAttribute('aria-label', tr('Trick or Take home', 'Trick or Take 首页'));
  $('code-input').setAttribute('aria-label', tr('Six-digit room code', '6 位数字房间码'));
  $('invite-button').setAttribute('aria-label', tr('Copy room invitation', '复制房间邀请'));
  $('copy-room-code').setAttribute('aria-label',tr('Copy room code','复制房间码'));
  $('voice-bar').setAttribute('aria-label', tr('Room voice chat', '房间语音'));
  $('close-leaderboard').setAttribute('aria-label',tr('Close leaderboard','关闭排行榜'));
  $('close-help').setAttribute('aria-label',tr('Close the guide','关闭说明'));
  $('avatar-picker').setAttribute('aria-label',t('pickCharacter'));
  $('leaderboard-button').setAttribute('aria-label',t('leaderboard'));
  $('close-help').setAttribute('aria-label',tr('Close how to play','关闭玩法说明'));
  $('random-name').setAttribute('aria-label',tr('Generate a random name','随机生成名字'));
  $('random-name').setAttribute('title',tr('Roll for another name','掷骰子，换个名字'));
  $('publish-random-name').setAttribute('title',t('randomNameTitle'));
  document.querySelectorAll('[data-i18n]').forEach(element => {element.textContent = t(element.dataset.i18n);});
  document.querySelectorAll('[data-aria]').forEach(element => element.setAttribute('aria-label',t(element.dataset.aria)));
  document.querySelectorAll('[data-placeholder]').forEach(element => {element.placeholder = t(element.dataset.placeholder);});
  setText('language-button', lang === 'zh' ? 'EN' : '中文');
  $('sound-button').setAttribute('aria-label', soundEnabled ? tr('Mute music and effects', '关闭音乐与音效') : tr('Enable music and effects', '开启音乐与音效'));
  $('sound-button').setAttribute('title',tr('Playful Halloween music in solo. Music is off with friends.','单人模式有活泼的万圣节配乐，多人模式不播放背景音乐。'));
  $('sound-button').setAttribute('aria-pressed', String(soundEnabled));
  $('help-button').setAttribute('aria-label', tr('How to play', '游戏说明'));
  $('pause-button').setAttribute('aria-label', tr('Pause local game', '暂停本地游戏'));
  $('party-canvas').setAttribute('aria-label', tr('A 2D cartoon Halloween kitchen. Lily is busy while little ghosts sneak candy. Hold to steal and release to freeze.', '2D 万圣节小厨房，女主人忙碌，小鬼偷偷拿糖。按住偷糖，松手定住。'));
  document.querySelectorAll('.avatar-choice').forEach((button, index) => {button.setAttribute('aria-label', lang === 'zh' ? ['糯米小鬼', '南瓜憨憨', '蝙蝠小猫'][index] : ['Mochi', 'Pumpkin', 'Bat Cat'][index]);});
  write(localStorage, 'pumpkin-language', lang);
  if (publishNameDefault && room?.phase === 'finished') $('publish-name').value = t('anonymousUser');
  rosterSignature = resultSignature = ''; render(); renderArt(); renderBoardStatus();
}
function renderArt() {
  document.body.dataset.assets = artReady ? 'ready' : artFailed ? 'error' : 'loading';
  $('party-canvas').setAttribute('aria-busy',String(!artReady));
  show('loading-overlay', !artReady); show('retry-art', artFailed);
  setText('loading-label',t(artFailed ? 'artError' : 'loadingTitle'));
  setText('loading-detail',t(artFailed ? 'artErrorDetail' : 'loadingDetail'));
  setText('retry-art',t('retryArt'));
}
async function watchArt(promise) {
  artReady = false; artFailed = false; renderArt(); render();
  let result;
  try {result = await promise;} catch {result = {ok: false};}
  artReady = !!result?.ok; artFailed = !artReady;
  renderArt(); render();
}

function openHelp() {
  clearHold(); helpPausedLocal = !!localRoom && active() && !clock.paused;
  if (helpPausedLocal) pauseLocal(false);
  if (!$('help-dialog').open) $('help-dialog').showModal();
}
function closeHelp() {if ($('help-dialog').open) $('help-dialog').close();}
$('help-dialog').addEventListener('close', () => {
  if (helpPausedLocal && localRoom && active() && !document.hidden && !$('leave-dialog').open) clock.resume();
  helpPausedLocal = false;
  if (clockPaused() && active() && !$('pause-dialog').open && !$('leave-dialog').open) $('pause-dialog').showModal();
});
$('pause-dialog').addEventListener('cancel', event => {event.preventDefault(); resumeLocal();});

$('mode-solo').addEventListener('click', () => selectMode('solo'));
$('mode-online').addEventListener('click', () => selectMode('online'));
$('solo-start').addEventListener('click', startSolo);
$('create-button').addEventListener('click', () => enter('create'));
$('random-name').addEventListener('click', () => {
  if(entryBusy || room)return;
  const name = randomNickname(lang,$('name-input').value);
  $('name-input').value = name;write(localStorage,'pumpkin-name',name);
  show('entry-error',false);setText('name-feedback',tr('Your name: ','你的名字：')+name);
});
$('join-button').addEventListener('click', () => enter('join'));
$('code-input').addEventListener('input', event => {event.target.value = event.target.value.replace(/[^0-9]/g, '');render();});
$('code-input').addEventListener('keydown', event => {if (event.key === 'Enter') void enter('join');});
$('name-input').addEventListener('keydown', event => {if (event.key === 'Enter') void enter($('code-input').value ? 'join' : 'create');});
$('ready-button').addEventListener('click', () => roomAction({type: 'ready', ready: !mine()?.ready}));
$('start-button').addEventListener('click', () => roomAction({type: 'start'}));
for (const id of ['leave-button', 'exit-match', 'pause-exit']) $(id).addEventListener('click', requestLeave);
$('result-exit').addEventListener('click', () => resetRoom());
$('leave-stay').addEventListener('click', stayInMatch);
$('leave-confirm').addEventListener('click', confirmLeave);
$('leave-dialog').addEventListener('cancel', event => {event.preventDefault(); stayInMatch();});
function backdropDismiss(id, dismiss) {
  const dialog = $(id);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect?.();
    if (box && box.width && box.height) {
      const {clientX: x, clientY: y} = event;
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return;
    }
    dismiss();
  });
}
backdropDismiss('help-dialog', closeHelp);
backdropDismiss('leaderboard-dialog', () => {$('leaderboard-dialog').close(); boardEpoch++;});
backdropDismiss('pause-dialog', resumeLocal);
backdropDismiss('leave-dialog', stayInMatch);
$('again-button').addEventListener('click', () => {if (localRoom) startSolo(); else void roomAction({type: 'again'});});
$('pause-button').addEventListener('click', () => pauseLocal());
$('resume-button').addEventListener('click', resumeLocal);
window.addEventListener('beforeunload', event => {
  if (!matchInProgress()) return;
  event.preventDefault();
  event.returnValue = '';
});
$('help-button').addEventListener('click', openHelp);
$('home-guide-button').addEventListener('click', openHelp);
for(const id of ['home-how','faq'])$('home-link-'+id).addEventListener('click',event=>{
  event.preventDefault();const target=$(id);
  const params=new URLSearchParams(location.search);params.delete('lang');
  const query=params.toString();
  history.replaceState(null,'',(lang==='zh'?'/zh':'/')+(query?'?'+query:'')+'#'+id);
  target.scrollIntoView({block:'start'});
});
for (const id of ['close-help', 'got-it']) $(id).addEventListener('click', closeHelp);
$('language-button').addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  const params = new URLSearchParams(location.search); params.delete('lang');
  const path = lang === 'zh' ? '/zh' : '/';
  const query = params.toString();
  history.replaceState(null,'',path+(query?'?'+query:'')+(location.hash||''));applyLanguage();
});
const difficultyChoice = createChoiceGroup(Object.keys(DIFFICULTIES).map(level=>[level,$('difficulty-' + level)]),difficulty,level=>{
  if(room || soloStarting)return;
  difficulty = level;track('difficulty_selected',{difficulty:level});write(localStorage,'candy-difficulty',level);
  best = Math.max(0,Number(read(localStorage,bestKey())) || 0);render();
});
$('submit-score').addEventListener('click',publishScore);
$('publish-name').addEventListener('input',()=>{publishNameDefault=false;});
$('publish-random-name').addEventListener('click',()=>{
  const name=randomNickname(lang,$('publish-name').value);publishNameDefault=false;$('publish-name').value=name;
  setText('publish-name-feedback',tr('Public name: ','公开名字：')+name);
});
$('skip-score').addEventListener('click',()=>{track('leaderboard_skipped',{mode:localRoom?'solo':'friends',difficulty:room?.difficulty});publication = {state:'skipped'};renderPublication();});
$('leaderboard-button').addEventListener('click',openBoard);
$('view-results-board').addEventListener('click',openBoard);
$('signal-retry').addEventListener('click',()=>{if(session&&!localRoom)void signaling.connect(session.code+':'+session.playerId,true);});
$('music-button').addEventListener('click',()=>{if(soundEnabled&&musicEnabled)musicEnabled=false;else{musicEnabled=true;soundEnabled=true;write(localStorage,'candy-sound','true');void music.unlock();}write(localStorage,'candy-music',String(musicEnabled));applyLanguage();});
$('close-leaderboard').addEventListener('click',()=>{$('leaderboard-dialog').close();boardEpoch++;});
desktopMedia?.addEventListener?.('change',placeBoard);
placeBoard();
$('board-refresh').addEventListener('click',refreshBoard);
const resultSharing=createResultSharing({document,navigator,nav:navigator,track,origin:location.origin,search:location.search,request:api,
  getContext:()=>({lang,key:publicationKey+':'+lang,available:room?.phase==='finished'&&!!(localRoom?soloTicket:resultIdentity),canStart:!room&&artReady,
    identity:localRoom?soloTicket:resultIdentity,body:{runId:(localRoom?soloTicket:resultIdentity)?.runId,...(localRoom?{trace:soloTrace}:{})}}),
  onChallenge:result=>{difficulty=result.difficulty;write(localStorage,'candy-difficulty',difficulty);mode='solo';difficultyChoice.setValue(difficulty);void startSolo();},
});
$('sound-button').addEventListener('click', () => {
  soundEnabled = !soundEnabled;if(soundEnabled)void music.unlock(); write(localStorage, 'candy-sound', String(soundEnabled)); applyLanguage(); sound('bank');
});
$('retry-art').addEventListener('click', () => watchArt(scene.retryAssets()));
$('voice-button').addEventListener('click', async () => {
  clearHold();
  try {
    if (config.voiceConfigured !== true) {
      const nextConfig = await refreshConfig(true);
      if (nextConfig.voiceConfigured !== true) {
        toast(nextConfig.voiceConfigured === false ? errorCopy({code: 'voice_unconfigured'}) : tr('Could not check voice. Please try again.', '暂时连接不到语音服务，请再试一次。'));
        return;
      }
    }
    if (['connected', 'reconnecting'].includes(voiceState.state)) await voice.mute(!voiceState.muted);
    else await voice.join();
  } catch (error) {toast(errorCopy(error));}
});
$('voice-leave').addEventListener('click', () => voice.leave());
$('invite-button').addEventListener('click', async () => {
  if (!room || localRoom) return;
  const code = room.code, link = location.origin + roomPath(code);
  try {await navigator.clipboard.writeText(link); setText('invite-status',tr('Invite link copied. Send it to a friend.','邀请链接已复制，发给朋友吧。'));}
  catch {setText('invite-status',tr('Copy the page address to invite a friend.','可以复制当前页面地址，邀请朋友加入。'));}
});
$('copy-room-code').addEventListener('click',async()=>{
  if(!room || localRoom)return;
  try {await navigator.clipboard.writeText(room.code);setText('invite-status',tr('Room code copied: ','房间码已复制：')+room.code);}
  catch {setText('invite-status',tr('Room code: ','房间码：')+room.code);}
});
function characterName(index) {return (lang === 'zh' ? ['糯米小鬼','南瓜憨憨','蝙蝠小猫'] : ['Mochi','Pumpkin','Bat Cat'])[index];}
$('avatar-picker').replaceChildren();
$('avatar-picker').setAttribute('aria-busy','false');
for (let index = 0; index < 3; index++) {
  const button = node('button', 'avatar-choice');
  button.id = 'character-' + index;
  button.append(avatarElement({avatar: index}),node('strong','avatar-name'),node('span','avatar-state'));
  button.addEventListener('click', () => {
    if (room || entryBusy || soloStarting) return;
    avatar = index; write(localStorage, 'pumpkin-avatar', String(avatar)); render();
  });
  $('avatar-picker').append(button);
}
$('name-input').value = read(localStorage, 'pumpkin-name') || '';
const requested = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
if (requested) {mode = 'online'; $('code-input').value = requested.replace(/[^A-Z0-9]/g, '').slice(0, 6);}
applyLanguage();
void watchArt(scene.ready);
void refreshConfig();

async function restore() {
  let saved;
  try {saved = JSON.parse(read(sessionStorage, 'candy-room-v2') || 'null');} catch {}
  if (!saved?.token || !saved.code || (requested && requested !== saved.code)) return;
  mode = 'online'; session = saved; seq = Number.isSafeInteger(saved.seq) ? saved.seq : 0;
  const requestEpoch = ++epoch, started = Date.now();
  try {
    const data = await api('state', {code: saved.code, playerId: saved.playerId, command: {type: 'heartbeat'}}, saved);
    if (requestEpoch !== epoch) return;
    if (Number.isFinite(data.serverNow)) offset = data.serverNow - (started + Date.now()) / 2;
    accept(data);
    if (mine()?.holding) {
      seq += 1;
      await command({type: 'hold', held: false, seq, roundIndex: room.roundIndex}, {silent: true});
    }
    if (requestEpoch !== epoch) return;
    history.replaceState(null, '', roomPath(saved.code)); startPoll(); void refreshConfig(true); render();
  } catch (error) {
    if (requestEpoch !== epoch) return;
    resetRoom(false); if (error.code === 'room_version_changed') toast(errorCopy(error));
  }
}
void restore();
function frame(stamp) {
  localTick(stamp);
  if (stamp - lastUi > 80) {
    lastUi = stamp;
    if (lagging() && holding) clearHold();
    renderTimers();
  }
  scene.update(room, session?.playerId, {
    time: localRoom && active() ? clock.now / 1000 : stamp / 1000,
    holding, levels, now: now(), lang, avatar, previewCount:mode==='online'?2:1,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.body.dataset.boot = 'ready';
