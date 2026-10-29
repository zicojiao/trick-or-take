import {MESSAGES} from '../public/party/messages.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRoom, applyCommand, publicRoom, DIFFICULTIES, GAME_VERSION} from '../public/party/engine.mjs';
import {PAGE_META,requestLanguage,SUPPORTED_LANGS,LANGUAGES_INFO,languagePath} from '../public/party/locale.mjs';
import {replaySolo} from '../server/leaderboard.mjs';
import {randomNickname} from '../public/party/profile.mjs';
import {createChoiceGroup} from '../public/party/choice.mjs';
import {installInteractions} from '../public/party/interaction.mjs';
import {createResultSharing} from '../public/party/sharing.mjs';
import {createSoloMusic} from '../public/party/music.mjs';
import {createHoldInput, createLocalClock} from '../public/party/controls.mjs';
import {pollCommand} from '../public/party/input.mjs';

const html = readFileSync(new URL('../public/party/index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../public/party/app.mjs', import.meta.url), 'utf8');

// Execute the actual application against its HTML IDs and real game/input rules.
// Only browser surfaces, image loading, transport and the audio device are mocked.
function harness({touchDevice = false, configFailures = 0, configured = true, restore = false, legacyBest = null, language = 'zh', storedLanguage = language, artResult = {ok:true}, search = ''} = {}) {
  let document, stamp = 0, wallTime = 1_000_000, nextFrame, timerId = 0;
  let configAttempts = 0, voiceJoins = 0, copiedInvite, historyUrl, submissions = [], ticketDifficulty, entryPayload, boardRequests=[],signalJoins=0,signalLeaves=0,signalPulses=[];
  class Element {
    constructor(tag, id = '') {
      Object.assign(this, {tagName: tag.toUpperCase(), id, dataset: {}, style: {setProperty(key, value) {this[key] = value;}},
        textContent: '', value: '', children: [], events: {}, hidden: false, disabled: false, open: false});
    }
    set textContent(value) {this.text = String(value);}
    get textContent() {return this.text;}
    addEventListener(type, listener) {(this.events[type] ??= []).push(listener);}
    dispatch(type, options = {}) {
      const event = {target: this, button: 0, pointerId: 1, isPrimary: true, repeat: false,
        preventDefault() {}, ...options};
      for (const listener of this.events[type] || []) listener(event);
    }
    setAttribute(name, value) {(this.attributes ??= {})[name] = value;}
    append(...children) {
      for(const child of children){
        if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(item=>item!==child);
        child.parentElement=this;this.children.push(child);
      }
    }
    replaceChildren(...children) {this.children = children;}
    focus() {document.activeElement = this;}
    showModal() {this.open = true;}
    close() {this.open = false; queueMicrotask(() => this.dispatch('close'));}
    setPointerCapture() {}
    scrollIntoView(){this.scrolled=true;}
  }
  const elements = new Map([...html.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)]
    .map(match => {
      const element = new Element(match[1], match[2]);
      element.hidden = /\shidden(?:\s|>)/.test(match[0]);
      element.disabled = /\sdisabled(?:\s|>)/.test(match[0]);
      return [element.id, element];
    }));
  const element = id => {
    assert.ok(elements.has(id), `Application references missing HTML ID: ${id}`);
    return elements.get(id);
  };
  const translated = [...html.matchAll(/<([\w-]+)\b([^>]*\bdata-i18n="([^"]+)"[^>]*)>([^<]*)/g)]
    .map(match => {
      const id = /\bid="([^"]+)"/.exec(match[2])?.[1];
      const item = id ? element(id) : new Element(match[1]);
      item.dataset.i18n = match[3]; item.textContent = match[4]; return item;
    });
  const window = new Element('window');
  if (touchDevice) window.ontouchstart = null;
  document = new Element('document');
  Object.assign(document, {body: new Element('body'), documentElement: new Element('html'), hidden: false,
    getElementById: element, createElement: tag => new Element(tag)});
  document.activeElement = document.body;
  document.cookie = language ? 'candy-language=' + language : '';
  document.querySelectorAll = selector => {
    if (selector === '[data-aria]') return [];
    if (selector === '#faq details') return Array.from({length:9},(_,i)=>element('faq-'+(i+1)));
    if (selector === '[data-i18n]') return translated;
    if (selector === '.avatar-choice') return element('avatar-picker').children;
    if (selector === '[data-placeholder]') return ['name-input', 'code-input'].map(id => {
      const item = element(id); item.dataset.placeholder = id === 'name-input' ? 'namePlaceholder' : 'codePlaceholder'; return item;
    });
    throw new Error(`Unsupported selector in app flow harness: ${selector}`);
  };
  const storage = () => ({values: new Map(), getItem(key) {return this.values.get(key) ?? null;},
    setItem(key, value) {this.values.set(key, String(value));}, removeItem(key) {this.values.delete(key);}});
  const localStorage = storage(), sessionStorage = storage();
  if (language !== null) localStorage.setItem('pumpkin-language', storedLanguage);
  if (legacyBest !== null) localStorage.setItem('candy-local-best', String(legacyBest));
  const identity = {code: 'REVIEW', playerId: 'p1', token: 'test-member-token'};
  if (restore) sessionStorage.setItem('candy-room-v2', JSON.stringify(identity));
  const serverRoom = createRoom({code: identity.code, seed: 1,
    player: {id: 'p1', uid: 1, name: 'Reviewer', avatar: 0}}, wallTime);
  const context = vm.createContext({track:()=>{},MESSAGES,document, window, localStorage, sessionStorage,
    location: {pathname: languagePath(language), search, origin: 'https://game.test'}, history: {replaceState(_state, _title, url) {historyUrl = url;}},
    navigator: {clipboard: {writeText: async value => {copiedInvite = value;}}}, AbortController, URLSearchParams, Uint32Array,
    crypto: {getRandomValues(array) {array[0] = 1; return array;}}, Date: {now: () => wallTime},
    createRoom, applyCommand, publicRoom, DIFFICULTIES, GAME_VERSION, PAGE_META, requestLanguage, SUPPORTED_LANGS, LANGUAGES_INFO, languagePath, randomNickname, createChoiceGroup, createHoldInput, createLocalClock, pollCommand, installInteractions, createResultSharing, createSoloMusic,
    setTimeout: () => ++timerId, clearTimeout() {}, requestAnimationFrame: callback => {nextFrame = callback;},
    createScene: () => ({ready: Promise.resolve(artResult), update() {}, retryAssets: () => Promise.resolve({ok: true})}),
    createSignaling:({onStatus})=>{let key=null;return{connect:async(next,retry=false)=>{if(key!==next||retry){key=next;signalJoins++;onStatus({state:'connected'});}return true;},leave:async()=>{key=null;signalLeaves++;onStatus({state:'idle'});},pulse:version=>signalPulses.push(version)};},
    createVoice: ({onStatus, getCredentials}) => {
      onStatus({state: 'idle', muted: false});
      return {leave: async () => onStatus({state: 'idle', muted: false}), mute: async () => {},
        join: async () => {await getCredentials(); voiceJoins += 1; onStatus({state: 'connected', muted: false});}};
    },
    fetch: async (url, options) => {
      const action = url.split('/').at(-1);
      if(action === 'solo-ticket') {
        ticketDifficulty = JSON.parse(options.body).difficulty;
        return {ok:true,json:async()=>({runId:'a'.repeat(32),token:'b'.repeat(64),seed:1,difficulty:ticketDifficulty})};
      }
      if(action === 'submit-score') {
        const body=JSON.parse(options.body);submissions.push(body);
        assert.equal(replaySolo(1,ticketDifficulty,body.trace),Number(element('result-score').textContent),'the actual app trace reproduces the displayed result');
        return {ok:true,json:async()=>({entry:{score:3}})};
      }
      if(action==='leaderboard'){assert.equal(options.method,'GET');boardRequests.push(action);return {ok:true,json:async()=>({entries:[]})};}
      if (action === 'config') {
        configAttempts += 1;
        if (configAttempts <= configFailures) throw new Error('temporary network failure');
        return {ok: true, json: async () => ({voiceConfigured: configured})};
      }
      if (action === 'voice') return {ok: true, json: async () => ({token: 'test-voice-token'})};
      assert.ok(['create', 'join', 'state'].includes(action), `Unexpected API action: ${action}`);
      if(action==='create'||action==='join')entryPayload=JSON.parse(options.body);
      if (action === 'state') applyCommand(serverRoom, 'p1', JSON.parse(options.body).command, wallTime);
      return {ok: true, json: async () => ({room: publicRoom(serverRoom, 'p1', wallTime),
        ...identity, serverNow: wallTime})};
    },
  });
  // Imports are injected above; the app body runs unchanged, with no private-state exports.
  vm.runInContext(appSource.replace(/^import .*;\r?\n/gm, ''), context, {filename: 'party/app.mjs'});
  const flush = async () => {for (let count = 0; count < 32; count++) await Promise.resolve();};
  const click = async id => {
    assert.equal(element(id).disabled, false, `${id} should be enabled`);
    assert.equal(element(id).hidden, false, `${id} should be visible`);
    element(id).dispatch('click'); await flush();
  };
  function advance(milliseconds) {
    const tick = delta => {stamp += delta; wallTime += delta; const callback = nextFrame; nextFrame = null; callback(stamp);};
    tick(0);
    while (milliseconds > 0) {const step = Math.min(100, milliseconds); tick(step); milliseconds -= step;}
  }
  return {element, window, document, flush, click, advance, sessionStorage, localStorage,
    get configAttempts() {return configAttempts;}, get voiceJoins() {return voiceJoins;},
    get copiedInvite() {return copiedInvite;},
    get historyUrl() {return historyUrl;},
    get submissions() {return submissions;}, get ticketDifficulty() {return ticketDifficulty;},
    get entryPayload() {return entryPayload;},
    get boardRequests() {return boardRequests;},
    get signalJoins(){return signalJoins;},get signalLeaves(){return signalLeaves;},get signalPulses(){return signalPulses;},
    async enter() {await click('mode-online'); element('name-input').value = 'Reviewer'; await click('create-button');},
    async solo() {await flush(); await click('solo-start'); advance(3200); assert.equal(element('hold-button').hidden, false);},
  };
}
async function toggleLanguage(app) {
  const next = app.document.documentElement.lang === 'en' ? 'zh' : 'en';
  await app.click('lang-picker-button');
  app.element('language-options-grid').children.find(option => option.dataset.code === next).dispatch('click');
  await app.flush();
}


test('new visitors start in English and an explicit Chinese choice survives a reload', async () => {
  const fresh = harness({language: null}); await fresh.flush();
  assert.equal(fresh.document.documentElement.lang, 'en');
  await toggleLanguage(fresh);
  assert.equal(fresh.localStorage.getItem('pumpkin-language'), 'zh');
  const returning = harness({language: 'zh'}); await returning.flush();
  assert.equal(returning.document.documentElement.lang, 'zh-CN');
});

test('the dice fills an editable name, changes on another roll and uses it to create a room',async()=>{
  const app=harness({language:'en'});await app.flush();await app.click('mode-online');
  await app.click('random-name');const first=app.element('name-input').value;
  assert.ok(first.length>0&&first.length<=18);
  await app.click('random-name');const second=app.element('name-input').value;
  assert.notEqual(first,second);assert.equal(app.localStorage.getItem('pumpkin-name'),second);
  app.element('name-input').value='My edited name';await app.click('create-button');
  assert.equal(app.entryPayload.name,'My edited name');
});

test('named character cards show the selection, persist it and send that avatar to the room',async()=>{
  const app=harness({language:'en'});await app.flush();
  const choices=app.element('avatar-picker').children;
  assert.equal(choices.length,3);assert.equal(choices[0].children[1].textContent,'Mochi');
  choices[2].dispatch('click');await app.flush();
  assert.equal(choices[2].attributes['aria-pressed'],'true');
  assert.equal(choices[2].children[1].textContent,'Bat Cat');assert.equal(choices[2].children[2].textContent,'✓ Selected');
  assert.equal(choices[0].attributes['aria-pressed'],'false');
  assert.equal(app.localStorage.getItem('pumpkin-avatar'),'2');
  await app.enter();assert.equal(app.entryPayload.avatar,2);
  assert.equal(app.element('profile-block').hidden,true);
});

test('room invitations point directly to the root URL with the room query', async () => {
  const app = harness(); await app.flush(); await app.enter();
  await app.click('invite-button');
  assert.equal(app.copiedInvite, 'https://game.test/zh?room=REVIEW');
  assert.equal(app.historyUrl, '/zh?room=REVIEW', 'the document asset base must not change the room URL');
});

test('leaderboard has one unfiltered ranking in solo and multiplayer setup',async()=>{
  const app=harness();await app.flush();await app.click('leaderboard-button');
  assert.equal(app.boardRequests.at(-1),'leaderboard');
  await app.click('close-leaderboard');await app.enter();await app.click('leaderboard-button');
  assert.equal(app.boardRequests.at(-1),'leaderboard');
  assert.doesNotMatch(html,/id="board-(?:mode|difficulty)/);
});

test('an invited player sees join context and keeps a leading-zero room code',async()=>{
  const app=harness({language:'en',search:'?room=001234'});await app.flush();
  assert.equal(app.document.body.dataset.entry,'join');
  assert.match(app.element('entry-copy').textContent,/001234/);
  app.element('name-input').value='Friend';await app.click('join-button');
  assert.equal(app.entryPayload.code,'001234');
});

test('room code copying uses inline feedback instead of covering the ready buttons',async()=>{
  const app=harness({language:'en'});await app.flush();await app.enter();await app.click('copy-room-code');
  assert.equal(app.copiedInvite,'REVIEW');
  assert.match(app.element('invite-status').textContent,/Room code copied/);
  assert.equal(app.element('toast').hidden,true);
});

test('leaving an invited room restores the ordinary setup instead of hiding its mode switch',async()=>{
  const app=harness({language:'en',search:'?room=001234'});await app.flush();
  app.element('name-input').value='Friend';await app.click('join-button');await app.click('leave-button');await app.click('leave-confirm');
  assert.equal(app.element('code-input').value,'');assert.equal(app.document.body.dataset.entry,'create');
  assert.equal(app.historyUrl,'/');assert.equal(app.sessionStorage.getItem('candy-room-v2'),null);
  await app.click('mode-solo');assert.equal(app.document.body.dataset.mode,'solo');
  assert.equal(app.element('solo-start').hidden,false);
});

test('title, description and share-preview metadata follow the selected language', async()=>{
  const app=harness({language:null});await app.flush();
  for(const language of ['en','zh']) {
    assert.equal(app.document.title,PAGE_META[language].title);
    assert.equal(app.element('meta-description').content,PAGE_META[language].description);
    assert.equal(app.element('meta-og-title').content,PAGE_META[language].title);
    assert.equal(app.element('meta-twitter-description').content,PAGE_META[language].description);
    if(language==='en')await toggleLanguage(app);
  }
  assert.equal(app.historyUrl,'/zh');
});

test('difficulty is selected before play and best scores stay separated',async()=>{
  const app=harness();await app.flush();await app.click('difficulty-hard');
  await app.solo();assert.equal(app.ticketDifficulty,'hard');
  assert.equal(app.element('difficulty-hard').disabled,true);
  app.element('hold-button').dispatch('pointerdown');app.advance(500);app.element('hold-button').dispatch('pointerup');app.advance(60000);
  assert.equal(app.localStorage.getItem('candy-local-best-v6-hard'),'3');
  assert.equal(app.localStorage.getItem('candy-local-best-v6'),null);
});

test('finishing and choosing Keep private never submits a score',async()=>{
  const app=harness();await app.solo();app.advance(60000);
  assert.equal(app.submissions.length,0);
  await app.click('skip-score');
  assert.equal(app.submissions.length,0);
  assert.equal(app.element('publish-controls').hidden,true);
});

test('explicit publication sends the run capability and input trace, never a client score',async()=>{
  const app=harness();await app.solo();
  app.element('hold-button').dispatch('pointerdown');app.advance(500);app.element('hold-button').dispatch('pointerup');app.advance(60000);
  app.element('publish-name').value='Public player';await app.click('submit-score');
  assert.equal(app.submissions.length,1);
  assert.equal(app.submissions[0].name,'Public player');
  assert.ok(app.submissions[0].trace.length>0);
  assert.equal('score' in app.submissions[0],false);
  assert.equal(app.element('submit-score').disabled,false);
  assert.equal(app.element('publish-controls').hidden,true);
});

test('a catch and automatic input clear remain replayable when a player resumes stealing',async()=>{
  const app=harness();await app.solo();
  app.element('hold-button').dispatch('pointerdown');
  for(let i=0;i<80&&!app.element('stage-feedback').textContent.includes('没收');i++)app.advance(100);
  app.advance(2000);
  for(let i=0;i<100&&app.document.body.dataset.attention!=='away';i++)app.advance(100);
  app.element('hold-button').dispatch('pointerdown');app.advance(400);app.element('hold-button').dispatch('pointerup');
  app.advance(60000);await app.click('submit-score');assert.equal(app.submissions.length,1);
});

for (const control of ['Space', 'pointer']) test(`${control} remains usable while watched and a mistaken press is caught`, async () => {
  const app = harness(); await app.solo();
  const button = app.element('hold-button');
  button.dispatch('pointerdown'); app.advance(500); button.dispatch('pointerup');
  assert.ok(Number(app.element('banked-score').textContent) > 0);
  for (let i = 0; i < 150 && app.document.body.dataset.attention !== 'watching'; i++) app.advance(100);
  assert.equal(app.document.body.dataset.attention, 'watching');
  assert.equal(button.disabled, false, 'the player may make a mistake instead of being auto-protected');
  if (control === 'Space') app.window.dispatch('keydown', {code: 'Space'});
  else button.dispatch('pointerdown');
  await app.flush();
  assert.equal(app.element('banked-score').textContent, '0');
  assert.match(app.element('stage-feedback').textContent, /没收/);
  assert.equal(button.dataset.held, 'false', 'a catch clears input');
  assert.equal(button.disabled, true, 'the stun still blocks input');
});

test('a failed initial config request recovers after successful room creation and permits voice join', async () => {
  const app = harness({configFailures: 1}); await app.flush(); await app.enter();
  assert.equal(app.element('lobby-panel').hidden, false);
  assert.ok(app.sessionStorage.getItem('candy-room-v2'), 'room membership survives config failure');
  assert.equal(app.element('voice-button').disabled, false, 'voice must recover without a page reload');
  await app.click('voice-button');
  assert.equal(app.voiceJoins, 1);
  assert.equal(app.element('voice-button').dataset.active, 'true');
  assert.ok(app.configAttempts >= 2);
});

test('restoring a valid room retries the failed initial voice configuration request', async () => {
  const app = harness({configFailures: 1, restore: true}); await app.flush();
  assert.equal(app.element('lobby-panel').hidden, false);
  assert.equal(app.element('voice-button').disabled, false);
  await app.click('voice-button'); assert.equal(app.voiceJoins, 1);
});

test('voice offers a user retry when both bootstrap and room-entry config requests fail', async () => {
  const app = harness({configFailures: 2}); await app.flush(); await app.enter();
  assert.equal(app.element('voice-button').disabled, false, 'unknown configuration must offer a retry');
  await app.click('voice-button');
  assert.equal(app.voiceJoins, 1); assert.equal(app.element('voice-button').dataset.active, 'true');
});

test('a confirmed unconfigured voice service remains disabled without blocking the room', async () => {
  const app = harness({configured: false}); await app.flush(); await app.enter();
  assert.equal(app.element('lobby-panel').hidden, false);
  assert.equal(app.element('voice-button').disabled, true);
});

test('solo pause and help freeze the visible timer and resume through their actual buttons', async () => {
  const app = harness(); await app.solo();
  app.element('hold-button').dispatch('pointerdown'); app.advance(400);
  app.element('hold-button').dispatch('pointerup');
  assert.ok(Number(app.element('banked-score').textContent) > 0, 'release banks candy');
  await app.click('pause-button');
  assert.equal(app.element('pause-dialog').open, true);
  const pausedTime = app.element('time-left').textContent;
  app.advance(3000); assert.equal(app.element('time-left').textContent, pausedTime);
  await app.click('resume-button'); app.advance(1100);
  assert.ok(Number(app.element('time-left').textContent) < Number(pausedTime));
  await app.click('help-button');
  assert.equal(app.element('help-dialog').open, true);
  const helpTime = app.element('time-left').textContent;
  app.advance(3000); assert.equal(app.element('time-left').textContent, helpTime);
  await app.click('got-it'); app.advance(1100);
  assert.equal(app.element('help-dialog').open, false);
  assert.ok(Number(app.element('time-left').textContent) < Number(helpTime));
});

test('Space and pointer ownership keep stealing until both are released; blur safely pauses solo', async () => {
  const app = harness(); await app.solo();
  const button = app.element('hold-button');
  app.window.dispatch('keydown', {code: 'Space'});
  button.dispatch('pointerdown', {pointerId: 7}); app.advance(300);
  app.window.dispatch('keyup', {code: 'Space'});
  assert.equal(button.dataset.held, 'true');
  assert.ok(Number(app.element('banked-score').textContent) > 0, 'the current total includes candy in the hands');
  assert.match(app.element('pending-label').textContent, /手里 [1-9]/, 'one remaining input keeps candy in the hands');
  app.advance(300); button.dispatch('pointerup', {pointerId: 7});
  assert.equal(button.dataset.held, 'false');
  assert.ok(Number(app.element('banked-score').textContent) > 0);
  app.window.dispatch('blur');
  assert.equal(app.element('pause-dialog').open, true);
  const pausedTime = app.element('time-left').textContent;
  app.advance(3000); assert.equal(app.element('time-left').textContent, pausedTime);
  app.element('pause-dialog').dispatch('cancel'); await app.flush();
  assert.equal(app.element('pause-dialog').open, false);
  app.advance(1100); assert.ok(Number(app.element('time-left').textContent) < Number(pausedTime));
});

test('the visible total includes held candy, stays stable on release, and becomes zero on a real catch', async () => {
  const app = harness(); await app.solo();
  const button = app.element('hold-button');
  button.dispatch('pointerdown'); app.advance(500);
  const heldTotal = Number(app.element('banked-score').textContent);
  assert.ok(heldTotal > 0, 'collecting is visible before release');
  button.dispatch('pointerup');
  assert.equal(Number(app.element('banked-score').textContent), heldTotal, 'release cannot double-count held candy');

  button.dispatch('pointerdown'); app.advance(100);
  assert.equal(app.element('banked-score').textContent, '3', '3.375 pocketed + 0.615 held is three whole candies');
  button.dispatch('pointerup');
  assert.equal(app.element('banked-score').textContent, '3', 'combining separately rounded subtotals cannot lose a displayed candy');

  button.dispatch('pointerdown');
  for (let step = 0; step < 70 && !app.element('stage-feedback').textContent.includes('没收'); step++) app.advance(100);
  assert.match(app.element('stage-feedback').textContent, /全部没收/);
  assert.equal(app.element('banked-score').textContent, '0', 'previously pocketed candy is confiscated too');
  assert.match(app.element('pending-label').textContent, /手里 0/);
  assert.match(app.element('hold-copy').textContent, /全部没收/);
  assert.equal(button.dataset.held, 'false');

  app.advance(2000);
  assert.equal(button.disabled, false, 'the caught player can re-enter the game');
  for(let i=0;i<100&&app.document.body.dataset.attention!=='away';i++)app.advance(100);
  button.dispatch('pointerdown'); app.advance(400); button.dispatch('pointerup');
  assert.ok(Number(app.element('banked-score').textContent) > 0, 'new candy can be collected after the penalty when Lily looks away');
});

test('the new-rule result saves its own best without importing or erasing the previous rule record', async () => {
  const app = harness({legacyBest: 99}); await app.solo();
  app.element('hold-button').dispatch('pointerdown'); app.advance(500);
  app.element('hold-button').dispatch('pointerup');
  app.advance(60000);
  assert.equal(app.element('result-score').textContent, '3');
  assert.equal(app.localStorage.getItem('candy-local-best-v6'), '3');
  assert.equal(app.localStorage.getItem('candy-local-best'), '99', 'older-rule scores remain intact and separate');
});


test('room entry starts RTM once, actions announce changes, and leaving closes signaling',async()=>{
  const app=harness({language:'en'});await app.flush();await app.enter();assert.equal(app.signalJoins,1);
  assert.equal(app.element('signal-status').textContent,'RTM live sync');await app.click('ready-button');assert.ok(app.signalPulses.length>0);
  await app.click('leave-button');assert.equal(app.element('leave-dialog').open,true);
  await app.click('leave-confirm');assert.ok(app.signalLeaves>0);assert.equal(app.element('signal-line').hidden,true);
});
test('one audio toggle controls music and effects and results can open the unfiltered board',async()=>{
  const app=harness({language:'en'});await app.flush();assert.equal(app.element('sound-button').attributes['aria-label'],'Mute music and effects');
  await app.click('sound-button');assert.equal(app.element('sound-button').attributes['aria-label'],'Enable music and effects');assert.equal(app.element('sound-button').attributes['aria-pressed'],'false');assert.equal(app.localStorage.getItem('candy-music'),'false');assert.equal(app.localStorage.getItem('candy-sound'),'false');
  await app.click('sound-button');assert.equal(app.localStorage.getItem('candy-music'),'true');assert.equal(app.localStorage.getItem('candy-sound'),'true');
  await app.solo();app.advance(63000);await app.click('view-results-board');assert.equal(app.element('leaderboard-dialog').open,true);assert.equal(app.boardRequests.at(-1),'leaderboard');
});

test('mobile homepage keeps scores inline, then restores scores and guide after a round', async()=>{
  const app=harness({language:'en'});await app.flush();
  assert.equal(app.element('home-info').hidden,false);
  assert.equal(app.element('board-content').parentElement,app.element('desktop-board'));
  assert.ok(app.boardRequests.length>0);
  await app.click('home-guide-button');assert.equal(app.element('help-dialog').open,true);
  await app.click('got-it');await app.solo();
  assert.equal(app.element('home-info').hidden,true);
  assert.equal(app.element('board-content').parentElement,app.element('board-modal-slot'));
  await app.click('exit-match');assert.equal(app.element('leave-dialog').open,true);
  assert.match(app.element('leave-title').textContent,/Leave this match/);
  await app.click('leave-stay');assert.equal(app.element('leave-dialog').open,false);assert.equal(app.element('home-info').hidden,true);
  await app.click('exit-match');await app.click('leave-confirm');
  assert.equal(app.element('home-info').hidden,false);
  assert.equal(app.element('board-content').parentElement,app.element('desktop-board'));
  assert.ok(app.boardRequests.length>0);
});

test('finishing a round scatters flowers and candy, then clears them on exit', async()=>{
  const app=harness({language:'en'});await app.solo();app.advance(63000);
  const finale=app.element('finale');
  assert.equal(finale.hidden,false);
  assert.ok(finale.children.length>=30);
  assert.ok(finale.children.some(petal=>petal.textContent==='✿'));
  await app.click('result-exit');
  assert.equal(finale.hidden,true);assert.equal(finale.children.length,0);
});

test('pause exit asks before leaving and finished results leave without a confirm', async()=>{
  const app=harness({language:'en'});await app.solo();
  await app.click('pause-button');assert.equal(app.element('pause-dialog').open,true);
  await app.click('pause-exit');
  assert.equal(app.element('leave-dialog').open,true);assert.equal(app.element('pause-dialog').open,false);
  assert.match(app.element('leave-copy').textContent,/still going/);
  app.window.dispatch('blur');
  assert.equal(app.element('pause-dialog').open,false,'losing focus must not cover the leave confirmation');
  await app.click('leave-stay');
  assert.equal(app.element('leave-dialog').open,false);assert.equal(app.element('pause-dialog').open,true);
  await app.click('resume-button');app.advance(63000);
  await app.click('result-exit');
  assert.equal(app.element('leave-dialog').open,false);assert.equal(app.element('home-info').hidden,false);
});

test('room voice appears with membership and home information stays out of the lobby',async()=>{
  const app=harness({language:'en'});await app.flush();await app.click('mode-online');
  assert.equal(app.element('voice-bar').hidden,true);
  assert.equal(app.element('home-info').hidden,false);
  await app.enter();
  assert.equal(app.element('voice-bar').hidden,false);
  assert.equal(app.element('home-info').hidden,true);
  assert.match(app.element('voice-room-title').textContent,/Room REVIEW/);
  await app.click('leave-button');await app.click('leave-confirm');
  assert.equal(app.element('voice-bar').hidden,true);
  assert.equal(app.element('home-info').hidden,false);
});


test('home information links scroll within the current localized page',async()=>{
 const app=harness({language:'en',search:'?lang=en'});await app.flush();
 await app.click('home-link-faq');
 assert.equal(app.element('faq').scrolled,true);
 assert.equal(app.historyUrl,'/#faq');
 assert.equal(app.element('home-info').hidden,false);
});

test('asset failures and retries stay localized when switching languages', async () => {
  const app=harness({language:'en',artResult:{ok:false}});await app.flush();
  assert.equal(app.document.body.dataset.assets,'error');
  assert.equal(app.element('loading-label').textContent,MESSAGES.en.artError);
  assert.equal(app.element('solo-start').disabled,true);
  await toggleLanguage(app);
  assert.equal(app.element('loading-label').textContent,MESSAGES.zh.artError);
  assert.equal(app.element('loading-detail').textContent,MESSAGES.zh.artErrorDetail);
  await app.click('retry-art');
  assert.equal(app.document.body.dataset.assets,'ready');
  assert.equal(app.element('solo-start').disabled,false);
  assert.equal(app.element('loading-overlay').hidden,true);
});

test('the path chooses the language and a saved preference cannot change it',async()=>{
  const english=harness({language:'en',storedLanguage:'zh'});await english.flush();
  assert.equal(english.document.documentElement.lang,'en');
  const chinese=harness({language:'zh',storedLanguage:'en'});await chinese.flush();
  assert.equal(chinese.document.documentElement.lang,'zh-CN');
  const query=harness({language:'en',storedLanguage:'zh',search:'?lang=zh'});await query.flush();
  assert.equal(query.document.documentElement.lang,'en');
});

test('loading copy changes immediately while assets are still pending',async()=>{
  let resolve;const pending=new Promise(done=>resolve=done);
  const app=harness({language:'en',artResult:pending});await app.flush();
  assert.equal(app.document.body.dataset.assets,'loading');
  assert.equal(app.element('solo-start').disabled,true);
  await toggleLanguage(app);
  assert.equal(app.element('loading-label').textContent,MESSAGES.zh.loadingTitle);
  resolve({ok:true});await app.flush();
  assert.equal(app.element('loading-overlay').hidden,true);
});

test('leaderboard status follows language changes without another request',async()=>{
 const app=harness({language:'en'});await app.flush();await app.click('board-refresh');
 assert.equal(app.element('board-status').textContent,MESSAGES.en.boardEmpty);
 const requests=app.boardRequests.length;await toggleLanguage(app);
 assert.equal(app.element('board-status').textContent,MESSAGES.zh.boardEmpty);
 assert.equal(app.boardRequests.length,requests);
});

test('final ten seconds build urgency, pause freezes it, and replay resets it',async()=>{
 const app=harness({language:'en'});await app.solo();
 assert.equal(app.element('match-timer').dataset.urgency,'normal');
 while(Number(app.element('time-left').textContent)>10)app.advance(100);
 assert.equal(app.element('match-timer').dataset.urgency,'soon');
 assert.equal(app.element('timer-alert').textContent,'Final ten seconds!');
 app.advance(5000);assert.equal(app.element('match-timer').dataset.urgency,'final');
 await app.click('pause-button');const seconds=app.element('time-left').textContent;
 app.advance(3000);assert.equal(app.element('time-left').textContent,seconds);
 assert.equal(app.element('match-timer').dataset.paused,'true');
 await app.click('resume-button');app.advance(6000);
 assert.equal(app.element('time-left').textContent,'0');
 assert.equal(app.element('match-timer').dataset.urgency,'normal');
 assert.equal(app.element('timer-alert').textContent,'');
 await app.click('again-button');app.advance(3200);
 assert.equal(app.element('match-timer').dataset.urgency,'normal');
});

test('privacy and terms are real localized navigation links',async()=>{
 const app=harness({language:'en'});await app.flush();
 assert.equal(app.element('home-link-privacy').attributes.href,'/privacy');
 assert.equal(app.element('home-link-privacy').events.click,undefined);
 await toggleLanguage(app);
 assert.equal(app.element('home-link-terms').attributes.href,'/zh/terms');
});

test('public score name defaults to anonymous and dice creates an editable name',async()=>{
 const app=harness({language:'en'});await app.solo();app.advance(60000);
 assert.equal(app.element('publish-name').value,'Anonymous user');
 assert.equal(app.submissions.length,0);
 await app.click('publish-random-name');const first=app.element('publish-name').value;
 assert.notEqual(first,'Anonymous user');assert.ok(first.length<=20);
 await app.click('publish-random-name');assert.notEqual(app.element('publish-name').value,first);
 app.element('publish-name').value='My chosen name';app.element('publish-name').dispatch('input');
 await toggleLanguage(app);assert.equal(app.element('publish-name').value,'My chosen name');
 await app.click('submit-score');assert.equal(app.submissions[0].name,'My chosen name');
});

test('untouched anonymous name follows the selected language',async()=>{
 const app=harness({language:'en'});await app.solo();app.advance(60000);
 assert.equal(app.element('publish-name').value,'Anonymous user');
 await toggleLanguage(app);assert.equal(app.element('publish-name').value,'匿名玩家');
 await toggleLanguage(app);assert.equal(app.element('publish-name').value,'Anonymous user');
});

test('every translated page keeps its language after boot and sharing refresh',async()=>{
  for(const language of SUPPORTED_LANGS){
    const app=harness({language});await app.flush();
    assert.equal(app.document.title,PAGE_META[language].title,language);
    assert.equal(app.document.documentElement.lang,PAGE_META[language].htmlLang,language);
    assert.equal(app.element('meta-description').content,PAGE_META[language].description,language);
  }
});

test('the language picker keeps invitation links and uses the shared language registry',async()=>{
  const app=harness({language:'en',search:'?room=001234'});await app.flush();
  await app.click('lang-picker-button');
  const options=app.element('language-options-grid').children;
  assert.equal(options.length,SUPPORTED_LANGS.length);
  const japanese=options.find(option=>option.dataset.code==='ja');
  japanese.dispatch('click');await app.flush();
  assert.equal(app.historyUrl,'/ja?room=001234');
  assert.equal(app.document.title,PAGE_META.ja.title);
  assert.equal(app.element('language-dialog').open,false);
});


for (const touchId of [0,42,-1,-2147483648,2147483647]) test(`native touch ${touchId} collects candy and only its owner can release`, async () => {
  const app = harness({touchDevice:true}); await app.solo();
  const button = app.element('hold-button'), finger = {identifier:touchId};
  button.dispatch('pointerdown', {pointerType:'touch',pointerId:9});
  button.dispatch('touchstart', {touches:[finger],changedTouches:[finger]});
  app.advance(300);
  assert.equal(button.dataset.held, 'true');
  assert.ok(Number(app.element('banked-score').textContent) > 0);
  app.window.dispatch('touchend', {changedTouches:[{identifier:43}]});
  assert.equal(button.dataset.held, 'true');
  button.dispatch('pointerup', {pointerType:'touch',pointerId:9});
  assert.equal(button.dataset.held, 'true', 'duplicate pointer stream cannot release the native touch');
  app.window.dispatch('touchend', {changedTouches:[finger]});
  assert.equal(button.dataset.held, 'false');
  const banked = app.element('banked-score').textContent;app.advance(100);
  assert.equal(app.element('banked-score').textContent, banked);
});

for (const touchId of [7,-2147483648]) test(`touch-only canvas ${touchId} releases on cancellation and focus loss`, async () => {
  const app = harness({touchDevice:true}); await app.solo();
  const canvas = app.element('party-canvas'), button = app.element('hold-button'), finger = {identifier:touchId};
  canvas.dispatch('touchstart', {touches:[finger],changedTouches:[finger]});
  assert.equal(button.dataset.held, 'true');
  app.window.dispatch('touchcancel', {changedTouches:[finger]});
  assert.equal(button.dataset.held, 'false');
  canvas.dispatch('touchstart', {touches:[finger],changedTouches:[finger]});
  assert.equal(button.dataset.held, 'true');
  app.window.dispatch('blur');assert.equal(button.dataset.held, 'false');
  await app.click('resume-button');
  canvas.dispatch('touchstart', {touches:[finger],changedTouches:[finger]});
  assert.equal(button.dataset.held, 'true');
  app.window.dispatch('touchend', {changedTouches:[finger]});
  assert.equal(button.dataset.held, 'false');
});

test('failed pointer capture does not prevent holding or release outside the button', async () => {
  const app = harness(); await app.solo();const button=app.element('hold-button');
  button.setPointerCapture = () => {throw new Error('NotFoundError');};
  button.dispatch('pointerdown', {pointerId:17});
  assert.equal(button.dataset.held, 'true');app.advance(300);
  assert.ok(Number(app.element('banked-score').textContent) > 0);
  app.window.dispatch('pointerup', {pointerId:17});
  assert.equal(button.dataset.held, 'false');
});
