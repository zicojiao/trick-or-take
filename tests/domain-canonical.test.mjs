import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalRedirect} from '../server/canonical-domain.mjs';

test('legacy and www links retain paths and room, result and language parameters',()=>{
 for(const host of ['www.trickortake.com','candy.convoai.workers.dev'])for(const path of ['/?room=001234&lang=zh','/?result=abcdef&lang=en','/privacy?lang=zh','/og/default.png?lang=en']){
  const response=canonicalRedirect(new Request('https://'+host+path));
  assert.equal(response.status,308);assert.equal(response.headers.get('location'),'https://trickortake.com'+path);
 }
});

test('apex and local development requests are not redirected',()=>{
 for(const url of ['https://trickortake.com/','http://localhost:8787/'])assert.equal(canonicalRedirect(new Request(url)),null);
});
