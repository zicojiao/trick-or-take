import test from 'node:test';
import assert from 'node:assert/strict';
import tokenTools from 'agora-token/src/AccessToken2.js';
import {generateVoiceCredentials, voiceConfig} from '../server/agora-token.mjs';
import {createVoice, VOICE_TIMEOUTS} from '../public/party/voice.mjs';

// Deliberately invented, public test fixtures. These are not Agora credentials.
const fakeEnv = {
  AGORA_APP_ID: '0123456789abcdef0123456789abcdef',
  AGORA_APP_CERTIFICATE: 'fedcba9876543210fedcba9876543210',
};
const player = {id: 'player-one', uid: 71, left: false};
const room = (expiresAt = Date.now() + 7_200_000) => ({
  code: 'ABCDEF',
  channel: 'pumpkin_11111111111111111111111111111111',
  expiresAt,
});

function decode(token) {
  const parsed = new tokenTools.AccessToken2();
  assert.equal(parsed.from_string(token), true, 'the official parser accepts the generated token');
  return parsed;
}

test('missing or malformed server credentials cannot advertise or issue voice access', () => {
  for (const env of [{}, {AGORA_APP_ID: fakeEnv.AGORA_APP_ID}, {...fakeEnv, AGORA_APP_CERTIFICATE: 'invalid'}]) {
    assert.deepEqual(voiceConfig(env), {voiceConfigured: false});
    assert.throws(() => generateVoiceCredentials(env, room(), player), error => {
      assert.equal(error.code, 'voice_unconfigured');
      assert.equal(error.status, 503);
      assert.ok(!error.message.includes(fakeEnv.AGORA_APP_CERTIFICATE));
      return true;
    });
  }
  assert.deepEqual(voiceConfig(fakeEnv), {voiceConfigured: true});
});

test('issued AccessToken2 is signed by this project and scoped to the server room and member', () => {
  const credentials = generateVoiceCredentials(fakeEnv, room(), player);
  const parsed = decode(credentials.token);
  assert.equal(credentials.appId, fakeEnv.AGORA_APP_ID);
  assert.equal(credentials.channel, 'pumpkin_11111111111111111111111111111111');
  assert.equal(credentials.uid, 71);
  assert.equal(parsed.appId.toString(), fakeEnv.AGORA_APP_ID);
  assert.equal(parsed.verifySignature(fakeEnv.AGORA_APP_CERTIFICATE), true);
  assert.equal(parsed.verifySignature('00000000000000000000000000000000'), false);
  const services = parsed.getServices(tokenTools.kRtcServiceType);
  assert.equal(services.length, 1);
  assert.equal(services[0].__channel_name.toString(), credentials.channel);
  assert.equal(services[0].__uid.toString(), '71');
  assert.ok(services[0].__privileges[tokenTools.ServiceRtc.kPrivilegeJoinChannel] > 0);
  assert.ok(services[0].__privileges[tokenTools.ServiceRtc.kPrivilegePublishAudioStream] > 0);
  assert.ok(parsed.expire > 0 && parsed.expire <= 3600, 'tokens have a bounded lifetime');
  assert.ok(Math.abs(credentials.expiresAt - (parsed.issueTs + parsed.expire) * 1000) <= 1000);
  assert.equal('appCertificate' in credentials, false);
  assert.equal(JSON.stringify(credentials).includes(fakeEnv.AGORA_APP_CERTIFICATE), false);
});

test('renewal keeps the member UID and room channel and cannot outlive the room', () => {
  const currentRoom = room(Date.now() + 25_000);
  const first = generateVoiceCredentials(fakeEnv, currentRoom, player);
  const renewal = generateVoiceCredentials(fakeEnv, currentRoom, player);
  assert.equal(renewal.channel, first.channel);
  assert.equal(renewal.uid, first.uid);
  for (const credentials of [first, renewal]) {
    const parsed = decode(credentials.token);
    assert.ok((parsed.issueTs + parsed.expire) * 1000 <= currentRoom.expiresAt);
    assert.ok(credentials.expiresAt <= currentRoom.expiresAt);
    for (const expiry of Object.values(parsed.getServices(tokenTools.kRtcServiceType)[0].__privileges)) {
      assert.equal(expiry, parsed.expire, 'join and publisher privileges expire with the token');
    }
  }
  const differentRoom = {...currentRoom, channel: 'pumpkin_22222222222222222222222222222222'};
  const other = decode(generateVoiceCredentials(fakeEnv, differentRoom, player).token);
  assert.equal(other.getServices(tokenTools.kRtcServiceType)[0].__channel_name.toString(), differentRoom.channel);
});

test('expired rooms, departed players and wildcard identities cannot get a token', () => {
  assert.throws(() => generateVoiceCredentials(fakeEnv, room(Date.now() - 1), player), {code: 'room_expired'});
  assert.throws(() => generateVoiceCredentials(fakeEnv, room(), {...player, left: true}), {code: 'voice_not_member'});
  for (const uid of [0, -1, 1.5, 2 ** 32, '71', undefined]) {
    assert.throws(() => generateVoiceCredentials(fakeEnv, room(), {...player, uid}), {code: 'invalid_voice_identity'});
  }
  for (const channel of ['', '*', 'a'.repeat(65), undefined]) {
    assert.throws(() => generateVoiceCredentials(fakeEnv, {...room(), channel}, player), {code: 'invalid_voice_identity'});
  }
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

// The real Agora dependency needs a remote channel and microphone. This fixture
// replaces that external boundary so cancellation and UI state can be exercised.
function installSdkFixture(t, {microphonePromise, microphoneError, mutedError} = {}) {
  const previous = globalThis.AgoraRTC;
  const handlers = new Map();
  const globalHandlers = new Map();
  const operations = [];
  const microphone = {
    closed: false,
    muted: false,
    stop() { operations.push('microphone-stop'); },
    close() { this.closed = true; operations.push('microphone-close'); },
    getVolumeLevel() { return 0.25; },
    async setMuted(value) {
      if (mutedError) throw mutedError;
      this.muted = value;
      operations.push(['mute', value]);
    },
  };
  const client = {
    connectionState: 'DISCONNECTED',
    on(event, callback) { handlers.set(event, callback); },
    off(event) { handlers.delete(event); },
    removeAllListeners() { handlers.clear(); },
    async join(appId, channel, token, uid) {
      this.connectionState = 'CONNECTED';
      operations.push(['join', appId, channel, token, uid]);
      return uid;
    },
    async leave() { this.connectionState = 'DISCONNECTED'; operations.push('leave'); },
    async publish(tracks) { operations.push(['publish', tracks]); },
    async subscribe(user, type) { operations.push(['subscribe', user.uid, type]); },
    async renewToken(token) { operations.push(['renew', token]); },
    enableAudioVolumeIndicator() { operations.push('volume-indicator'); },
  };
  globalThis.AgoraRTC = {
    VERSION: '4.24.8',
    createClient(config) {
      assert.deepEqual(config, {mode: 'rtc', codec: 'vp8'});
      return client;
    },
    async createMicrophoneAudioTrack() {
      if (microphoneError) throw microphoneError;
      return microphonePromise ? await microphonePromise : microphone;
    },
    on(event, callback) { globalHandlers.set(event, callback); },
    off(event) { globalHandlers.delete(event); },
    async resumeAudioContext() { operations.push('resume-audio'); },
    setLogLevel(level) { operations.push(['log-level', level]); },
    disableLogUpload() { operations.push('log-upload-disabled'); },
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.AgoraRTC;
    else globalThis.AgoraRTC = previous;
  });
  return {client, microphone, handlers, globalHandlers, operations};
}

const clientCredentials = () => ({
  appId: fakeEnv.AGORA_APP_ID,
  channel: 'pumpkin_11111111111111111111111111111111',
  uid: 71,
  token: '007explicit-test-token-not-a-real-credential',
  expiresAt: Date.now() + 3_600_000,
});

test('microphone rejection reports an error and leaves instead of claiming voice connected', async t => {
  const sdk = installSdkFixture(t, {microphoneError: Object.assign(new Error('denied'), {code: 'PERMISSION_DENIED'})});
  const statuses = [];
  const voice = createVoice({getCredentials: clientCredentials, onStatus: status => statuses.push(status)});
  t.after(() => voice.leave());
  await assert.rejects(voice.join(), /microphone/i);
  assert.equal(statuses.some(status => status.state === 'connected'), false);
  assert.equal(statuses.at(-1).state, 'error');
  assert.ok(sdk.operations.includes('leave'));
});

test('SDK diagnostic output is disabled before credentials reach the connection', async t => {
  const sdk = installSdkFixture(t);
  const voice = createVoice({getCredentials: clientCredentials});
  t.after(() => voice.leave());
  await voice.join();
  const joining = sdk.operations.findIndex(operation => operation[0] === 'join');
  const loggingDisabled = sdk.operations.findIndex(operation => operation[0] === 'log-level' && operation[1] === 4);
  const uploadDisabled = sdk.operations.indexOf('log-upload-disabled');
  assert.ok(loggingDisabled >= 0 && loggingDisabled < joining);
  assert.ok(uploadDisabled >= 0 && uploadDisabled < joining);
});

test('leaving while microphone creation is pending closes its late result without publishing', async t => {
  const pending = deferred();
  const sdk = installSdkFixture(t, {microphonePromise: pending.promise});
  const statuses = [];
  const voice = createVoice({getCredentials: clientCredentials, onStatus: status => statuses.push(status)});
  t.after(() => voice.leave());
  const joining = voice.join();
  void joining.catch(() => {});
  await new Promise(resolve => setImmediate(resolve));
  await voice.leave();
  await joining; // Cancellation settles even while the browser permission request remains pending.
  pending.resolve(sdk.microphone);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sdk.microphone.closed, true);
  assert.equal(sdk.operations.some(operation => operation[0] === 'publish'), false);
  assert.equal(statuses.some(status => status.state === 'connected'), false);
  assert.equal(statuses.at(-1).state, 'idle');
});

test('a mute failure leaves the reported microphone state unchanged', async t => {
  installSdkFixture(t, {mutedError: new Error('device failure')});
  const statuses = [];
  const voice = createVoice({getCredentials: clientCredentials, onStatus: status => statuses.push(status)});
  t.after(() => voice.leave());
  await voice.join();
  await assert.rejects(voice.mute(true));
  assert.equal(statuses.at(-1).muted, false);
});

test('voice token renewal cannot move an existing connection into another member identity', async t => {
  const sdk = installSdkFixture(t);
  const statuses = [];
  let calls = 0;
  const voice = createVoice({
    getCredentials: () => ({...clientCredentials(), uid: ++calls === 1 ? 71 : 72}),
    onStatus: status => statuses.push(status),
  });
  t.after(() => voice.leave());
  await voice.join();
  await sdk.handlers.get('token-privilege-will-expire')();
  assert.equal(sdk.operations.some(operation => operation[0] === 'renew'), false);
  assert.equal(statuses.at(-1).state, 'error');
  assert.equal(sdk.microphone.closed, true);
});

test('successful token refresh does not claim a reconnecting transport is connected', async t => {
  const sdk = installSdkFixture(t);
  const statuses = [];
  const voice = createVoice({getCredentials: clientCredentials, onStatus: value => statuses.push(value)});
  t.after(() => voice.leave());
  await voice.join();
  sdk.client.connectionState = 'RECONNECTING';
  sdk.handlers.get('connection-state-change')('RECONNECTING');
  await sdk.handlers.get('token-privilege-will-expire')();
  assert.equal(statuses.at(-1).state, 'reconnecting');
});

test('voice failure exposes a safe SDK enum for diagnosis without exposing its raw message', async t => {
  const sensitive = 'never-display-credential-or-raw-diagnostic';
  installSdkFixture(t, {microphoneError: Object.assign(new Error(sensitive), {code: 'CAN_NOT_GET_GATEWAY_SERVER'})});
  const statuses = [];
  const voice = createVoice({getCredentials: clientCredentials, onStatus: value => statuses.push(value)});
  t.after(() => voice.leave());
  await assert.rejects(voice.join());
  assert.equal(statuses.at(-1).errorCode, 'CAN_NOT_GET_GATEWAY_SERVER');
  assert.equal(JSON.stringify(statuses).includes(sensitive), false);
});

test('server voice failure codes survive a plain Error without reflecting arbitrary messages', async t => {
  installSdkFixture(t);
  const statuses = [];
  const voice = createVoice({getCredentials: () => { throw new Error('voice_unavailable'); }, onStatus: value => statuses.push(value)});
  t.after(() => voice.leave());
  await assert.rejects(voice.join());
  assert.equal(statuses.at(-1).errorCode, 'voice_unavailable');
});

test('malformed diagnostic codes and raw messages stay out of voice status', async t => {
  const sensitive = 'token: 007/this-is-not-an-enum';
  installSdkFixture(t, {microphoneError: Object.assign(new Error(sensitive), {code: sensitive})});
  const statuses = [];
  const voice = createVoice({getCredentials: clientCredentials, onStatus: value => statuses.push(value)});
  t.after(() => voice.leave());
  await assert.rejects(voice.join());
  assert.equal(statuses.at(-1).errorCode, undefined);
  assert.equal(JSON.stringify(statuses).includes(sensitive), false);
});

test('voice reports each connection step and only timing data, not credentials', async t => {
  installSdkFixture(t);const statuses=[];
  const voice=createVoice({getCredentials:clientCredentials,onStatus:s=>statuses.push(s)});t.after(()=>voice.leave());
  await voice.join();
  assert.deepEqual(statuses.filter(s=>s.step).map(s=>s.step),['loading','joining','microphone','publishing']);
  assert.equal(statuses.at(-1).state,'connected');
  assert.deepEqual(Object.keys(statuses.at(-1).timings),['loading','joining','microphone','publishing']);
  assert.ok(Object.values(statuses.at(-1).timings).every(n=>Number.isInteger(n)&&n>=0));
  assert.equal(JSON.stringify(statuses).includes(clientCredentials().token),false);
});

for(const phase of ['loading','joining','microphone','publishing'])test(`a stalled ${phase} step times out with a specific error`,async t=>{
  const pending=deferred();const sdk=installSdkFixture(t,phase==='microphone'?{microphonePromise:pending.promise}:{});
  if(phase==='joining')sdk.client.join=()=>pending.promise;
  if(phase==='publishing')sdk.client.publish=()=>pending.promise;
  const statuses=[];const voice=createVoice({getCredentials:phase==='loading'?()=>pending.promise:clientCredentials,onStatus:s=>statuses.push(s),timeouts:{...VOICE_TIMEOUTS,[phase]:10,cleanup:10}});
  t.after(()=>voice.leave());
  await assert.rejects(voice.join(),error=>error.code==='voice_'+phase+'_timeout');
  assert.equal(statuses.at(-1).state,'error');assert.equal(statuses.at(-1).errorCode,'voice_'+phase+'_timeout');
  assert.equal(statuses.some(s=>s.state==='connected'),false);
  if(phase!=='publishing')assert.equal(sdk.operations.some(op=>op[0]==='publish'),false);
  if(phase==='microphone'){
    pending.resolve(sdk.microphone);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(sdk.microphone.closed,true);assert.equal(statuses.at(-1).state,'error');
  }
});

test('a stalled cleanup cannot prevent Retry from creating a new attempt',async t=>{
  const sdk=installSdkFixture(t);let attempts=0;
  sdk.client.join=async()=>{if(++attempts===1)return new Promise(()=>{});sdk.client.connectionState='CONNECTED';return 71;};
  sdk.client.leave=()=>new Promise(()=>{});
  const statuses=[];const voice=createVoice({getCredentials:clientCredentials,onStatus:s=>statuses.push(s),timeouts:{...VOICE_TIMEOUTS,joining:10,cleanup:10}});
  await assert.rejects(voice.join(),e=>e.code==='voice_joining_timeout');
  await voice.join();assert.equal(attempts,2);assert.equal(statuses.at(-1).state,'connected');
  await voice.leave();assert.equal(statuses.at(-1).state,'idle');assert.equal(sdk.microphone.closed,true);
});

test('a cancelled network join that resolves later leaves again and cannot open the mic',async t=>{
  const sdk=installSdkFixture(t),pending=deferred();sdk.client.join=()=>pending.promise;
  const voice=createVoice({getCredentials:clientCredentials});const joining=voice.join();
  await new Promise(resolve=>setImmediate(resolve));await voice.leave();await joining;
  const leaves=sdk.operations.filter(op=>op==='leave').length;
  pending.resolve(71);await new Promise(resolve=>setImmediate(resolve));
  assert.ok(sdk.operations.filter(op=>op==='leave').length>leaves);
  assert.equal(sdk.operations.some(op=>op[0]==='publish'),false);
});
