// Agora is loaded only after an explicit voice-join action. Game state never
// travels over this module: the authenticated room API remains authoritative.
const SDK_URL = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.24.8.js';
let sdkLoading;
export const VOICE_TIMEOUTS = Object.freeze({loading: 22000, joining: 15000, microphone: 30000, publishing: 15000, cleanup: 3000});
const voiceNow = () => globalThis.performance?.now?.() ?? Date.now();
const voiceError = code => Object.assign(new Error(code), {code});
const ERROR_ENUM = /^[A-Za-z][A-Za-z0-9_]{1,60}$/;
const SERVER_ERROR_CODES = new Set([
  'voice_unconfigured', 'voice_unavailable', 'invalid_voice_identity',
  'voice_not_member', 'room_expired', 'invalid_voice_credentials', 'voice_session_changed',
]);

function diagnosticCode(error) {
  // API callers may throw Error(serverCode). Recover only our known server enums;
  // arbitrary exception messages, SDK detail objects, and tokens are never copied.
  const candidate = typeof error?.code === 'string' ? error.code
    : SERVER_ERROR_CODES.has(error?.message) ? error.message : error?.name;
  return typeof candidate === 'string' && candidate !== 'Error' && ERROR_ENUM.test(candidate)
    ? candidate : undefined;
}

function loadSdk() {
  if (globalThis.AgoraRTC?.createClient && globalThis.AgoraRTC?.createMicrophoneAudioTrack) {
    return Promise.resolve(globalThis.AgoraRTC);
  }
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise((resolve, reject) => {
    if (!globalThis.document) {
      reject(Object.assign(new Error('voice_sdk_load'), {code: 'voice_sdk_load'}));
      return;
    }
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    const timeout = setTimeout(() => finish(false), 20_000);
    function finish(success) {
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (success && globalThis.AgoraRTC?.createClient) resolve(globalThis.AgoraRTC);
      else {
        script.remove();
        reject(Object.assign(new Error('voice_sdk_load'), {code: 'voice_sdk_load'}));
      }
    }
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    document.head.append(script);
  }).catch(error => {
    sdkLoading = undefined;
    throw error;
  });
  return sdkLoading;
}

function friendlyError(error) {
  const code = error?.code || error?.name || error?.message;
  let message = 'Voice could not connect. Please try again.';
  if (['PERMISSION_DENIED', 'NotAllowedError', 'SecurityError'].includes(code)) {
    message = 'Microphone permission was denied. Allow microphone access and try again.';
  } else if (['DEVICE_NOT_FOUND', 'NotFoundError', 'DEVICES_NOT_FOUND'].includes(code)) {
    message = 'No microphone was found. Connect a microphone and try again.';
  } else if (['NOT_READABLE', 'NotReadableError', 'TRACK_IS_DISABLED'].includes(code)) {
    message = 'The microphone is unavailable. Check other apps and try again.';
  } else if (code === 'WEB_SECURITY_RESTRICT') {
    message = 'Voice needs a secure HTTPS connection.';
  } else if (code === 'voice_unconfigured' || error?.message === 'voice_unconfigured') {
    message = 'Voice is not configured yet. You can still play the game.';
  } else if (code === 'voice_microphone_timeout') {
    message = 'The microphone did not open. Check browser and macOS microphone permissions, then retry.';
  } else if (['voice_joining_timeout', 'voice_publishing_timeout'].includes(code)) {
    message = 'Voice connection timed out. Check your network or VPN, then retry.';
  } else if (code === 'voice_loading_timeout') {
    message = 'Voice setup timed out. Please retry.';
  } else if (code === 'voice_sdk_load') {
    message = 'The voice service could not load. Check your connection and try again.';
  } else if (code === 'voice_session_changed') {
    message = 'Your voice session changed. Join voice again.';
  } else if (code === 'voice_autoplay') {
    message = 'Tap Join voice again to enable sound.';
  }
  return Object.assign(new Error(message), {code});
}

function validateCredentials(value) {
  if (!value || !/^[a-f0-9]{32}$/i.test(value.appId)
      || typeof value.channel !== 'string' || !/^[a-z0-9_-]{1,63}$/i.test(value.channel)
      || !Number.isInteger(value.uid) || value.uid <= 0 || value.uid > 0xffffffff
      || typeof value.token !== 'string' || !value.token
      || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) {
    throw Object.assign(new Error('invalid_voice_credentials'), {code: 'invalid_voice_credentials'});
  }
  return value;
}

/** onLevels receives a plain object of String(uid) -> level in [0, 1]. */
export function createVoice({getCredentials, onStatus = () => {}, onLevels = () => {}, timeouts = VOICE_TIMEOUTS} = {}) {
  if (typeof getCredentials !== 'function') throw new TypeError('getCredentials is required');
  let active;
  let joining;

  const current = session => active === session && !session.cancelled;
  const notify = (callback, value) => {
    // Rendering errors must not strand a microphone or cancel audio cleanup.
    try { callback(value); } catch { /* The audio session owns only audio resources. */ }
  };
  function status(session, state, error, errorCode) {
    if (session && !current(session)) return;
    if (session) session.state = state;
    notify(onStatus, {
      state, muted: session?.muted || false, ...(session ? {timings:{...session.timings}} : {}), ...(['connecting','reconnecting'].includes(state) && session?.step ? {step:session.step} : {}), ...(error ? {error} : {}),
      ...(typeof errorCode === 'string' && ERROR_ENUM.test(errorCode) ? {errorCode} : {}),
    });
  }
  async function step(session, name, operation, onLate) {
    if (!current(session)) throw voiceError('voice_cancelled');
    session.step = name;
    status(session, session.ready ? 'reconnecting' : 'connecting');
    const started = voiceNow();
    let settled = false, timer;
    const work = Promise.resolve().then(() => {if(!current(session))throw voiceError('voice_cancelled');return operation();});
    // A timed-out getUserMedia call may still resolve after a permission click.
    // Its track must close even though the original join has already finished.
    void work.then(value => {
      if (settled || !current(session)) onLate?.(value);
    }, () => {});
    try {
      return await Promise.race([work, session.cancelledPromise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(voiceError('voice_' + name + '_timeout')), timeouts[name]);
      })]);
    } finally {settled = true; clearTimeout(timer);session.timings[name]=Math.round(voiceNow()-started);}
  }
  function readyStatus(session) {
    const state = session.client.connectionState !== 'CONNECTED' ? 'reconnecting'
      : session.playbackBlocked ? 'autoplay-blocked' : 'connected';
    status(session, state, state === 'autoplay-blocked' ? 'Tap Join voice again to enable sound.' : undefined);
  }
  function closeTrack(track) {
    try { track?.stop(); } catch { /* Already stopped. */ }
    try { track?.close(); } catch { /* Already closed. */ }
  }
  async function dispose(session) {
    if (!session) return;
    session.cancelled = true;
    session.cancel?.(voiceError('voice_cancelled'));
    clearTimeout(session.renewTimer);
    clearInterval(session.levelTimer);
    if (session.autoplayHandler) {
      try { session.sdk?.off?.('autoplay-failed', session.autoplayHandler); } catch { /* SDK already disposed. */ }
    }
    try { session.client?.removeAllListeners(); } catch { /* SDK already disposed. */ }
    for (const track of session.remote.values()) {
      try { track.stop(); } catch { /* A remote track may already be gone. */ }
    }
    session.remote.clear();
    closeTrack(session.microphone);
    session.microphone = undefined;
    // Repeatable on purpose: a pending SDK join may finish after an earlier leave.
    if (session.client) {
      let timer;
      try {
        await Promise.race([Promise.resolve().then(() => session.client.leave()), new Promise(resolve => {timer = setTimeout(resolve, timeouts.cleanup);})]);
      } catch { /* The client may still be joining. */ }
      finally {clearTimeout(timer);}
    }
  }
  async function fail(session, error) {
    if (!current(session)) return dispose(session);
    const failure = friendlyError(error);
    status(session, 'error', failure.message, diagnosticCode(error));
    active = undefined;
    notify(onLevels, {});
    void dispose(session);
    return failure;
  }
  function blockedPlayback(session) {
    if (!current(session)) return;
    session.playbackBlocked = true;
    if (session.ready) status(session, 'autoplay-blocked', 'Tap Join voice again to enable sound.');
  }
  function play(session, track) {
    try {
      const result = track.play();
      result?.catch?.(() => blockedPlayback(session));
    } catch {
      blockedPlayback(session);
    }
  }
  async function resumePlayback(session) {
    session.playbackBlocked = false;
    try {
      await session.sdk.resumeAudioContext?.();
      if (!current(session)) return;
      for (const track of session.remote.values()) play(session, track);
      readyStatus(session);
    } catch {
      blockedPlayback(session);
    }
  }
  function sampleLevels(session) {
    if (!current(session)) return;
    const levels = {};
    const level = (uid, track) => {
      let value = session.indicated.get(String(uid)) || 0;
      try { value = track.getVolumeLevel(); } catch { /* Use the SDK volume event as a fallback. */ }
      levels[String(uid)] = Math.max(0, Math.min(1, Number(value) || 0));
    };
    if (session.microphone && session.credentials) {
      level(session.credentials.uid, session.microphone);
      if (session.muted) levels[String(session.credentials.uid)] = 0;
    }
    for (const [uid, track] of session.remote) level(uid, track);
    notify(onLevels, levels);
  }
  function scheduleRenewal(session) {
    clearTimeout(session.renewTimer);
    const remaining = session.credentials.expiresAt - Date.now();
    const margin = Math.min(60_000, Math.max(5_000, remaining / 4));
    session.renewTimer = setTimeout(() => { void refresh(session); }, Math.max(1000, remaining - margin));
    session.renewTimer.unref?.();
  }
  async function reconnect(session, credentials) {
    session.rejoining = true;
    status(session, 'reconnecting');
    try {
      await step(session, 'joining', () => session.client.leave());
      if (!current(session)) return;
      session.remote.clear();
      session.indicated.clear();
      await step(session, 'joining', () => session.client.join(credentials.appId, credentials.channel, credentials.token, credentials.uid), () => {void dispose(session);});
      if (!current(session)) return dispose(session);
      await step(session, 'publishing', () => session.client.publish([session.microphone]), () => {void dispose(session);});
      if (!current(session)) return dispose(session);
      session.client.enableAudioVolumeIndicator();
    } finally {
      session.rejoining = false;
    }
  }
  function refresh(session, rejoin = false) {
    if (!current(session)) return Promise.resolve();
    session.needsRejoin ||= rejoin;
    if (session.refreshing) return session.refreshing;
    session.refreshing = (async () => {
      const credentials = validateCredentials(await getCredentials());
      if (!current(session)) return;
      const prior = session.credentials;
      if (credentials.appId !== prior.appId || credentials.channel !== prior.channel || credentials.uid !== prior.uid) {
        throw Object.assign(new Error('voice_session_changed'), {code: 'voice_session_changed'});
      }
      if (session.needsRejoin || session.client.connectionState === 'DISCONNECTED') {
        session.needsRejoin = false;
        await reconnect(session, credentials);
      } else {
        await session.client.renewToken(credentials.token);
        if (session.needsRejoin && current(session)) {
          session.needsRejoin = false;
          await reconnect(session, credentials);
        }
      }
      if (!current(session)) return;
      session.credentials = credentials;
      scheduleRenewal(session);
      readyStatus(session);
    })().catch(error => fail(session, error)).finally(() => { session.refreshing = undefined; });
    return session.refreshing;
  }
  function register(session) {
    const {client, sdk} = session;
    client.on('user-published', async (user, mediaType) => {
      if (mediaType !== 'audio' || !current(session)) return;
      const uid = String(user.uid);
      const revision = (session.revisions.get(uid) || 0) + 1;
      session.revisions.set(uid, revision);
      try {
        await client.subscribe(user, 'audio');
        if (!current(session) || session.revisions.get(uid) !== revision || !user.audioTrack) return;
        session.remote.set(uid, user.audioTrack);
        play(session, user.audioTrack);
      } catch (error) {
        if (current(session) && session.ready) {
          status(session, session.state, 'A player’s audio could not connect. Rejoin voice to retry.', diagnosticCode(error));
        }
      }
    });
    const removeRemote = user => {
      const uid = String(user.uid);
      session.revisions.set(uid, (session.revisions.get(uid) || 0) + 1);
      try { session.remote.get(uid)?.stop(); } catch { /* Remote already gone. */ }
      session.remote.delete(uid);
      session.indicated.delete(uid);
    };
    client.on('user-unpublished', (user, mediaType) => { if (mediaType === 'audio') removeRemote(user); });
    client.on('user-left', removeRemote);
    client.on('volume-indicator', volumes => {
      if (!current(session)) return;
      for (const volume of volumes) session.indicated.set(String(volume.uid), volume.level / 100);
    });
    client.on('token-privilege-will-expire', () => refresh(session));
    client.on('token-privilege-did-expire', () => refresh(session, true));
    client.on('connection-state-change', connection => {
      if (!current(session) || !session.ready || session.rejoining) return;
      if (connection === 'RECONNECTING') status(session, 'reconnecting');
      if (connection === 'CONNECTED') status(session, session.playbackBlocked ? 'autoplay-blocked' : 'connected');
      if (connection === 'DISCONNECTED') void refresh(session, true);
    });
    session.autoplayHandler = () => blockedPlayback(session);
    sdk.on('autoplay-failed', session.autoplayHandler);
  }

  function join() {
    if (active?.ready) {
      if (active.refreshing) return active.refreshing;
      return resumePlayback(active);
    }
    if (joining && active) return joining;
    const session = {
      remote: new Map(), indicated: new Map(), revisions: new Map(),
      muted: false, cancelled: false, ready: false, timings: {}, muteChain: Promise.resolve(),
    };
    session.cancelledPromise = new Promise((_, reject) => {session.cancel = reject;});
    void session.cancelledPromise.catch(() => {});
    active = session;
    status(session, 'connecting');
    const task = (async () => {
      try {
        const [sdk, credentials] = await step(session, 'loading', () => Promise.all([loadSdk(), Promise.resolve().then(getCredentials)]));
        if (!current(session)) return;
        session.sdk = sdk;
        sdk.setLogLevel(4);
        sdk.disableLogUpload();
        session.credentials = validateCredentials(credentials);
        session.client = sdk.createClient({mode: 'rtc', codec: 'vp8'});
        register(session);
        await step(session, 'joining', () => session.client.join(credentials.appId, credentials.channel, credentials.token, credentials.uid), () => {void dispose(session);});
        if (!current(session)) return dispose(session);
        session.microphone = await step(session, 'microphone', () => sdk.createMicrophoneAudioTrack({
          encoderConfig: 'speech_standard', AEC: true, ANS: true, AGC: true,
        }), closeTrack);
        if (!current(session)) return dispose(session);
        await step(session, 'publishing', () => session.client.publish([session.microphone]), () => {void dispose(session);});
        if (!current(session)) return dispose(session);
        session.ready = true;
        session.client.enableAudioVolumeIndicator();
        session.levelTimer = setInterval(() => sampleLevels(session), 125);
        session.levelTimer.unref?.();
        scheduleRenewal(session);
        readyStatus(session);
      } catch (error) {
        if (!current(session)) return dispose(session);
        const failure = await fail(session, error);
        throw failure;
      } finally {
        if (joining === task) joining = undefined;
      }
    })();
    joining = task;
    return task;
  }
  function mute(value) {
    const session = active;
    if (!session?.ready || !session.microphone) return Promise.resolve(false);
    const desired = value === undefined ? !session.muted : Boolean(value);
    session.muteChain = session.muteChain.catch(() => {}).then(async () => {
      if (!current(session)) return false;
      try {
        await session.microphone.setMuted(desired);
        if (!current(session)) return false;
        session.muted = desired;
        status(session, session.state);
        sampleLevels(session);
        return desired;
      } catch (error) {
        const failure = Object.assign(new Error('The microphone setting could not change. Try again.'), {code: error?.code || 'voice_mute_failed'});
        status(session, session.state, 'The microphone setting could not change. Try again.', diagnosticCode(error));
        throw failure;
      }
    });
    return session.muteChain;
  }
  async function leave() {
    const session = active;
    active = undefined;
    joining = undefined;
    status(undefined, 'idle');
    notify(onLevels, {});
    await dispose(session);
  }

  status(undefined, 'idle');
  return {join, mute, leave};
}
