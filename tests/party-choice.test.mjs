import test from 'node:test';
import assert from 'node:assert/strict';
import {createChoiceGroup} from '../public/party/choice.mjs';

test('custom choices support arrow keys, Home/End and one keyboard tab stop',()=>{
  const changes=[];
  const items=['easy','medium','hard'].map(value=>[value,{disabled:false,attributes:{},events:{},
    setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,f){this.events[k]=f;},focus(){this.focused=true;}}]);
  const choice=createChoiceGroup(items,'medium',v=>changes.push(v));
  assert.equal(items[1][1].attributes['aria-checked'],'true');
  assert.deepEqual(items.map(([,b])=>b.attributes.tabindex),['-1','0','-1']);
  items[1][1].events.keydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(choice.value,'hard');assert.equal(items[2][1].focused,true);
  items[2][1].events.keydown({key:'Home',preventDefault(){}});
  assert.equal(choice.value,'easy');
  items[0][1].events.keydown({key:'End',preventDefault(){}});
  assert.equal(choice.value,'hard');assert.deepEqual(changes,['hard','easy','hard']);
  items[1][1].disabled=true;items[1][1].events.click();assert.equal(choice.value,'hard');
  choice.setValue('easy');assert.equal(changes.length,3,'programmatic initialization does not trigger network work');
});
