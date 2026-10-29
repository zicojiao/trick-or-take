import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom, joinRoom, applyCommand, publicRoom} from '../public/party/engine.mjs';
import {pollCommand} from '../public/party/input.mjs';
function running() {
  const r = createRoom({code: 'ABC234', seed: 712, player: {id: 'a', name: 'Owner'}}, 100000);
  joinRoom(r, {id: 'b', name: 'Friend'}, 100000);
  for (const p of r.players) applyCommand(r, p.id, {type: 'ready', ready: true}, 100000);
  applyCommand(r, 'a', {type: 'start'}, 100000);
  applyCommand(r, 'a', {type: 'hold', held: true, seq: 1, roundIndex: 0}, 103100);
  return r;
}
test('a lost owner release is retried and cannot be undone by an older press', () => {
  const r = running(); const next = pollCommand(publicRoom(r, 'a', 103800), 'a', false, 2);
  applyCommand(r, 'a', next.command, 103800);
  assert.equal(r.players[0].holding, false); assert.ok(r.players[0].score > 0); assert.equal(r.players[0].inputSeq, 2);
  applyCommand(r, 'a', {type: 'hold', held: true, seq: 1, roundIndex: 0}, 104000); assert.equal(r.players[0].holding, false);
});
test('a local safety release gets a new sequence after an acknowledged press', () => {
  const r = running(); const next = pollCommand(publicRoom(r, 'a', 103700), 'a', false, 1);
  assert.equal(next.seq, 2); applyCommand(r, 'a', next.command, 103700); assert.equal(r.players[0].holding, false);
});
test('confirmed idle polls heartbeat and every real player can reconcile a press', () => {
  const r = running(); applyCommand(r, 'a', {type: 'hold', held: false, seq: 2, roundIndex: 0}, 103700);
  assert.deepEqual(pollCommand(publicRoom(r, 'a', 103800), 'a', false, 2), {command: {type: 'heartbeat'}, seq: 2});
  assert.equal(pollCommand(publicRoom(r, 'b', 103800), 'b', true, 0).command.type, 'hold');
});
