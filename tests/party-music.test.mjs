import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoloMusic,musicAllowed,MUSIC_BPM,MUSIC_LOOP_SECONDS,MUSIC_STEMS} from '../public/party/music.mjs';
const playing={enabled:true,solo:true,active:true,paused:false,hidden:false,remaining:60};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function rig(loader=async()=>({duration:MUSIC_LOOP_SECONDS})){
 const nodes=[],gains=[],loads=[],statuses=[];let opens=0;
 const param=()=>({value:0,events:[],cancelScheduledValues(){},setTargetAtTime(value,at,fade){this.value=value;this.events.push({value,at,fade});}});
 const ctx={state:'running',currentTime:0,resume:async()=>{},createGain:()=>{const gain={gain:param(),connect(to){this.destination=to;}};gains.push(gain);return gain;},createBufferSource:()=>{const n={connect(to){this.destination=to;},disconnect(){this.disconnected=true;},start(at,offset){this.startAt=at;this.offset=offset;},stop(at){this.stopAt=at;}};nodes.push(n);return n;}};
 const music=createSoloMusic({getAudio:()=>{opens++;return{context:ctx,output:{}};},loadBuffer:(context,url)=>{loads.push(url);return loader(context,url);},onStatus:s=>statuses.push(s)});
 return{music,ctx,nodes,gains,loads,statuses,get opens(){return opens;},advance(at){ctx.currentTime=at;for(const n of nodes)if(n.stopAt<=at&&!n.disconnected)n.onended?.();}};
}
test('music is restricted to audible, active and unpaused solo play',()=>{
 assert.equal(musicAllowed(playing),true);
 for(const patch of [{solo:false},{enabled:false},{active:false},{paused:true},{hidden:true}])assert.equal(musicAllowed({...playing,...patch}),false);
});
test('the arranged Christmas score has two compact local stems and a full-round loop',async()=>{
 assert.ok(MUSIC_BPM>=124&&MUSIC_BPM<=128);assert.ok(MUSIC_LOOP_SECONDS>=60&&MUSIC_LOOP_SECONDS<=62);
 for(const url of MUSIC_STEMS){
  const bytes=await readFile(new URL(url));
  assert.ok(bytes.length>100_000&&bytes.length<1_100_000);
  assert.equal(bytes.subarray(0,3).toString(),'ID3');
 }
});
test('music loads only after a solo gesture and keeps exactly two aligned loop sources',async()=>{
 const r=rig();r.music.sync(playing);assert.equal(r.opens,0);assert.equal(r.loads.length,0);
 await r.music.unlock();await flush();
 assert.equal(r.music.status,'playing');assert.equal(r.nodes.length,2);assert.equal(r.loads.length,2);
 assert.equal(r.nodes[0].startAt,r.nodes[1].startAt);assert.equal(r.nodes[0].offset,r.nodes[1].offset);
 assert.ok(r.nodes.every(n=>n.loop&&n.loopEnd===MUSIC_LOOP_SECONDS));
 for(let n=0;n<100;n++)r.music.sync(playing);
 assert.equal(r.nodes.length,2);assert.equal(r.music.activeVoices,2);assert.equal(r.loads.length,2);
});
test('warning ducks the mix and the last ten seconds fade in an aligned rhythm layer',async()=>{
 const r=rig();r.music.sync(playing);await r.music.unlock();await flush();
 const [base,pulse]=r.gains;
 assert.equal(base.gain.value,.70);assert.equal(pulse.gain.value,0);
 r.music.sync({...playing,attention:'warning'});assert.equal(base.gain.value,.35);
 r.music.sync({...playing,remaining:9});assert.equal(base.gain.value,.70);assert.equal(pulse.gain.value,.65);
 r.music.sync({...playing,remaining:9,attention:'watching'});assert.equal(base.gain.value,.35);
 assert.equal(r.nodes.length,2,'mix changes do not restart either stem');
 r.music.sync({...playing,remaining:0});assert.equal(pulse.gain.value,0);
});
test('pause cancels both sources and resumes at their shared musical position',async()=>{
 const r=rig();r.music.sync(playing);await r.music.unlock();await flush();r.advance(7);
 r.music.sync({...playing,paused:true});assert.equal(r.music.status,'off');
 assert.ok(r.nodes.every(n=>n.stopAt<=7.081));r.advance(20);assert.equal(r.music.activeVoices,0);
 r.music.sync(playing);await flush();
 assert.equal(r.nodes.length,4);assert.equal(r.loads.length,2);
 assert.equal(r.nodes[2].offset,r.nodes[3].offset);assert.ok(Math.abs(r.nodes[2].offset-6.97)<.001);
 r.music.sync({...playing,active:false});r.advance(21);r.music.sync(playing);await flush();
 assert.equal(r.nodes.at(-1).offset,0,'a new round starts with the opening hook');
});
test('a pending download cannot start music after switching to multiplayer',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});const r=rig(()=>pending);
 r.music.sync(playing);await r.music.unlock();r.music.sync({...playing,solo:false});
 resolve({duration:MUSIC_LOOP_SECONDS});await flush();
 assert.equal(r.music.status,'off');assert.equal(r.nodes.length,0);
});
test('a late audio unlock cannot load or play music after switching to multiplayer',async()=>{
 const r=rig();let resume;r.ctx.state='suspended';r.ctx.resume=()=>new Promise(resolve=>{resume=()=>{r.ctx.state='running';resolve();};});
 r.music.sync(playing);const pending=r.music.unlock();r.music.sync({...playing,solo:false});resume();await pending;await flush();
 assert.equal(r.music.status,'off');assert.equal(r.loads.length,0);assert.equal(r.nodes.length,0);
});
test('failed music loads stay quiet and retry on a new gesture, without blocking effects',async()=>{
 let fail=true;const r=rig(async()=>{if(fail)throw Error('offline');return {duration:MUSIC_LOOP_SECONDS};});
 r.music.sync(playing);await r.music.unlock();await flush();assert.equal(r.music.status,'unavailable');
 for(let i=0;i<10;i++)r.music.sync(playing);assert.equal(r.loads.length,2);
 fail=false;await r.music.unlock();await flush();assert.equal(r.music.status,'playing');assert.equal(r.nodes.length,2);
 r.music.sync({...playing,solo:false});r.advance(1);assert.equal(r.music.activeVoices,0);
});
