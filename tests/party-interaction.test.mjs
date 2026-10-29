import test from 'node:test';
import assert from 'node:assert/strict';
import {installInteractions} from '../public/party/interaction.mjs';

function harness(coarse=true){
  let stamp=1000;
  const surface=()=>({listeners:new Map(),addEventListener(type,fn,options){const list=this.listeners.get(type)||[];list.push({fn,options});this.listeners.set(type,list);},removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(x=>x.fn!==fn));}});
  const doc=surface(),win={...surface(),matchMedia:()=>({matches:coarse})};
  const dispose=installInteractions(doc,win,{now:()=>stamp});
  const target=({native=false,button=null,game=false}={})=>({closest(selector){if(selector.startsWith('input,'))return native?this:null;if(selector==='button')return button;if(selector.includes('#party-canvas'))return button||game?this:null;return null;}});
  const makeButton=()=>{const b=target({});b.dataset={};b.disabled=false;b.closest=selector=>selector==='button'||selector==='button,#party-canvas'?b:null;return b;};
  const fire=(type,element=target(),data={},root=doc)=>{const event={target:element,button:0,isPrimary:true,pointerId:1,detail:1,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...data};for(const {fn}of root.listeners.get(type)||[]){fn(event);if(event.stopped)break;}return event;};
  const touch=(element,{x=10,y=10,id=1}={})=>{const p={identifier:id,clientX:x,clientY:y};fire('touchstart',element,{touches:[p]});return fire('touchend',element,{touches:[],changedTouches:[p]});};
  return {doc,win,target,makeButton,fire,touch,dispose,advance:ms=>stamp+=ms};
}

test('long-press, drag and double-click defaults are blocked on game controls, preserving native fields and links',()=>{
  const h=harness(),b=h.makeButton(),canvas=h.target({game:true}),field=h.target({native:true});
  for(const type of ['contextmenu','selectstart','dragstart','dblclick']){
    assert.equal(h.fire(type,b).defaultPrevented,true);
    assert.equal(h.fire(type,canvas).defaultPrevented,true);
    assert.equal(h.fire(type,field).defaultPrevented,false);
  }
  assert.equal(h.fire('contextmenu').defaultPrevented,true,'blank phone areas suppress callouts');
  const desktop=harness(false);
  assert.equal(desktop.fire('contextmenu').defaultPrevented,false);
  assert.equal(desktop.fire('contextmenu',desktop.makeButton()).defaultPrevented,false,'a mouse keeps the menu on buttons');
  assert.equal(desktop.fire('contextmenu',desktop.target({game:true})).defaultPrevented,false,'a mouse keeps the menu on the scene');
  assert.equal(desktop.fire('contextmenu',desktop.makeButton(),{pointerType:'touch'}).defaultPrevented,true,'a touch on the same page still suppresses the callout');
});

test('button press feedback clears on release, cancellation, focus loss and hidden pages without consuming input',()=>{
  const h=harness(),b=h.makeButton();
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    assert.equal(h.fire('pointerdown',b).defaultPrevented,false);
    assert.equal(b.dataset.pressed,'true');h.fire(type,b);assert.equal(b.dataset.pressed,undefined);
  }
  h.fire('pointerdown',b);h.fire('blur',b,{},h.win);assert.equal(b.dataset.pressed,undefined);
  h.fire('pointerdown',b);h.doc.hidden=true;h.fire('visibilitychange');assert.equal(b.dataset.pressed,undefined);
  h.fire('pointerdown',b,{isPrimary:false});assert.equal(b.dataset.pressed,undefined);
  b.disabled=true;h.fire('pointerdown',b);assert.equal(b.dataset.pressed,undefined);
});

test('an accidental double click activates a button once; other buttons and keyboard activation remain immediate',()=>{
  const h=harness(),a=h.makeButton(),b=h.makeButton();let ready=false;
  const toggle=()=>{if(!h.fire('click',a).stopped)ready=!ready;};
  toggle();h.advance(100);toggle();assert.equal(ready,true);
  assert.equal(h.fire('click',b).stopped,false);
  assert.equal(h.fire('click',a,{detail:0}).stopped,false,'keyboard or assistive click is not throttled');
  h.advance(400);toggle();assert.equal(ready,false);
  assert.equal(h.doc.listeners.get('click')[0].options,true,'guard runs before target actions');
});

test('a quick second touch is cancelled to prevent native double-tap zoom, without cancelling the first tap',()=>{
  const h=harness(),b=h.makeButton();
  assert.equal(h.touch(b).defaultPrevented,false);h.advance(140);
  assert.equal(h.touch(b).defaultPrevented,true);
  h.advance(400);assert.equal(h.touch(b).defaultPrevented,false);
  assert.deepEqual(h.doc.listeners.get('touchend')[0].options,{passive:false});
});

test('text selection, separate controls, scrolls and multi-touch pinches are not treated as accidental double taps',()=>{
  const h=harness(),a=h.makeButton(),b=h.makeButton(),field=h.target({native:true});
  h.touch(a);h.advance(100);assert.equal(h.touch(b).defaultPrevented,false);
  h.touch(field);h.advance(100);assert.equal(h.touch(field).defaultPrevented,false);
  const p={identifier:1,clientX:10,clientY:10},moved={...p,clientY:80};
  h.touch(a);h.advance(100);h.fire('touchstart',a,{touches:[p]});h.fire('touchmove',a,{touches:[moved]});
  assert.equal(h.fire('touchend',a,{touches:[],changedTouches:[moved]}).defaultPrevented,false);
  const second={identifier:2,clientX:50,clientY:10};
  h.fire('touchstart',a,{touches:[p,second]});h.fire('touchmove',a,{touches:[p,second]});
  assert.equal(h.fire('touchend',a,{touches:[second],changedTouches:[p]}).defaultPrevented,false);
  assert.equal(h.fire('touchend',a,{touches:[],changedTouches:[second]}).defaultPrevented,false);
  assert.equal(h.touch(a).defaultPrevented,false);
});

test('touch cancellation and teardown cannot leave a pressed button or a stale tap',()=>{
  const h=harness(),b=h.makeButton();h.touch(b);h.fire('pointerdown',b);h.fire('touchcancel');
  assert.equal(b.dataset.pressed,undefined);assert.equal(h.touch(b).defaultPrevented,false);
  h.fire('pointerdown',b);h.dispose();assert.equal(b.dataset.pressed,undefined);
  assert.equal([...h.doc.listeners.values()].flat().length,0);
  assert.equal([...h.win.listeners.values()].flat().length,0);
});
