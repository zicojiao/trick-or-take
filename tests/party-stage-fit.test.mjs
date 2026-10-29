import test from 'node:test';
import assert from 'node:assert/strict';
import {fitStage} from '../public/party/stage-fit.mjs';

test('desktop stage keeps a 16:9 scene when the viewport has room', () => {
  const fit = fitStage({viewport: 1080, top: 230, below: 140, width: 1067, layout: 'wide'});
  assert.equal(fit.height, 600);
  assert.equal(fit.maxWidth, null);
});

test('short desktop windows narrow the card instead of flattening the scene', () => {
  const fit = fitStage({viewport: 768, top: 204, below: 136, width: 993, layout: 'wide'});
  assert.equal(fit.height, 414);
  assert.equal(fit.maxWidth, 786);
  assert.ok(fit.maxWidth / fit.height <= 1.9);
});

test('phone matches fill the room above the fixed hold button but stay landscape-ish', () => {
  const tall = fitStage({viewport: 812, top: 57, below: 134, bar: 82, width: 347, layout: 'portrait'});
  assert.equal(tall.height, 510);
  const short = fitStage({viewport: 667, top: 57, below: 134, bar: 82, width: 347, layout: 'portrait'});
  assert.equal(short.height, 380);
  const tiny = fitStage({viewport: 400,top: 57, below: 134, bar: 82, width: 347, layout: 'portrait'});
  assert.equal(tiny.height, 180);
});

test('phone home keeps a fixed scene preview and invalid input is ignored', () => {
  assert.deepEqual(fitStage({viewport: 812, top: 500, width: 347, layout: 'portrait-home'}), {height: 289, maxWidth: null});
  assert.equal(fitStage({viewport: 812, top: 0, width: 0, layout: 'wide'}), null);
});
