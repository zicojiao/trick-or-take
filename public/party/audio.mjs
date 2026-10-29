// Gesture-unlocked Web Audio shared by music and effects. No downloaded samples.
export function createGameAudio({host=globalThis, nav=globalThis.navigator, onState=()=>{}}={}) {
  let context, output, sfx, enabled=true, voiceActive=false, pickup=0, lastPickup=-Infinity;
  const voices=new Set();
  function getAudio(){
    if(!context||context.state==='closed'){
      const Audio=host.AudioContext||host.webkitAudioContext;if(!Audio)return null;
      context=new Audio();output=context.createGain();output.gain.value=enabled ? .75 : 0;output.connect(context.destination);
      sfx=context.createGain();sfx.gain.value=voiceActive ? .35 : 1;sfx.connect(output);
      context.onstatechange=()=>onState(context.state);
    }
    return {context,output};
  }
  function audioSession(type){try{if(nav?.audioSession)nav.audioSession.type=type;}catch{/* Optional Safari API. */}}
  function setVoiceActive(active){voiceActive=active;if(active)audioSession('auto');if(sfx)sfx.gain.value=active ? .35 : 1;}
  function unlock(){
    if(!enabled)return;
    try{
      // Playback gives explicitly enabled game audio media-volume semantics on iOS.
      // Let Agora manage the audio session while the microphone is in use.
      if(!voiceActive)audioSession('playback');
      const audio=getAudio();if(!audio)return;
      if(context.state!=='running')void context.resume().then(()=>onState(context.state)).catch(()=>onState('blocked'));
      // Start a silent buffer synchronously, while this tap still owns activation.
      const source=context.createBufferSource();source.buffer=context.createBuffer(1,1,context.sampleRate);
      source.connect(output);source.onended=()=>source.disconnect();source.start();
      onState(context.state);
    }catch{onState('blocked');}
  }
  function setEnabled(value){enabled=value;if(output)output.gain.value=value ? .75 : 0;}
  function tone(type,freq,start,duration,level,endFrequency){
    if(voices.size>=32)return;
    const osc=context.createOscillator(),gain=context.createGain();osc.type=type;
    osc.frequency.setValueAtTime(freq,start);
    if(endFrequency)osc.frequency.exponentialRampToValueAtTime(endFrequency,start+duration);
    gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(level,start+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    osc.connect(gain);gain.connect(sfx);voices.add(osc);
    osc.onended=()=>{voices.delete(osc);osc.disconnect();gain.disconnect();};
    osc.start(start);osc.stop(start+duration+.02);
  }
  function play(kind){
    if(!enabled||context?.state!=='running')return false;
    const at=context.currentTime;
    if(kind==='pickup'){
      // One sparkle per update, never a burst of queued sounds after network lag.
      if(at-lastPickup<.12)return false;lastPickup=at;
      const pitch=[1046.5,1318.5,1174.7,1568][pickup++%4];
      tone('triangle',pitch*.5,at,.065,.035,pitch*.75);
      tone('sine',pitch,at+.018,.105,.045,pitch*1.12);return true;
    }
    if(kind==='finish'||kind==='best'){
      [293.66,349.23,440,587.33].forEach((freq,i)=>{tone('triangle',freq,at+i*.08,.26,.05);tone('sine',freq/2,at+i*.08,.3,.028);});
      for(const freq of [293.66,349.23,440])tone('sine',freq,at+.36,.72,.03);
      tone('triangle',880,at+.62,.28,.035);
      if(kind==='best'){tone('triangle',1174.66,at+.78,.42,.04);tone('sine',587.33,at+.78,.5,.03);}return true;
    }
    const notes=kind==='catch'?[260,190]:kind==='warning'?[520,620]:[730,930];
    notes.forEach((freq,i)=>tone('sine',freq,at+i*.09,.14,.045));return true;
  }
  return {getAudio,unlock,setEnabled,setVoiceActive,play,get state(){return context?.state||'locked';},get activeVoices(){return voices.size;}};
}
