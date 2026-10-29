import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = new URL('..', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const pngSize = bytes => ({width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)});

test('the install manifest lists a pumpkin icon at every standard size', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest').toString('utf8'));
  assert.equal(manifest.name, 'Trick or Take');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#f8ecd6');
  const any = new Map(manifest.icons.filter(icon => icon.purpose === 'any').map(icon => [icon.sizes, icon.src]));
  const maskable = new Map(manifest.icons.filter(icon => icon.purpose === 'maskable').map(icon => [icon.sizes, icon.src]));
  for (const size of [48, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512, 1024]) {
    assert.equal(any.get(`${size}x${size}`), `/party/assets/icons/icon-${size}.png?v=3`);
  }
  for (const size of [128, 192, 384, 512, 1024]) {
    assert.equal(maskable.get(`${size}x${size}`), `/party/assets/icons/maskable-${size}.png?v=3`);
  }
  for (const icon of manifest.icons) {
    const file = read(`public${icon.src.split('?')[0]}`);
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(file.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.deepEqual(pngSize(file), {width: size, height: size});
  }
  for (const size of [16, 32]) {
    const file = read(`public/party/assets/icons/icon-${size}.png`);
    assert.deepEqual(pngSize(file), {width: size, height: size});
  }
});

test('the home page and boot path advertise the manifest, icons, and service worker', () => {
  const html = read('public/party/index.html').toString('utf8');
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest\?v=3"/);
  assert.match(html, /apple-touch-icon" href="\/party\/assets\/icons\/icon-180\.png\?v=3"/);
  assert.match(html, /icon-512\.png|icon-192\.png/);
  assert.match(html, /mobile-web-app-capable" content="yes"/);
  const boot = read('public/party/boot.js').toString('utf8');
  assert.match(boot, /serviceWorker\.register\('\/sw\.js', \{scope: '\/'\}\)/);
  const worker = read('public/sw.js').toString('utf8');
  assert.match(worker, /addEventListener\('fetch'/);
  assert.doesNotMatch(worker, /caches\.(open|put)/);
});
