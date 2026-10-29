import test from 'node:test';
import assert from 'node:assert/strict';
import {randomNickname} from '../public/party/profile.mjs';

test('random names fit the room limit and use the selected language',()=>{
  for(const lang of ['en','zh'])for(let n=0;n<128;n++) {
    const name=randomNickname(lang,'',()=>n);
    assert.ok(name.length>0&&[...name].length<=18);
    assert.doesNotMatch(name,/[\p{Cc}\p{Cf}]/u);
    if(lang==='en')assert.match(name,/^[A-Za-z]+ [A-Za-z]+$/);
    else assert.match(name,/^[\u4e00-\u9fff]+$/);
  }
});

test('another roll always changes the current generated name, even with repeated randomness',()=>{
  for(const lang of ['en','zh']) {
    let previous='';
    for(let i=0;i<30;i++) {const next=randomNickname(lang,previous,()=>0);assert.notEqual(next,previous);previous=next;}
  }
});
