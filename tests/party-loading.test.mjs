import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {loadImage} from '../public/party/scene.mjs';
import {MESSAGES} from '../public/party/messages.mjs';

test('every initial HTML translation has both languages, with English fallback content',()=>{
 const html=readFileSync(new URL('../public/party/index.html',import.meta.url),'utf8');
 for(const [,key] of html.matchAll(/data-(?:i18n|placeholder|aria|title)="([^"]+)"/g)){
  for(const lang of ['en','zh'])assert.equal(typeof MESSAGES[lang][key],'string',`${lang}.${key}`);
 }
 for(const [key,copy] of Object.entries(MESSAGES.en))if(key!=='languageSwitch')assert.equal(/\p{Script=Han}/u.test(copy),false,key);
 assert.equal(html.replace('>中文<','><').match(/\p{Script=Han}/u),null);
});

test('a stalled image times out, clears callbacks, and a new attempt can succeed',async()=>{
 const images=[];
 class Image{constructor(){images.push(this);}set src(url){this.url=url;}}
 const env={win:{Image}};
 await assert.rejects(loadImage('/slow.webp',env,5),/image_timeout/);
 assert.equal(images[0].onload,null);assert.equal(images[0].url,'');
 const retry=loadImage('/slow.webp',env,100);images[1].onload();
 assert.equal(await retry,images[1]);assert.equal(images[1].onerror,null);
});

test('independent boot recovery uses server-localized copy and never replaces a ready app',()=>{
 const source=readFileSync(new URL('../public/party/boot.js',import.meta.url),'utf8');
 for(const ready of [false,true]){
  const nodes=Object.fromEntries(['loading-overlay','loading-label','loading-detail','retry-art','boot-error-message','boot-error-detail','boot-retry-label','game-script'].map(id=>[id,{textContent:id,hidden:true,addEventListener(type,fn){this[type]=fn;}}]));
  const body={dataset:{boot:'pending',assets:'loading'}};let timer,reloads=0;
  vm.runInNewContext(source,{document:{body,getElementById:id=>nodes[id]},setTimeout:fn=>{timer=fn;},clearTimeout(){},location:{reload(){reloads++;}}});
  if(ready)body.dataset.boot='ready';timer();
  assert.equal(body.dataset.boot,ready?'ready':'error');
  if(!ready){assert.equal(nodes['loading-label'].textContent,'boot-error-message');nodes['retry-art'].click({stopImmediatePropagation(){}});assert.equal(reloads,1);}
 }
});
