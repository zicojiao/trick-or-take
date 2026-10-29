import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {createResultSharing} from '../public/party/sharing.mjs';
import {renderOgPng,encodePng} from '../server/og-image.mjs';
import {shareMeta} from '../public/party/share-meta.mjs';
import {shareDestinations,SOCIAL_PLATFORMS} from '../public/party/share-destinations.mjs';
import {sharingCopy} from '../public/party/sharing-copy.mjs';
import {SUPPORTED_LANGS} from '../public/party/locale.mjs';
function setup(search='',options={}){
 const els=new Map(),doc={title:'',body:{append(){}},createElement:()=>({click(){},remove(){}}),defaultView:{File},getElementById(id){if(!els.has(id))els.set(id,{events:{},value:'',addEventListener(k,f){this.events[k]=f;},setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},focus(){this.focused=true;},select(){this.selected=true;}});return els.get(id);}};
 const result={id:'a'.repeat(24),score:3,mode:'solo',difficulty:'hard'},calls=[],shares=[],popups=[],tracked=[];
 let context={key:'run:en',lang:'en',available:true,canStart:true,result:{score:3,mode:'solo'},identity:{token:'private'},body:{runId:'run',trace:[]}},chosen;
 const nav={clipboard:{writeText:async text=>calls.push({copied:text})},share:p=>{shares.push(p);return Promise.resolve();},canShare:()=>true,...options.nav};
 const controller=createResultSharing({document:doc,origin:'https://game.test',search,getContext:()=>context,nav,request:options.request|| (async(action,body,identity)=>{calls.push({action,body,identity});return{result};}),onChallenge:r=>chosen=r,makeCard:options.makeCard|| (async()=>new Blob(['png'])),track:(event,data)=>tracked.push({event,data}),openWindow:options.openWindow||(()=>{const popup={document:{},location:{replace(url){popup.url=url;}},close(){popup.closed=true;}};popups.push(popup);return popup;})});
 controller.refresh();return{controller,doc,el:id=>doc.getElementById(id),calls,shares,result,popups,tracked,get chosen(){return chosen;},setContext:c=>{context={...context,...c};controller.refresh();}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('sharing requires a click, prepares a verified link and opens native share directly from the next click',async()=>{
 const h=setup();assert.equal(h.calls.length,0);assert.equal(h.shares.length,0);assert.equal(h.el('share-actions').hidden,true);
 await h.el('share-prepare').events.click();assert.equal(h.calls[0].action,'share-result');assert.equal(h.calls[0].identity.token,'private');assert.equal('score' in h.calls[0].body,false);
 assert.equal(h.el('share-actions').hidden,false);assert.match(h.el('share-link').value,/https:\/\/game\.test\/\?result=a{24}$/);
 const intent=new URL(h.el('share-x').href);assert.equal(intent.origin,'https://twitter.com');assert.equal(intent.searchParams.get('url'),h.el('share-link').value);
 h.el('share-native').events.click();assert.equal(h.shares.length,1);assert.equal(h.shares[0].url,h.el('share-link').value);
 await h.el('share-copy').events.click();assert.match(h.calls.at(-1).copied,/result=/);
 h.setContext({key:'run:zh',lang:'zh'});assert.equal(h.el('share-actions').hidden,true);assert.match(h.el('meta-og-image').content,/lang=zh/);
});
test('a challenge loads only public fields and passes its verified result on explicit accept',async()=>{
 const h=setup('?result='+'a'.repeat(24)+'&lang=en');await Promise.resolve();await Promise.resolve();
 assert.equal(h.chosen,undefined);assert.equal(h.el('challenge-banner').hidden,false);assert.match(h.doc.title,/3 treats/);
 h.el('challenge-accept').events.click();assert.equal(h.chosen.difficulty,'hard');
 h.doc.title='generic';h.controller.refresh();assert.match(h.doc.title,/3 treats/);
 h.setContext({lang:'zh',key:'run:zh'});assert.match(h.doc.title,/3 颗糖/);assert.match(h.el('meta-og-image-alt').content,/单人挑战/);assert.doesNotMatch(h.el('meta-og-image-alt').content,/困难/);
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

test('each social icon verifies the result after its click and reserves the composer tab before the request',async()=>{
 for(const platform of SOCIAL_PLATFORMS){
  const h=setup();assert.equal(h.calls.length,0);let prevented=false;
  const pending=h.el('share-'+platform).events.click({preventDefault(){prevented=true;}});
  assert.equal(h.popups.length,1,'tab opens synchronously in user activation');
  assert.equal(h.popups[0].opener,null);assert.equal(prevented,true);
  await pending;
  const expected=shareDestinations(h.result,h.el('share-link').value)[platform];
  assert.equal(h.popups[0].url,expected);
  assert.ok(h.tracked.some(t=>t.event==='share_composer_opened'&&t.data.destination===platform));
  let preparedPrevented=false;await h.el('share-'+platform).events.click({preventDefault(){preparedPrevented=true;}});
  assert.equal(preparedPrevented,false,'prepared icons are ordinary links');assert.equal(h.calls.filter(c=>c.action==='share-result').length,1);
 }
});
test('a blocked popup leaves a usable prepared social link and a clear retry message',async()=>{
 const h=setup('',{openWindow:()=>null});await h.el('share-x').events.click({preventDefault(){}});
 assert.match(h.el('share-status').textContent,/blocked/);assert.match(h.el('share-x').href,/intent/);assert.match(h.el('share-link').value,/result=/);
});
test('native sharing includes the PNG only when supported and remains synchronous with the click',async()=>{
 const h=setup();await flush();await h.controller.prepare();
 h.el('share-native').events.click();assert.equal(h.shares.length,1);assert.equal(h.shares[0].files[0].type,'image/png');assert.match(h.shares[0].files[0].name,/3.png/);
 assert.equal(h.shares[0].url,h.el('share-link').value);
 const linkOnly=setup('',{nav:{canShare:()=>false}});await flush();await linkOnly.controller.prepare();linkOnly.el('share-native').events.click();assert.equal('files' in linkOnly.shares[0],false);
});
test('card rendering failures do not prevent social sharing or manual clipboard recovery',async()=>{
 const h=setup('',{makeCard:async()=>{throw Error('image failed');},nav:{clipboard:{writeText:async()=>{throw Error('denied');}}}});
 await flush();assert.equal(h.el('share-save').disabled,true);assert.match(h.el('share-preview-loading').textContent,/image could not load/);
 await h.el('share-telegram').events.click({preventDefault(){}});assert.match(h.popups[0].url,/t.me/);
 await h.el('share-copy').events.click();assert.equal(h.el('share-link').selected,true);assert.equal(h.el('share-link').focused,true);assert.match(h.el('share-status').textContent,/Copy the challenge link/);
});
test('failed verification closes the reserved tab and allows retry without publishing anything',async()=>{
 let fail=true;const h=setup('',{request:async()=>{if(fail)throw Error('network');return {result:{id:'b'.repeat(24),score:3,mode:'solo'}};}});
 await h.el('share-x').events.click({preventDefault(){}});assert.equal(h.popups[0].closed,true);assert.match(h.el('share-status').textContent,/retry/);
 fail=false;await h.el('share-x').events.click({preventDefault(){}});assert.match(h.popups[1].url,/result%3Db{24}/);
 assert.ok(!h.tracked.some(t=>/posted|published/.test(t.event)));
});
test('leaving a result prevents a late request from opening its composer',async()=>{
 let complete;const h=setup('',{request:()=>new Promise(resolve=>{complete=resolve;})});
 const pending=h.el('share-x').events.click({preventDefault(){}});h.setContext({key:'new-round',available:false});
 complete({result:h.result});await pending;assert.equal(h.popups[0].closed,true);assert.equal(h.popups[0].url,undefined);assert.equal(h.el('share-link').value,'');
});
test('social URLs encode localized challenge text and never contain game credentials',()=>{
 const result={score:123,mode:'online',id:'a'.repeat(24)};
 for(const lang of SUPPORTED_LANGS){
  const url='https://game.test/'+lang+'?result='+result.id;
  const links=shareDestinations(result,url,lang);
  assert.deepEqual(Object.keys(links),[...SOCIAL_PLATFORMS]);
  for(const link of Object.values(links)){assert.ok(link.startsWith('https://'));assert.doesNotMatch(link,/token|playerId|room=|nickname/);}
  assert.equal(new URL(links.telegram).searchParams.get('url'),url);
  assert.match(new URL(links.x).searchParams.get('text'),/123/);
  assert.equal(new URL(links.facebook).searchParams.get('u'),url);
  assert.equal(new URL(links.reddit).searchParams.get('title'),shareMeta(lang,result).title);
  assert.ok(Object.values(sharingCopy(lang)).every(value=>typeof value==='string'&&value.length>0));
 }
});
test('native cancellation is quiet and never reports a completed share',async()=>{
 const h=setup('',{nav:{share:()=>Promise.reject(Object.assign(new Error(),{name:'AbortError'}))}});await h.controller.prepare();h.el('share-native').events.click();await flush();
 assert.match(h.el('share-status').textContent,/cancelled/);assert.equal(h.tracked.some(t=>t.event==='native_share_completed'),false);
});
