import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom, applyCommand, publicRoom,TURN_TIMINGS,TURN_TIMINGS_BY_VERSION,GAME_VERSION} from '../public/party/engine.mjs';
function timeline(seed,difficulty='medium',step=50,rulesVersion=GAME_VERSION){
 const room=createRoom({code:'123456',mode:'solo',difficulty,seed,rulesVersion,player:{id:'p',name:'Player'}},0);
 applyCommand(room,'p',{type:'ready',ready:true},0);applyCommand(room,'p',{type:'start'},0);
 const turns=[],waits=[];let lastId=0,lastAway=3000;
 for(let at=3000;at<=63000;at+=step){applyCommand(room,'p',{type:'heartbeat'},at);
  for(const e of room.events.filter(e=>e.id>lastId)){
   if(e.type==='warning'&&room.lookAt){turns.push({at:e.at,warning:room.warningMs,watch:room.watchUntil-room.lookAt});waits.push(e.at-lastAway);}
   if(e.type==='away')lastAway=e.at;
  }lastId=room.eventSeq;
 }
 return {room,turns,waits};
}
test('Hard turns faster without glancing much more often than Medium',()=>{
 const counts={},warnings={};
 for(const difficulty of ['easy','medium','hard']){
  const games=Array.from({length:80},(_,i)=>timeline(i+1,difficulty,50,6)),turns=games.flatMap(g=>g.turns),waits=games.flatMap(g=>g.waits),p=TURN_TIMINGS[difficulty];
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
  const {turns,waits}=timeline(seed,'hard',50,6);let streak=0;
  for(let i=0;i<waits.length;i++){streak=waits[i]<=2500?streak+1:0;assert.ok(streak<=2);if(waits[i]>=5800&&turns[i].warning<=460)surprise=true;}
 }
 assert.equal(surprise,true);
});
test('v3–v8 rooms retain their clocks while new games use v9',()=>{
 const {turns,waits}=timeline(12,'medium',50,3);
 assert.ok(turns.every(t=>t.warning===900));assert.ok(waits.every(t=>t>=2400&&t<=4400));
 const v4=timeline(12,'hard',50,4),p4=TURN_TIMINGS_BY_VERSION[4].hard;
 assert.ok(v4.turns.every(t=>t.warning>=p4.warning[0]&&t.warning<=p4.warning[1]));
 const v5=timeline(12,'hard',50,5),p5=TURN_TIMINGS_BY_VERSION[5].hard;
 assert.ok(v5.turns.every(t=>t.warning>=p5.warning[0]&&t.warning<=p5.warning[1]));
 assert.throws(()=>createRoom({code:'123456',rulesVersion:2,player:{id:'p',name:'Player'}},0),/room_version_changed/);
 const room=createRoom({code:'123456',player:{id:'p',name:'Player'}},0);
 assert.equal(room.gameVersion,9);
 assert.equal(publicRoom(room,'p',0).difficulty,'medium');
 assert.throws(()=>createRoom({code:'123456',difficulty:'impossible',player:{id:'p',name:'Player'}},0),/invalid_difficulty/);
});

test('v6 seeded timing remains byte-for-byte stable for issued scores',()=>{
 const {turns}=timeline(712,'medium',50,6);
 assert.deepEqual(turns.map(t=>[t.at,t.warning,t.watch]),[[7713,1233,1245],[18008,1259,1333],[23080,1003,1382],[27251,972,1514],[33562,1135,1331],[40376,1028,1147],[47430,1209,1076],[52159,991,1544],[59689,1025,1571]]);
});

test('historical v7 rounds keep their safe opening and bounded timing mix',()=>{
 let surprise=false,brief=0,long=0,totalTurns=0;
 const schedules=new Set();
 for(let seed=1;seed<=500;seed++){
  const {turns,waits,room}=timeline(seed,'medium',50,7);totalTurns+=turns.length;schedules.add(JSON.stringify(turns));
  assert.equal(room.phase,'finished');
  assert.ok(waits[0]>=3200&&waits[0]<=4800);
  assert.ok(turns[0].warning>=900&&turns[0].warning<=1300);
  assert.ok(turns.some(t=>t.warning<=750),'a fast turn in every full round');
  assert.ok(turns.some(t=>t.warning>=1450),'a slow turn in every full round');
  let quickStreak=0;
  for(let i=0;i<turns.length;i++){
   const t=turns[i];assert.ok(t.warning>=550&&t.warning<=1900);assert.ok(t.watch>=850&&t.watch<=2700);
   if(i){assert.ok(!(t.warning<=750&&turns[i-1].warning<=750),'no consecutive fast turns');assert.ok(!(t.watch>=2100&&turns[i-1].watch>=2100),'no consecutive long stares');assert.ok(!(waits[i]>=5800&&waits[i-1]>=5800),'no consecutive long breaks');}
   quickStreak=waits[i]<=2500?quickStreak+1:0;assert.ok(quickStreak<=2);
   if(waits[i]>=5800&&t.warning<=750)surprise=true;
   if(t.watch<=1200)brief++;if(t.watch>=2100)long++;
  }
  const view=publicRoom(room,'p',63000);
  for(const key of ['turnBag','turnCount','lastTurnSpeed','lastWatch','nextWarningMs','npcState'])assert.equal(key in view,false);
 }
 assert.equal(schedules.size,500);assert.equal(surprise,true);
 assert.ok(brief>totalTurns*.15&&long>totalTurns*.10);
 assert.ok(totalTurns/500>=6&&totalTurns/500<=10,'variation must not become constant looking back');
});

test('one shared schedule ignores historical level names and survives JSON storage',()=>{
 assert.deepEqual(timeline(57,'easy').turns,timeline(57,'hard').turns);
 const room=createRoom({code:'TEST',seed:57,mode:'solo',player:{id:'p',name:'Player'}},0);
 applyCommand(room,'p',{type:'ready',ready:true},0);applyCommand(room,'p',{type:'start'},0);
 const firstOpeningState=room.npcState;
 for(let t=3000;t<24000;t+=250)applyCommand(room,'p',{type:'heartbeat'},t);
 const restored=JSON.parse(JSON.stringify(room));
 for(let t=24000;t<=63000;t+=250){applyCommand(room,'p',{type:'heartbeat'},t);applyCommand(restored,'p',{type:'heartbeat'},t);}
 assert.deepEqual(restored,room);
 applyCommand(room,'p',{type:'again'},63000);applyCommand(room,'p',{type:'ready',ready:true},63000);applyCommand(room,'p',{type:'start'},63000);
 assert.equal(room.turnCount,1);assert.deepEqual(room.turnBag,[]);assert.equal(room.lastTurnSpeed,'slow');
 assert.notEqual(room.npcState,firstOpeningState,'a rematch continues the generator instead of reseeding the opening');
});

test('historical v7 gives a 250ms observation interval plus 200ms reaction',()=>{
 for(let seed=1;seed<=100;seed++){
  const room=createRoom({code:'TEST',seed,mode:'solo',rulesVersion:7,player:{id:'p',name:'Player'}},0);
  applyCommand(room,'p',{type:'ready',ready:true},0);applyCommand(room,'p',{type:'start'},0);
  let releaseAt=null,seq=0;
  for(let at=3000;at<=63000;at+=50){
   applyCommand(room,'p',{type:'heartbeat'},at);
   if(room.phase!=='playing')continue;
   if(releaseAt!==null&&at>=releaseAt){applyCommand(room,'p',{type:'hold',held:false,seq:seq++,roundIndex:0},at);releaseAt=null;}
   if(at%250===0){
    if(room.attention==='away'&&!room.players[0].holding)applyCommand(room,'p',{type:'hold',held:true,seq:seq++,roundIndex:0},at);
    if(room.attention==='warning'&&room.players[0].holding&&releaseAt===null)releaseAt=at+200;
   }
  }
  assert.equal(room.players[0].catches,0,`seed ${seed} must leave a usable reaction window`);
  assert.ok(room.players[0].score>0);
 }
});


test('v7 seeded timing remains stable for already issued scores',()=>{
 const {turns}=timeline(712,'medium',50,7);
 assert.deepEqual(turns.map(t=>[t.at,t.warning,t.watch]),[[7545,1125,1453],[17940,987,2295],[25276,1524,851],[35040,1129,1749],[39939,684,1491],[45565,1664,907],[51566,1103,1672],[58132,1178,1616]]);
});

test('historical v8 starts gently and mixes genuinely sharp turns with slower breathing room',()=>{
 let turnsTotal=0,sharpTotal=0,slowerTotal=0,longSurprise=false;
 for(let seed=1;seed<=500;seed++){
  const {turns,waits}=timeline(seed,'medium',50,8);
  assert.ok(turns[0].warning>=1400&&turns[0].warning<=1850);
  assert.ok(waits[0]>=3200&&waits[0]<=4800);
  assert.ok(turns.some(t=>t.warning<=520),'every complete round includes a sharp turn');
  assert.ok(turns.slice(1).some(t=>t.warning>=750),'easy moments still return after the opening');
  let quickStreak=0;
  for(let i=0;i<turns.length;i++){
   const t=turns[i];turnsTotal++;
   assert.ok(t.warning>=380&&t.warning<=1850);
   assert.ok(t.watch>=850&&t.watch<=2700);
   if(t.warning<=520)sharpTotal++;if(t.warning>=1400)slowerTotal++;
   if(i){assert.ok(!(t.warning<=520&&turns[i-1].warning<=520));assert.ok(!(t.watch>=2100&&turns[i-1].watch>=2100));assert.ok(!(waits[i]>=5800&&waits[i-1]>=5800));}
   quickStreak=waits[i]<=2500?quickStreak+1:0;assert.ok(quickStreak<=2);
   if(i&&waits[i]>=5800&&t.warning<=520)longSurprise=true;
  }
 }
 assert.ok(sharpTotal/turnsTotal>.25&&sharpTotal/turnsTotal<.45);
 assert.ok(slowerTotal/turnsTotal>.18);
 assert.ok(turnsTotal/500>=7&&turnsTotal/500<=11,'challenge comes from speed, not constant returns');
 assert.equal(longSurprise,true);
});

test('a quick observer can react to v9 while a slow observer misses sharp turns',()=>{
 function play(seed,observation,reaction){
  const room=createRoom({code:'TEST',seed,mode:'solo',player:{id:'p',name:'Player'}},0);
  applyCommand(room,'p',{type:'ready',ready:true},0);applyCommand(room,'p',{type:'start'},0);
  let releaseAt=null,seq=0;
  for(let at=3000;at<=63000;at+=10){
   applyCommand(room,'p',{type:'heartbeat'},at);if(room.phase!=='playing')continue;
   if(releaseAt!==null&&at>=releaseAt){applyCommand(room,'p',{type:'hold',held:false,seq:seq++,roundIndex:0},at);releaseAt=null;}
   if(at%observation===0){
    if(room.attention==='away'&&!room.players[0].holding)applyCommand(room,'p',{type:'hold',held:true,seq:seq++,roundIndex:0},at);
    if(room.attention==='warning'&&room.players[0].holding&&releaseAt===null)releaseAt=at+reaction;
   }
  }
  return room.players[0].catches;
 }
 let slowCatches=0;
 for(let seed=1;seed<=100;seed++){assert.equal(play(seed,50,200),0);slowCatches+=play(seed,250,300);}
 assert.ok(slowCatches>=100,'sharp turns test reaction instead of always waiting through a long cue');
});


test('historical v8 timing stays unchanged for existing rooms and score tickets',()=>{
 const {turns}=timeline(712,'medium',50,8);
 assert.deepEqual(turns.map(t=>[t.at,t.warning,t.watch]),[[7545,1653,1453],[18468,891,1191],[24782,446,887],[28137,1698,1491],[34892,436,1651],[44484,798,1813],[51153,511,1027],[57108,1849,1682]]);
});

test('v9 returns substantially more often and mixes bounded rapid bursts with recovery',()=>{
 let total=0,previous=0,burstRounds=0,tripleRounds=0,longBreaks=0;
 for(let seed=1;seed<=500;seed++){
  const {turns,waits,room}=timeline(seed),old=timeline(seed,'medium',50,8);
  total+=turns.length;previous+=old.turns.length;
  assert.equal(room.phase,'finished');assert.ok(waits[0]>=3200&&waits[0]<=4000);
  assert.ok(turns[0].warning>=1400&&turns[0].warning<=1850,'the opening remains gentle');
  let streak=0,burst=false,triple=false;
  for(let i=1;i<waits.length;i++){
   const wait=waits[i];assert.ok(wait>=600&&wait<=4300);
   assert.ok(wait<=1100||wait>=1600&&wait<=2600||wait>=3300,'waits use the intended timing bands');
   streak=wait<=1100?streak+1:0;
   assert.ok(streak<=3,'a rapid burst must end');
   if(streak>=2)burst=true;if(streak===3)triple=true;
   if(i>=4&&waits[i-1]<=1100&&waits[i-2]<=1100&&waits[i-3]<=1100)assert.ok(wait>=1600,'three rapid returns force a recovery break');
   assert.ok(!(turns[i].warning<=520&&turns[i-1].warning<=520),'rapid cadence does not stack sharp turns');
   if(wait>=3300)longBreaks++;
  }
  if(burst)burstRounds++;if(triple)tripleRounds++;
  for(const field of ['quickStreak','lastTempo','turnBag','nextWarningMs'])assert.equal(field in publicRoom(room,'p',63000),false);
 }
 assert.ok(total>previous*1.45&&total<previous*1.75,'frequency rises noticeably without doubling');
 assert.ok(total/500>=12&&total/500<=16);
 assert.ok(burstRounds>350&&tripleRounds>200,'frequent bursts actually occur across different rounds');
 assert.ok(longBreaks>100,'occasional longer stealing windows remain');
});
