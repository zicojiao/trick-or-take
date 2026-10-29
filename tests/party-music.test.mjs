import test from 'node:test';import assert from 'node:assert/strict';
import {createSoloMusic,musicAllowed,musicNotes,MUSIC_STEPS} from '../public/party/music.mjs';
const playing={enabled:true,solo:true,active:true,paused:false,hidden:false};
function rig(){
 const intervals=new Map(),nodes=[],events=[];let next=0,opens=0;
 const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(v){this.value=v;events.push(v);}});
 const ctx={state:'running',currentTime:0,resume:async()=>{},createGain:()=>({gain:param(),connect(){},disconnect(){}}),createBiquadFilter:()=>({frequency:param(),Q:param(),connect(){}}),createOscillator:()=>{const n={frequency:param(),connect(){},disconnect(){},start(at){this.startAt=at;},stop(at){this.stopAt=at;}};nodes.push(n);return n;}};
 const music=createSoloMusic({getAudio:()=>{opens++;return{context:ctx,output:{}};},timers:{setInterval(f){intervals.set(++next,f);return next;},clearInterval(id){intervals.delete(id);}}});
 return{music,ctx,nodes,events,intervals,get opens(){return opens;},advance(at){ctx.currentTime=at;for(const n of nodes)if(n.stopAt<=at)n.onended?.();for(const f of intervals.values())f();}};
}
test('music is restricted to audible, active and unpaused solo play',()=>{
 assert.equal(musicAllowed(playing),true);
 for(const patch of [{solo:false},{enabled:false},{active:false},{paused:true},{hidden:true}])assert.equal(musicAllowed({...playing,...patch}),false);
});
test('the Halloween theme loops, stays mid-register and uses soft bounded levels',()=>{
 const instruments=new Set(),pitches=new Set();
 for(let n=0;n<MUSIC_STEPS;n++){
  assert.deepEqual(musicNotes(n),musicNotes(n+MUSIC_STEPS));
  for(const note of musicNotes(n)){
   instruments.add(note.instrument);pitches.add(note.pitch);
   assert.ok(note.pitch>=24&&note.pitch<=84);
   assert.ok(note.level>0&&note.level<=.22);
   assert.ok(note.duration>0&&note.duration<2.1);
  }
 }
 assert.ok(instruments.has('pad')&&instruments.has('celesta')&&instruments.has('bass')&&instruments.has('pluck'));
 assert.ok(pitches.has(73),'a raised seventh keeps the hook Halloween');
 assert.notDeepEqual(musicNotes(4),musicNotes(68),'the second half answers the hook with a flat-sixth wink');
});
test('music unlock is explicit, repeated renders use one scheduler, and pause/multiplayer cancel future voices',async()=>{
 const r=rig();r.music.sync(playing);assert.equal(r.opens,0);assert.equal(r.intervals.size,0);
 await r.music.unlock();assert.equal(r.music.status,'playing');assert.equal(r.intervals.size,1);assert.ok(r.nodes.length>0);
 for(let n=0;n<10;n++)r.music.sync(playing);assert.equal(r.intervals.size,1);
 r.music.sync({...playing,attention:'warning'});assert.equal(r.events.at(-1),.07);
 r.music.sync({...playing,attention:'away'});assert.equal(r.events.at(-1),.28);
 r.music.sync({...playing,paused:true});assert.equal(r.music.status,'off');assert.equal(r.intervals.size,0);assert.ok(r.nodes.every(n=>n.stopAt<=.081));
 r.advance(.2);assert.equal(r.music.activeVoices,0);
 r.music.sync(playing);assert.equal(r.music.status,'playing');assert.equal(r.opens,1);
 r.music.sync({...playing,solo:false});r.advance(.4);assert.equal(r.music.status,'off');assert.equal(r.intervals.size,0);assert.equal(r.music.activeVoices,0);
});
test('a delayed audio unlock cannot start music after switching into multiplayer',async()=>{
 const r=rig();let resume;r.ctx.state='suspended';r.ctx.resume=()=>new Promise(resolve=>{resume=()=>{r.ctx.state='running';resolve();};});
 r.music.sync(playing);const pending=r.music.unlock();r.music.sync({...playing,solo:false});resume();await pending;
 assert.equal(r.music.status,'off');assert.equal(r.intervals.size,0);
});
