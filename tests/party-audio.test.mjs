import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameAudio} from '../public/party/audio.mjs';

function fixture({resumeFails=false}={}) {
  const nodes=[],sessions=[],states=[];
  const param=()=>({value:0,values:[],setValueAtTime(v,t){this.values.push([v,t]);},exponentialRampToValueAtTime(v,t){this.values.push([v,t]);}});
  function node(kind){const n={kind,gain:param(),frequency:param(),connect(to){this.destination=to;},disconnect(){this.disconnected=true;},start(at){this.started=at??0;},stop(at){this.stopped=at;}};nodes.push(n);return n;}
  let ctx;
  class AudioContext {
    constructor(){ctx=this;this.state='suspended';this.currentTime=0;this.sampleRate=48000;this.destination={};this.resumes=0;}
    createGain(){return node('gain');} createOscillator(){return node('osc');} createBufferSource(){return node('buffer');}
    createBuffer(){return {};}
    resume(){this.resumes++;if(resumeFails)return Promise.reject(Error('blocked'));this.state='running';return Promise.resolve();}
  }
  const audio=createGameAudio({host:{AudioContext},nav:{audioSession:{set type(v){sessions.push(v);}}},onState:s=>states.push(s)});
  return {audio,nodes,sessions,states,get ctx(){return ctx;},get oscillators(){return nodes.filter(n=>n.kind==='osc');}};
}

test('audio stays locked until a gesture, then starts its unlock buffer synchronously',()=>{
  const f=fixture();assert.equal(f.audio.play('pickup'),false);assert.equal(f.nodes.length,0);
  f.audio.unlock();assert.equal(f.ctx.resumes,1);assert.equal(f.audio.state,'running');assert.deepEqual(f.sessions,['playback']);
  const buffer=f.nodes.find(n=>n.kind==='buffer');assert.equal(buffer.started,0);buffer.onended();assert.equal(buffer.disconnected,true);
});
test('interrupted audio resumes on the next gesture without queued effects',()=>{
  const f=fixture();f.audio.unlock();f.ctx.state='interrupted';assert.equal(f.audio.play('pickup'),false);
  f.audio.unlock();assert.equal(f.ctx.resumes,2);assert.equal(f.audio.play('pickup'),true);
});
test('pickup chimes vary, limit bursts and disconnect every finished voice',()=>{
  const f=fixture();f.audio.unlock();const pitches=[];
  for(let i=0;i<4;i++){
    f.ctx.currentTime=i*.2;assert.equal(f.audio.play('pickup'),true);
    pitches.push(f.oscillators.at(-1).frequency.values[0][0]);
    assert.equal(f.audio.play('pickup'),false);
  }
  assert.equal(new Set(pitches).size,4);assert.equal(f.audio.activeVoices,8);
  for(const osc of f.oscillators){osc.onended();assert.equal(osc.disconnected,true);assert.equal(osc.destination.disconnected,true);}
  assert.equal(f.audio.activeVoices,0);
});
test('mute silences the master and prevents new effects or audio activation',()=>{
  const f=fixture();f.audio.setEnabled(false);f.audio.unlock();assert.equal(f.ctx,undefined);
  f.audio.setEnabled(true);f.audio.unlock();assert.equal(f.nodes[0].gain.value,.75);
  f.audio.setEnabled(false);assert.equal(f.nodes[0].gain.value,0);assert.equal(f.audio.play('pickup'),false);
});
test('voice chat keeps automatic audio routing and ducks game effects',()=>{
  const f=fixture();f.audio.unlock();f.audio.setVoiceActive(true);f.audio.unlock();
  assert.deepEqual(f.sessions,['playback','auto']);assert.equal(f.nodes[1].gain.value,.35);
  f.audio.setVoiceActive(false);f.audio.unlock();assert.equal(f.sessions.at(-1),'playback');assert.equal(f.nodes[1].gain.value,1);
});
test('blocked audio and unavailable Safari APIs cannot break gameplay',async()=>{
  const f=fixture({resumeFails:true});f.audio.unlock();await Promise.resolve();await Promise.resolve();
  assert.equal(f.states.at(-1),'blocked');assert.equal(f.audio.play('pickup'),false);
  const unsupported=createGameAudio({host:{},nav:{}});assert.doesNotThrow(()=>unsupported.unlock());assert.equal(unsupported.play('pickup'),false);
});
test('overlapping effects have a fixed voice limit',()=>{
  const f=fixture();f.audio.unlock();for(let i=0;i<50;i++)f.audio.play('best');assert.equal(f.audio.activeVoices,32);
});
