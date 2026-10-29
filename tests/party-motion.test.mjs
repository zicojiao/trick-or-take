import test from 'node:test';
import assert from 'node:assert/strict';
import {stepThiefPose,hostessTurnPose,hostessVisualState} from '../public/party/motion.mjs';

const neutral={phase:0,bob:0,lean:0,stretch:1,frame:0,frozen:false,hasMoved:false};
const idle=(hasMoved=false)=>({...neutral,frame:3,frozen:true,hasMoved});
const move=(previous,options={})=>stepThiefPose(previous,{active:true,stealing:true,dt:.04,speed:8,...options});

test('every release returns to innocent artwork immediately, regardless of the homeowner',()=>{
  for(const attention of ['away','warning','watching']){
    let moving=move(null);for(let i=0;i<8;i++)moving=move(moving);
    const original=structuredClone(moving);Object.freeze(moving);
    let stopped=stepThiefPose(moving,{active:true,stealing:false,attention,dt:.016});
    assert.deepEqual(stopped,idle(true));assert.deepEqual(moving,original);
    for(const dt of [.016,.05,10,0])stopped=stepThiefPose(stopped,{active:true,stealing:false,attention,dt});
    assert.deepEqual(stopped,idle(true),'idle cannot keep a candy-holding drawing or moving transform');
  }
});

test('a player who has not stolen anything also uses the innocent pose',()=>{
  assert.deepEqual(stepThiefPose(null,{active:true,stealing:false}),idle());
  assert.deepEqual(stepThiefPose({phase:NaN},{active:true,stealing:false}),idle());
});

test('each thief owns independent motion state',()=>{
  const first=move(null,{dt:.02}),second=move(null,{dt:.04}),saved=structuredClone(second);
  assert.deepEqual(stepThiefPose(first,{active:true,stealing:false}),idle(true));
  const advanced=move(second);assert.deepEqual(second,saved);assert.ok(advanced.phase>second.phase);
});

test('pressing again leaves the innocent pose and restarts stealing, including while watched',()=>{
  const released=stepThiefPose(move(null),{active:true,stealing:false});
  assert.deepEqual(move(released,{dt:0}),{...neutral,frame:1,hasMoved:true});
  assert.equal(move(released,{attention:'watching'}).frame,1,'the expression never locks player input');
});

test('both stealing drawings turn innocent on release',()=>{
  let pose=null;const drawings=new Set();
  for(let i=0;i<20;i++){
    pose=move(pose,{dt:.05,speed:8});drawings.add(pose.frame);
    assert.deepEqual(stepThiefPose(pose,{active:true,stealing:false}),idle(true));
  }
  assert.deepEqual(drawings,new Set([1,2]));
});

test('a catch takes priority; recovering without an input returns to innocent',()=>{
  for(const previous of [move(null),idle(true)]){
    const caught=move(previous,{caught:true});assert.deepEqual(caught,neutral);
    assert.deepEqual(stepThiefPose(caught,{active:true,stealing:false,caught:true}),neutral);
    assert.deepEqual(stepThiefPose(caught,{active:true,stealing:false}),idle());
  }
});

test('leaving a round clears pose history before the next idle or steal',()=>{
  const ended=move(move(null),{active:false});assert.deepEqual(ended,neutral);
  assert.deepEqual(stepThiefPose(ended,{active:true,stealing:false}),idle());
  assert.deepEqual(move(ended),move(undefined));
});

test('reduced motion changes artwork on press and release without bob, lean or stretch',()=>{
  let pose=move(null,{reduced:true});for(let i=0;i<20;i++)pose=move(pose,{reduced:true});
  assert.deepEqual(pose,{...neutral,frame:1,hasMoved:true});
  assert.deepEqual(stepThiefPose(pose,{active:true,stealing:false,reduced:true,dt:50}),idle(true));
  const changed=move(move(null),{reduced:true});
  assert.equal(changed.bob,0);assert.equal(changed.lean,0);assert.equal(changed.stretch,1);
});

test('invalid or stalled frame times cannot poison or jump the visual pose',()=>{
  const previous=move(null);
  for(const dt of [-1,NaN,Infinity,-Infinity,'1'])assert.deepEqual(move(previous,{dt}),previous);
  assert.deepEqual(move(previous,{dt:1e300}),move(previous,{dt:.05}));
  for(const speed of [-1,NaN,Infinity,-Infinity,1e300]){
    const pose=move(previous,{speed});
    for(const key of ['phase','bob','lean','stretch'])assert.equal(Number.isFinite(pose[key]),true);
    assert.ok(Math.abs(pose.bob)<=.03&&Math.abs(pose.lean)<=.1&&pose.stretch>.9&&pose.stretch<1.1);
  }
});


test('sharp v8 turns begin with the shoulder turn and skip stop/listen at every frame',()=>{
 for(const duration of [380,450,520])for(let i=0;i<60;i++){
  const pose=hostessTurnPose(duration,i/60,8);
  assert.equal(pose.cue,'snap');assert.equal(pose.frameIndex,5);assert.equal(pose.sharp,true);
 }
 assert.ok(hostessTurnPose(380,.1,8).movement>0,'movement starts in the first part of the turn');
});
test('gentle v8 and historical turns retain their slower readable poses',()=>{
 for(const [duration,version] of [[1400,8],[750,8],[550,7],[900,6]]){
  assert.equal(hostessTurnPose(duration,0,version).cue,'stop');
  assert.equal(hostessTurnPose(duration,.25,version).cue,'listen');
  assert.equal(hostessTurnPose(duration,.7,version).cue,'peek');
 }
});


test('a delivered online deadline renders the full sharp turn without an early visual cue',()=>{
 const room={gameVersion:8,phase:'playing',attention:'away',lookAt:0,warningMs:900,upcomingTurn:{at:2000,lookAt:2400,warningMs:400}};
 const saved=structuredClone(room);
 assert.equal(hostessVisualState(room,1999).attention,'away');
 for(let now=2000;now<2400;now+=16){
  const visible=hostessVisualState(room,now);
  assert.equal(visible.attention,'warning');assert.equal(visible.lookAt,2400);
  assert.equal(hostessTurnPose(visible.warningMs,(now-2000)/400,8).cue,'snap');
 }
 assert.equal(hostessVisualState(room,2400).attention,'watching');assert.deepEqual(room,saved);
 assert.equal(hostessVisualState({...room,gameVersion:7},2100).attention,'away');
 assert.equal(hostessVisualState({...room,phase:'finished'},2100).attention,'away');
});
