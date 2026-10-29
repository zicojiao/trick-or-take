import assert from 'node:assert/strict';
import {SUPPORTED_LANGS, PAGE_META, languagePath} from '../public/party/locale.mjs';
import {MESSAGES} from '../public/party/messages.mjs';
import {spawn, spawnSync} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

// Exercise the actual HTTP entry point against a disposable D1 database.
const cwd = fileURLToPath(new URL('../', import.meta.url));
const wrangler = join(cwd, 'node_modules/wrangler/bin/wrangler.js');
const state = await mkdtemp(join(tmpdir(), 'trick-or-take-smoke-'));
let child;
let output = '';
try {
  const migrated = spawnSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state], {cwd, encoding: 'utf8'});
  assert.equal(migrated.status, 0, migrated.stderr || migrated.stdout);
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [wrangler, 'dev', '--port', String(port), '--ip', '127.0.0.1', '--inspector-port', '0', '--persist-to', state], {cwd, stdio: ['ignore', 'pipe', 'pipe']});
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output = (output + data).slice(-12000); });
  let ready = false;
  for (let n = 0; n < 120; n++) {
    if (child.exitCode !== null) throw new Error(`Worker exited before startup: ${output}`);
    try { ready = (await fetch(`${origin}/api/party/config`)).ok; } catch {}
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, `Worker startup timed out: ${output}`);
  for (const lang of SUPPORTED_LANGS) {
    const path=languagePath(lang),language=PAGE_META[lang].htmlLang;
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, new RegExp(`<html[^>]*lang="${language}"`));
    assert.match(html, /Trick or Take/);
    assert.match(html, /config\.js/);
    assert.match(html, /og:image/);
    assert.ok(html.includes(MESSAGES[lang].loadingTitle), `localized loading: ${lang}`);
    for(const kind of ['privacy','terms']){
      const policy=await fetch(origin+languagePath(lang,kind));
      assert.equal(policy.status,200);
      assert.equal(policy.headers.get('content-language'),language);
    }
  }
  for (const path of ['/privacy', '/terms', '/zh/privacy', '/zh/terms', '/party/app.mjs', '/favicon.ico', '/manifest.webmanifest']) {
    assert.equal((await fetch(origin + path)).status, 200, path);
  }
  const config = await (await fetch(origin + '/config.js')).text();
  assert.match(config, /TRICK_OR_TAKE_CONFIG/);
  assert.doesNotMatch(config, /AGORA_APP_CERTIFICATE/);
  for (const lang of ['en', 'zh']) {
    const response = await fetch(`${origin}/og/default.png?lang=${lang}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /image\/png/);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16), 1200);
    assert.equal(bytes.readUInt32BE(20), 630);
  }
  async function api(action, body, member) {
    const response = await fetch(`${origin}/api/party/${action}`, {method: 'POST', headers: {
      'content-type': 'application/json', origin,
      ...(member ? {authorization: `Bearer ${member.token}`} : {}),
    }, body: JSON.stringify(body)});
    const data = await response.json();
    assert.ok(response.ok, `${action}: ${response.status} ${data.error || ''}`);
    return data;
  }
  const owner = await api('create', {name: 'Smoke Pumpkin', avatar: 'pumpkin'});
  assert.match(owner.room.code, /^\d{6}$/);
  const code = owner.room.code;
  const friend = await api('join', {code, name: 'Smoke Ghost', avatar: 'ghost'});
  for (const member of [owner, friend]) await api('state', {code, playerId: member.playerId, command: {type: 'ready', ready: true}}, member);
  const started = await api('state', {code, playerId: owner.playerId, command: {type: 'start'}}, owner);
  const seen = await api('state', {code, playerId: friend.playerId}, friend);
  assert.equal(started.room.phase, 'countdown');
  assert.equal(seen.room.startsAt, started.room.startsAt);
  assert.equal(seen.room.players.length, 2);
  assert.equal(seen.room.endsAt - seen.room.startsAt, 60000);
  console.log('Smoke passed: localized pages, policies, assets, OG images, and a shared two-player round.');
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await rm(state, {recursive: true, force: true});
}
