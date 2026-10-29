import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPolicyPage} from '../server/policy-page.mjs';
import {CANDY_COLORS,createCandyPicker,tintCandyPixels} from '../public/party/candy-colors.mjs';

test('policy pages have independent localized URLs, page content and no game runtime',()=>{
 for(const page of ['privacy','terms'])for(const lang of ['en','zh']){
  const html=renderPolicyPage(page,lang,'https://candy.test');
  assert.ok(html.includes(`<html lang="${lang==='zh'?'zh-CN':'en'}">`));
  assert.ok(html.includes(lang==='zh'?`href="https://candy.test/zh/${page}"`:`href="https://candy.test/${page}"`));
  assert.ok(html.includes(lang==='zh'?'href="/zh"':'href="/"'));
  assert.ok(html.includes('/party/analytics.mjs'));assert.equal(html.includes('/party/app.mjs'),false);
  assert.equal(html.includes('<canvas'),false);
  assert.ok(html.includes(page==='privacy'?(lang==='en'?'Optional live voice':'可选的实时语音'):(lang==='en'?'Play fairly':'公平游玩')));
 }
 assert.throws(()=>renderPolicyPage('unknown','en','https://candy.test'));
});

test('each candy bag contains the full palette and avoids repeated boundary colors',()=>{
 const next=createCandyPicker(()=>.25);const samples=Array.from({length:20},next);
 for(let i=0;i<samples.length;i+=5)assert.deepEqual([...samples.slice(i,i+5)].sort(),[...CANDY_COLORS].sort());
 for(let i=1;i<samples.length;i++)assert.notEqual(samples[i],samples[i-1]);
});

test('candy tint changes red artwork while preserving ink, cream swirls and transparency',()=>{
 const source=[240,60,40,255,30,20,28,255,255,237,194,255,240,60,40,0];
 const variants=CANDY_COLORS.map(color=>tintCandyPixels(new Uint8ClampedArray(source),color));
 assert.equal(new Set(variants.map(v=>[...v.slice(0,3)].join(','))).size,5);
 for(const pixels of variants){assert.equal(pixels[3],255);assert.deepEqual([...pixels.slice(4)],source.slice(4));}
});
