import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {createResultSharing} from '../public/party/sharing.mjs';
import {renderOgPng,encodePng} from '../server/og-image.mjs';
import {shareMeta} from '../public/party/share-meta.mjs';
function setup(search=''){
 const els=new Map(),doc={title:'',getElementById(id){if(!els.has(id))els.set(id,{events:{},value:'',addEventListener(k,f){this.events[k]=f;},focus(){},select(){}});return els.get(id);}};
 const result={id:'a'.repeat(24),score:3,mode:'solo',difficulty:'hard'},calls=[],shares=[];
 let context={key:'run:en',lang:'en',available:true,canStart:true,identity:{token:'private'},body:{runId:'run',trace:[]}},chosen;
 const controller=createResultSharing({document:doc,origin:'https://game.test',search,getContext:()=>context,nav:{clipboard:{writeText:async text=>calls.push({copied:text})},share:p=>{shares.push(p);return Promise.resolve();}},request:async(action,body,identity)=>{calls.push({action,body,identity});return{result};},onChallenge:r=>chosen=r,makeCard:async()=>new Blob(['png'])});
 controller.refresh();return{controller,doc,el:id=>doc.getElementById(id),calls,shares,result,get chosen(){return chosen;},setContext:c=>{context={...context,...c};controller.refresh();}};
}
test('sharing requires a click, prepares a verified link and opens native share directly from the next click',async()=>{
 const h=setup();assert.equal(h.calls.length,0);assert.equal(h.shares.length,0);assert.equal(h.el('share-actions').hidden,true);
 await h.el('share-prepare').events.click();assert.equal(h.calls[0].action,'share-result');assert.equal(h.calls[0].identity.token,'private');assert.equal('score' in h.calls[0].body,false);
 assert.equal(h.el('share-actions').hidden,false);assert.match(h.el('share-link').value,/https:\/\/game\.test\/\?result=a{24}$/);
 const intent=new URL(h.el('share-x').href);assert.equal(intent.origin,'https://twitter.com');assert.equal(intent.searchParams.get('url'),h.el('share-link').value);
 h.el('share-native').events.click();assert.equal(h.shares.length,1);assert.equal(h.shares[0].url,h.el('share-link').value);
 await h.el('share-copy').events.click();assert.match(h.calls.at(-1).copied,/result=/);
 h.setContext({key:'run:zh',lang:'zh'});assert.equal(h.el('share-actions').hidden,true);assert.match(h.el('meta-og-image').content,/lang=zh/);
});
test('a challenge loads only public fields and starts its matching difficulty on explicit accept',async()=>{
 const h=setup('?result='+'a'.repeat(24)+'&lang=en');await Promise.resolve();await Promise.resolve();
 assert.equal(h.chosen,undefined);assert.equal(h.el('challenge-banner').hidden,false);assert.match(h.doc.title,/3 treats/);
 h.el('challenge-accept').events.click();assert.equal(h.chosen.difficulty,'hard');
 h.doc.title='generic';h.controller.refresh();assert.match(h.doc.title,/3 treats/);
 h.setContext({lang:'zh',key:'run:zh'});assert.match(h.doc.title,/3 颗糖/);assert.match(h.el('meta-og-image-alt').content,/困难/);
});
test('social previews are real 1200×630 PNG files with distinct verified scores and localized labels',async()=>{
 const env={ASSETS:{fetch:async request=>{const name=new URL(request.url).pathname.split('/').at(-1);return new Response(await readFile(new URL('../public/party/assets/'+name,import.meta.url)));}}};
 const a=await renderOgPng(env,'https://game.test','en',{score:123,difficulty:'hard',mode:'solo'}),b=await renderOgPng(env,'https://game.test','zh',{score:7,difficulty:'easy',mode:'online'});
 for(const png of [a,b]){assert.deepEqual([...png.slice(0,8)],[137,80,78,71,13,10,26,10]);const v=new DataView(png.buffer);assert.equal(v.getUint32(16),1200);assert.equal(v.getUint32(20),630);const n=v.getUint32(33);assert.equal(inflateSync(png.slice(41,41+n)).length,630*(1200*4+1));}
 assert.notDeepEqual(a,b);assert.match(shareMeta('zh',{score:7,difficulty:'easy',mode:'online'}).description,/好友对战/);
 await assert.rejects(encodePng(new Uint8Array(3)),/invalid_pixels/);
});

test('homepage previews serve the approved localized artwork, without a placeholder score',async()=>{
 const requested=[];
 const env={ASSETS:{fetch:async request=>{const pathname=new URL(request.url).pathname;requested.push(pathname);return new Response(await readFile(new URL('../public'+pathname,import.meta.url)));}}};
 for(const lang of ['en','zh']){
  const png=await renderOgPng(env,'https://game.test',lang);
  const expected=await readFile(new URL('../public/party/assets/og-home-v3-'+lang+'.png',import.meta.url));
  assert.deepEqual(Buffer.from(png),expected);
  assert.equal(expected.readUInt32BE(16),1200);assert.equal(expected.readUInt32BE(20),630);
 }
 assert.deepEqual(requested,['/party/assets/og-home-v3-en.png','/party/assets/og-home-v3-zh.png']);
});

test('a non-English challenge keeps its locale in prepared and canonical links',async()=>{
 const h=setup();h.setContext({key:'run:ja',lang:'ja'});
 assert.match(h.doc.title,/ハロウィン/);
 assert.equal(h.el('canonical-url').href,'https://game.test/ja');
 await h.el('share-prepare').events.click();
 assert.match(h.el('share-link').value,/\/ja\?result=a{24}$/);
 assert.match(h.el('meta-og-image').content,/lang=en/,'new locales use the shipped English artwork');
});
