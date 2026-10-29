// Browser gestures and transient feedback only; gameplay owns its pointer input.
export function installInteractions(doc,win,{now=()=>win.performance?.now?.()??Date.now()}={}) {
  const listeners=[],pressed=new Map(),clicks=new WeakMap();
  let tap=null,touch=null;
  const element=event=>event.target?.nodeType===3?event.target.parentElement:event.target;
  const native=target=>!!target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),a[href]');
  const button=target=>target?.closest?.('button');
  const game=target=>!!target?.closest?.('button,#party-canvas');
  const coarse=()=>!!win.matchMedia?.('(any-pointer: coarse)').matches;
  const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);listeners.push([target,type,fn,options]);};
  const clearPressed=()=>{for(const target of pressed.values())delete target.dataset.pressed;pressed.clear();};
  const stop=event=>{event.preventDefault();event.stopImmediatePropagation();};
  listen(doc,'pointerdown',event=>{
    const target=button(element(event));
    if(!target||target.disabled||event.isPrimary===false||event.button!==0)return;
    target.dataset.pressed='true';pressed.set(event.pointerId,target);
  },true);
  const release=event=>{const target=pressed.get(event.pointerId);if(target)delete target.dataset.pressed;pressed.delete(event.pointerId);};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(doc,type,release,true);
  listen(win,'blur',()=>{clearPressed();touch=tap=null;});
  listen(doc,'visibilitychange',()=>{if(doc.hidden){clearPressed();touch=tap=null;}});
  listen(doc,'click',event=>{
    const target=button(element(event));
    if(!target||target.disabled||!(event.detail>0||event.pointerType==='touch'))return;
    const stamp=now(),previous=clicks.get(target);clicks.set(target,stamp);
    if(previous!==undefined&&stamp-previous<350)stop(event);
  },true);
  listen(doc,'dblclick',event=>{
    const target=element(event);
    if(!native(target)&&game(target))event.preventDefault();
  },true);
  // Phones block the long-press menu. A mouse on a computer keeps the normal right-click menu.
  for(const type of ['contextmenu','selectstart','dragstart'])listen(doc,type,event=>{
    const target=element(event);
    if(!native(target)&&(coarse()||event.pointerType==='touch'||event.pointerType==='pen'))event.preventDefault();
  },true);
  // Safari versions with double-tap quirks also get a narrowly scoped fallback.
  // Scrolls, multi-touch pinches, editable fields and links retain native behavior.
  listen(doc,'touchstart',event=>{
    if(event.touches.length!==1){touch=null;tap=null;return;}
    const p=event.touches[0];touch={id:p.identifier,x:p.clientX,y:p.clientY,moved:false};
  },{passive:true});
  listen(doc,'touchmove',event=>{
    if(!touch||event.touches.length!==1){touch=null;tap=null;return;}
    const p=event.touches[0];
    if(p.identifier!==touch.id||Math.hypot(p.clientX-touch.x,p.clientY-touch.y)>10){touch.moved=true;tap=null;}
  },{passive:true});
  listen(doc,'touchend',event=>{
    const prior=touch;touch=null;
    if(!prior||prior.moved||event.touches.length||event.changedTouches.length!==1){tap=null;return;}
    const target=element(event),p=event.changedTouches[0];
    if(native(target)||p.identifier!==prior.id){tap=null;return;}
    const next={at:now(),x:p.clientX,y:p.clientY,button:button(target)||null};
    if(tap&&next.at-tap.at<350&&next.button===tap.button&&Math.hypot(next.x-tap.x,next.y-tap.y)<32)event.preventDefault();
    tap=next;
  },{passive:false});
  listen(doc,'touchcancel',()=>{touch=tap=null;clearPressed();},{passive:true});
  return ()=>{clearPressed();for(const [target,type,fn,options]of listeners)target.removeEventListener(type,fn,options);};
}
