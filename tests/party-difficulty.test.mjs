import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom, applyCommand, publicRoom,TURN_TIMINGS,TURN_TIMINGS_BY_VERSION,GAME_VERSION} from '../public/party/engine.mjs';
function timeline(seed,difficulty='medium',step=50,rulesVersion=GAME_VERSION){
 const room=createRoom({code:'123456',mode:'solo',difficulty,seed,rulesVersion,player:{id:'p',name:'Player'}},0);
 applyCommand(room,'p',{type:'ready',ready:true},0);applyCommand(room,'p',{type:'start'},0);
 const turns=[],waits=[];let lastId=0,lastAway=3000;
 for(let at=3000;at<=63000;at+=step){applyCommand(room,'p',{type:'heartbeat'},at);
  for(const e of room.events.filter(e=>e.id>lastId)){
   if(e.type==='warning'){turns.push({at:e.at,warning:room.warningMs});waits.push(e.at-lastAway);}
   if(e.type==='away')lastAway=e.at;
  }lastId=room.eventSeq;
 }
 return {room,turns,waits};
}
test('Hard turns faster without glancing much more often than Medium',()=>{
 const counts={},warnings={};
 for(const difficulty of ['easy','medium','hard']){
  const games=Array.from({length:80},(_,i)=>timeline(i+1,difficulty)),turns=games.flatMap(g=>g.turns),waits=games.flatMap(g=>g.waits),p=TURN_TIMINGS[difficulty];
  counts[difficulty]=turns.length/games.length;warnings[difficulty]=turns.reduce((n,t)=>n+t.warning,0)/turns.length;
  assert.ok(turns.every(t=>t.warning>=p.warning[0]&&t.warning<=p.warning[1]));
  assert.ok(waits.some(n=>n<=p.quick[1]),'quick returns really occur');
  assert.ok(waits.some(n=>n>=p.long[0]),'long tempting breaks really occur');
  assert.ok(Math.max(...turns.map(t=>t.warning))-Math.min(...turns.map(t=>t.warning))>=p.warning[1]-p.warning[0]-20,'the visible turn speed actually varies');
 }
 assert.ok(counts.medium>counts.easy+2,JSON.stringify(counts));
 assert.ok(Math.abs(counts.hard-counts.medium)<0.8,JSON.stringify(counts));
 assert.ok(warnings.hard<warnings.medium&&warnings.medium<warnings.easy,JSON.stringify(warnings));
 assert.ok(warnings.hard<=500,'hard turns stay fast');
 assert.ok(warnings.easy>=1500,'easy warnings stay readable');
});
test('turn timing is repeatable across polling rates and does not expose the next wait or speed',()=>{
 const a=timeline(712,'medium',50),b=timeline(712,'medium',250);
 assert.deepEqual(a.turns,b.turns);assert.deepEqual(a.waits,b.waits);
 const view=publicRoom(a.room,'p',63000);
 for(const key of ['npcState','nextLookAt','nextWarningMs','quickStreak','lastTempo'])assert.equal(key in view,false);
});
test('short waits are capped at two in a row, and a long break can end with a fast turn',()=>{
 let surprise=false;
 for(let seed=1;seed<=100;seed++){
  const {turns,waits}=timeline(seed,'hard');let streak=0;
  for(let i=0;i<waits.length;i++){streak=waits[i]<=2500?streak+1:0;assert.ok(streak<=2);if(waits[i]>=5800&&turns[i].warning<=460)surprise=true;}
 }
 assert.equal(surprise,true);
});
test('v3, v4 and v5 rooms retain their clocks while new games use v6',()=>{
 const {turns,waits}=timeline(12,'medium',50,3);
 assert.ok(turns.every(t=>t.warning===900));assert.ok(waits.every(t=>t>=2400&&t<=4400));
 const v4=timeline(12,'hard',50,4),p4=TURN_TIMINGS_BY_VERSION[4].hard;
 assert.ok(v4.turns.every(t=>t.warning>=p4.warning[0]&&t.warning<=p4.warning[1]));
 const v5=timeline(12,'hard',50,5),p5=TURN_TIMINGS_BY_VERSION[5].hard;
 assert.ok(v5.turns.every(t=>t.warning>=p5.warning[0]&&t.warning<=p5.warning[1]));
 assert.throws(()=>createRoom({code:'123456',rulesVersion:2,player:{id:'p',name:'Player'}},0),/room_version_changed/);
 const room=createRoom({code:'123456',player:{id:'p',name:'Player'}},0);
 assert.equal(room.gameVersion,6);
 assert.equal(publicRoom(room,'p',0).difficulty,'medium');
 assert.throws(()=>createRoom({code:'123456',difficulty:'impossible',player:{id:'p',name:'Player'}},0),/invalid_difficulty/);
});
