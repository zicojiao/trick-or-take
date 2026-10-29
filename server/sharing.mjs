import {verifiedResult} from './leaderboard.mjs';
export async function createSharedResult(db,body,token) {
  const {run,score}=await verifiedResult(db,body,token);
  const id=Array.from(crypto.getRandomValues(new Uint8Array(12)),n=>n.toString(16).padStart(2,'0')).join('');
  await db.prepare('INSERT OR IGNORE INTO shared_results (id,source_id,score,mode,difficulty,created_at) VALUES (?,?,?,?,?,?)')
    .bind(id,run.id,score,run.mode,run.difficulty,Date.now()).run();
  const saved=await db.prepare('SELECT id,score,mode,difficulty FROM shared_results WHERE source_id = ?').bind(run.id).first();
  if(!saved)throw new Error('service_unavailable');return {result:saved};
}
export async function getSharedResult(db,id) {
  if(!/^[a-f0-9]{24}$/.test(id||''))return null;
  return await db.prepare('SELECT id,score,mode,difficulty FROM shared_results WHERE id = ?').bind(id).first();
}
