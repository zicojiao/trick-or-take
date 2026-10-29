/** Small radio-group controller: custom visuals, standard keyboard semantics. */
export function createChoiceGroup(items,initialValue,onChange=()=>{}) {
  let value;
  function setValue(next,notify=false) {
    if(!items.some(([key])=>key===next))throw new RangeError('Unknown choice');
    const changed=value!==next;value=next;
    for(const [key,button] of items){button.setAttribute('role','radio');button.setAttribute('aria-checked',String(key===value));button.setAttribute('tabindex',key===value?'0':'-1');}
    if(changed&&notify)onChange(value);
  }
  for(const [key,button]of items) {
    button.addEventListener('click',()=>{if(!button.disabled)setValue(key,true);});
    button.addEventListener('keydown',event=>{
      if(!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(event.key)||button.disabled)return;
      const enabled=items.filter(([,b])=>!b.disabled);if(!enabled.length)return;
      event.preventDefault();let index=enabled.findIndex(([v])=>v===key);
      if(event.key==='Home')index=0;else if(event.key==='End')index=enabled.length-1;
      else index=(index+(event.key==='ArrowRight'||event.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length;
      enabled[index][1].focus();setValue(enabled[index][0],true);
    });
  }
  setValue(initialValue);
  return {get value(){return value;},setValue};
}
