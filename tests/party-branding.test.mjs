import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MESSAGES} from '../public/party/messages.mjs';
import {PAGE_META} from '../public/party/locale.mjs';
import {shareMeta} from '../public/party/share-meta.mjs';
import {renderPolicyPage} from '../server/policy-page.mjs';

test('game, metadata, sharing and policy pages use the new brand in both languages',()=>{
 for(const lang of ['en','zh']){
  assert.equal(MESSAGES[lang].brand,'Trick or Take');
  assert.match(PAGE_META[lang].title,/Trick or Take/);
  for(const result of [null,{score:12,mode:'solo',difficulty:'medium'}]){
   const meta=shareMeta(lang,result);assert.match(meta.title,/Trick or Take/);assert.match(meta.alt,/Trick or Take/);
  }
  for(const page of ['privacy','terms'])assert.match(renderPolicyPage(page,lang,'https://trickortake.com'),/Trick or Take/);
 }
 const initial=readFileSync(new URL('../public/party/index.html',import.meta.url),'utf8');
 assert.match(initial,/Play Trick or Take/);assert.doesNotMatch(initial,/Sneak a Treat/i);
 assert.match(readFileSync(new URL('../public/party/share-card.mjs',import.meta.url),'utf8'),/TRICK OR TAKE/);
});
