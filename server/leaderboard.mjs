import {DIFFICULTIES, createRoom, applyCommand, COUNTDOWN_MS, ROUND_MS, GAME_VERSION, SUPPORTED_RULES_VERSIONS} from '../public/party/engine.mjs';

const fail = code => {throw new Error(code);};
const hex = bytes => Array.from(bytes, value => value.toString(16).padStart(2,'0')).join('');
async function digest(value) {return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}
const tokenHash = (code,id,token) => digest(`${code}:${id}:${token}`);
function equal(a,b) {if(typeof a!=='string'||a.length!==64||a.length!==b?.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
function difficulty(value='medium') {if(!Object.hasOwn(DIFFICULTIES,value))fail('invalid_difficulty');return value;}
function name(value) {
  if(typeof value!=='string'||!value.trim()||[...value.trim()].length>20||/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value))fail('invalid_name');
  return value.trim();
}

export async function createSoloTicket(db, level,rulesVersion=GAME_VERSION) {
  level=difficulty(level);
  if(!SUPPORTED_RULES_VERSIONS.includes(rulesVersion))fail('invalid_result');
  const id=crypto.randomUUID().replaceAll('-',''), token=hex(crypto.getRandomValues(new Uint8Array(32)));
  const seed=crypto.getRandomValues(new Uint32Array(1))[0], now=Date.now();
  await db.prepare('INSERT INTO leaderboard_runs (id,mode,difficulty,seed,token_hash,room_code,player_id,issued_at,expires_at,rules_version) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id,'solo',level,seed,await tokenHash(id,'solo',token),id,'solo',now,now+7_200_000,rulesVersion).run();
  return {runId:id,token,seed,difficulty:level,rulesVersion};
}

/** Private immutable results survive a host's rematch. Public rows require opt-in. */
export async function saveOnlineResults(db,room,viewerId) {
  if(room.phase!=='finished')return null;
  const eligible=room.players.filter(p=>!p.left&&p.joinedAt<=room.startsAt);
  const ids=await Promise.all(eligible.map(p=>digest(`${room.channel}:${room.roundIndex}:${p.id}`)));
  if(eligible.length)await db.batch(eligible.map((p,i)=>db.prepare('INSERT OR IGNORE INTO leaderboard_runs (id,mode,difficulty,token_hash,room_code,player_id,score,issued_at,expires_at,rules_version) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(ids[i],'online',room.difficulty||'medium',p.tokenHash,room.code,p.id,Math.floor(p.score+1e-9),room.startsAt,Date.now()+7*86_400_000,room.gameVersion)));
  return ids[eligible.findIndex(p=>p.id===viewerId)]||null;
}

/** Recompute bounded solo inputs using the same rules. No client score is accepted. */
export function replaySolo(seed,level,trace,rulesVersion=GAME_VERSION) {
  if(!Array.isArray(trace)||trace.length>512)fail('invalid_trace');
  const room=createRoom({code:'SOLO',mode:'solo',seed,difficulty:level,rulesVersion,player:{id:'solo',name:'Player'}},0);
  applyCommand(room,'solo',{type:'ready',ready:true},0);
  applyCommand(room,'solo',{type:'start'},0);
  let last=-1,held=false,cursor=0;
  function advance(at) {while(cursor+250<at){cursor+=250;applyCommand(room,'solo',{type:'heartbeat'},cursor);}cursor=at;}
  for(let i=0;i<trace.length;i++) {
    const input=trace[i];
    if(!input||Object.keys(input).some(k=>!['at','held'].includes(k))||!Number.isSafeInteger(input.at)||input.at<0||input.at>=ROUND_MS||input.at<last||typeof input.held!=='boolean'||input.held===held)fail('invalid_trace');
    last=input.at;held=input.held;const at=COUNTDOWN_MS+input.at;advance(at);
    applyCommand(room,'solo',{type:'hold',held,seq:i,roundIndex:0},at);
  }
  advance(COUNTDOWN_MS+ROUND_MS);
  applyCommand(room,'solo',{type:'heartbeat'},COUNTDOWN_MS+ROUND_MS);
  return Math.floor(room.players[0].score+1e-9);
}

async function authorizedRun(db,body,token) {
  if(!/^[a-f0-9]{32,64}$/.test(body.runId||''))fail('invalid_result');
  const run=await db.prepare('SELECT * FROM leaderboard_runs WHERE id = ?').bind(body.runId).first();
  if(!run||run.expires_at<Date.now())fail('result_not_found');
  if(!equal(run.token_hash,await tokenHash(run.room_code,run.player_id,token)))fail('invalid_membership');
  return run;
}
function verifiedScore(run,body) {
  let score=run.score;
  if(run.mode==='solo') {
    if(Date.now()-run.issued_at<COUNTDOWN_MS+ROUND_MS-1000)fail('match_not_finished');
    score=replaySolo(run.seed,run.difficulty,body.trace,run.rules_version??3);
  } else if(body.trace!==undefined)fail('invalid_body');
  return score;
}
export async function verifiedResult(db,body,token) {
  const run=await authorizedRun(db,body,token);
  return {run,score:verifiedScore(run,body)};
}
export async function submitScore(db,body,token) {
  const run=await authorizedRun(db,body,token),displayName=name(body.name),score=verifiedScore(run,body);
  const id=crypto.randomUUID(),now=Date.now();
  await db.prepare('INSERT OR IGNORE INTO leaderboard_entries (id,source_id,name,mode,difficulty,score,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(id,run.id,displayName,run.mode,run.difficulty,score,now).run();
  const saved=await db.prepare('SELECT id,name,mode,difficulty,score,created_at AS createdAt FROM leaderboard_entries WHERE source_id = ?').bind(run.id).first();
  return {entry:saved};
}

export async function listScores(db) {
  const result=await db.prepare('SELECT id,name,score,created_at AS createdAt,RANK() OVER (ORDER BY score DESC) AS rank FROM leaderboard_entries ORDER BY score DESC,created_at ASC,id ASC LIMIT 20').all();
  return {entries:result.results};
}
