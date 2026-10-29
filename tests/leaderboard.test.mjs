import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handlePartyRequest} from '../server/party-service.mjs';
import {applyCommand} from '../public/party/engine.mjs';
import {replaySolo} from '../server/leaderboard.mjs';
import {PAGE_META,requestLanguage} from '../public/party/locale.mjs';

test('language comes from the /zh path, with English everywhere else',()=>{
  assert.equal(requestLanguage('https://game.test/'),'en');
  assert.equal(requestLanguage('https://game.test/zh'),'zh');
  assert.equal(requestLanguage('https://game.test/zh/privacy'),'zh');
  assert.equal(requestLanguage('https://game.test/?lang=zh'),'en');
  assert.match(PAGE_META.zh.description,/排行榜/);
  assert.doesNotMatch(PAGE_META.en.description,/[\u4e00-\u9fff]/);
});

async function setup(t){
  const {Miniflare}=await import('miniflare');
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'leaderboard-test'}});
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
  await db.exec('CREATE TABLE party_rooms (code TEXT PRIMARY KEY,state TEXT,version INTEGER,expires_at INTEGER)');
  await db.exec(readFileSync(new URL('../drizzle/0001_leaderboards.sql',import.meta.url),'utf8').replace(/--> statement-breakpoint/g,'').replace(/\s+/g,' '));
  await db.exec(readFileSync(new URL('../drizzle/0002_regular_drax.sql',import.meta.url),'utf8').replace(/--> statement-breakpoint/g,'').replace(/\s+/g,' '));
  await db.exec(readFileSync(new URL('../drizzle/0003_dapper_living_mummy.sql',import.meta.url),'utf8').replace(/--> statement-breakpoint/g,'').replace(/\s+/g,' '));
  async function api(action,body,token){const response=await handlePartyRequest(new Request('https://game.test/api/party/'+action,{method:body?'POST':'GET',headers:{origin:'https://game.test','content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB:db},action.split('?')[0]);return{status:response.status,data:await response.json()};}
  return {db,api};
}

test('solo publication is opt-in, authenticated, complete-length and idempotent; scores are replayed',async t=>{
  const {db,api}=await setup(t);
  const ticket=(await api('solo-ticket',{difficulty:'hard'})).data;
  assert.ok(ticket.runId&&ticket.token);assert.equal(ticket.difficulty,'medium');
  assert.equal((await api('leaderboard?difficulty=hard&mode=solo')).data.entries.length,0);
  const body={runId:ticket.runId,name:'Player',trace:[{at:0,held:true},{at:500,held:false}]};
  assert.equal((await api('submit-score',body,'f'.repeat(64))).status,401);
  assert.equal((await api('submit-score',body,ticket.token)).status,409);
  await db.prepare('UPDATE leaderboard_runs SET issued_at = ? WHERE id = ?').bind(Date.now()-64000,ticket.runId).run();
  assert.equal((await api('submit-score',{...body,score:99999},ticket.token)).status,400);
  assert.equal((await api('submit-score',{...body,trace:[{at:-1,held:true}]},ticket.token)).status,400);
  const submitted=await Promise.all([api('submit-score',body,ticket.token),api('submit-score',body,ticket.token)]);
  assert.ok(submitted.every(r=>r.status===200));
  assert.equal(submitted[0].data.entry.score,3);
  assert.equal(submitted[0].data.entry.id,submitted[1].data.entry.id);
  const board=(await api('leaderboard?difficulty=hard&mode=solo')).data;
  assert.equal(board.entries.length,1);assert.equal(board.entries[0].score,3);
  assert.equal((await api('leaderboard')).data.entries.length,1);
  assert.equal((await api('leaderboard?difficulty=hard&mode=online')).data.entries.length,1,'old filter query links also show the shared ranking');
  assert.equal('token_hash' in board.entries[0],false);
});

test('online finished scores survive a rematch, require the correct member and are never auto-published',async t=>{
  const {db,api}=await setup(t);
  const owner=(await api('create',{name:'Host',difficulty:'easy'})).data;
  const friend=(await api('join',{code:owner.room.code,name:'Friend'})).data;
  assert.equal(friend.room.difficulty,'medium');
  const command=(member,command)=>api('state',{code:owner.room.code,playerId:member.playerId,command},member.token);
  for(const member of [owner,friend])await command(member,{type:'ready',ready:true});
  await command(owner,{type:'start'});
  const row=await db.prepare('SELECT state FROM party_rooms WHERE code = ?').bind(owner.room.code).first();
  const room=JSON.parse(row.state),shift=70000;
  for(const key of ['startsAt','endsAt','lastTick','createdAt','nextLookAt'])room[key]-=shift;
  for(const p of room.players){p.lastSeen-=shift;p.joinedAt-=shift;}
  const start=room.startsAt;
  applyCommand(room,owner.playerId,{type:'hold',held:true,seq:0,roundIndex:0},start);
  applyCommand(room,owner.playerId,{type:'hold',held:false,seq:1,roundIndex:0},start+500);
  for(let at=start+750;at<=room.endsAt;at+=250)for(const p of room.players)applyCommand(room,p.id,{type:'heartbeat'},at);
  await db.prepare('UPDATE party_rooms SET state = ? WHERE code = ?').bind(JSON.stringify(room),room.code).run();
  const ended=await command(owner,{type:'heartbeat'});assert.equal(ended.data.room.phase,'finished');assert.ok(ended.data.resultId);
  assert.equal((await api('leaderboard?difficulty=easy&mode=online')).data.entries.length,0);
  const body={runId:ended.data.resultId,name:'Host'};
  assert.equal((await api('submit-score',body,friend.token)).status,401);
  await command(owner,{type:'again'});
  const saved=await api('submit-score',body,owner.token);
  assert.equal(saved.status,200);assert.equal(saved.data.entry.score,3);
  assert.equal((await api('submit-score',{...body,name:'New name'},owner.token)).data.entry.name,'Host');
});

test('solo replay rejects malformed timelines and reproduces confiscation at every difficulty',()=>{
  for(const level of ['easy','medium','hard']){
    assert.equal(replaySolo(2,level,[{at:0,held:true},{at:500,held:false}]),3);
    assert.equal(replaySolo(2,level,[{at:0,held:true}]),0);
  }
  for(const trace of [null,[{at:60000,held:true}],[{at:500,held:true},{at:100,held:false}],[{at:0,held:'true'}],Array.from({length:513},()=>({at:0,held:true}))])assert.throws(()=>replaySolo(2,'medium',trace),/invalid_trace/);
});

test('one leaderboard combines modes and difficulties with competition ranks, stable ties and a top-20 bound',async t=>{
  const {db,api}=await setup(t);
  for(let i=0;i<24;i++)await db.prepare('INSERT INTO leaderboard_entries (id,source_id,name,mode,difficulty,score,created_at) VALUES (?,?,?,?,?,?,?)').bind(String(i),String(i),'Player '+i,i%2?'online':'solo',['easy','medium','hard'][i%3],i<2?100:98-i,i).run();
  const board=(await api('leaderboard')).data.entries;
  assert.equal(board.length,20);assert.deepEqual(board.slice(0,3).map(e=>e.rank),[1,1,3]);
  assert.deepEqual(board.slice(0,2).map(e=>e.name),['Player 0','Player 1']);
  assert.deepEqual((await api('leaderboard?difficulty=hard&mode=online')).data.entries,board);
  assert.deepEqual((await api('leaderboard')).data,{entries:board});
});


test('challenge publication is explicit, authenticated, idempotent, anonymous and independent of the leaderboard',async t=>{
  const {db,api}=await setup(t),ticket=(await api('solo-ticket',{difficulty:'easy'})).data;
  const body={runId:ticket.runId,trace:[{at:0,held:true},{at:500,held:false}]};
  assert.equal((await db.prepare('SELECT count(*) AS n FROM shared_results').first()).n,0);
  assert.equal((await api('share-result',body,'bad')).status,401);
  assert.equal((await api('share-result',body,ticket.token)).status,409);
  await db.prepare('UPDATE leaderboard_runs SET issued_at = ? WHERE id = ?').bind(Date.now()-64000,ticket.runId).run();
  assert.equal((await api('share-result',{...body,score:999},ticket.token)).status,400);
  assert.equal((await api('share-result',{...body,name:'Private'},ticket.token)).status,400);
  const shared=await api('share-result',body,ticket.token);assert.equal(shared.status,200);
  assert.equal(shared.data.result.score,3);assert.match(shared.data.result.id,/^[a-f0-9]{24}$/);
  assert.deepEqual(Object.keys(shared.data.result).sort(),['difficulty','id','mode','score']);
  assert.deepEqual((await api('share-result',body,ticket.token)).data,shared.data);
  assert.deepEqual((await api('shared-result?id='+shared.data.result.id)).data,shared.data);
  assert.equal((await api('leaderboard?difficulty=easy&mode=solo')).data.entries.length,0);
  assert.equal((await api('shared-result?id='+ 'a'.repeat(24))).status,404);
  assert.equal((await api('shared-result?id=invalid')).status,404);
});

test('cached v3–v6 solo clients keep correct replay rules as new games use v7',async t=>{
  const {db,api}=await setup(t),trace=[{at:3500,held:true},{at:4000,held:false}];
  const expected={3:3,4:0,5:3,6:3,7:3};
  for(const rulesVersion of [3,4,5,6,7]){
    const ticket=(await api('solo-ticket',{difficulty:'medium',rulesVersion})).data;
    assert.equal(ticket.rulesVersion,rulesVersion);
    await db.prepare('UPDATE leaderboard_runs SET issued_at = ?,seed = ? WHERE id = ?').bind(Date.now()-64000,2,ticket.runId).run();
    const result=await api('share-result',{runId:ticket.runId,trace},ticket.token);
    assert.equal(result.status,200);assert.equal(result.data.result.score,expected[rulesVersion]);
  }
  assert.equal((await api('solo-ticket',{difficulty:'medium'})).data.rulesVersion,7);
  assert.equal((await api('solo-ticket',{difficulty:'medium',rulesVersion:2})).status,400);
});
