// Agora RTM carries room-change notifications. D1 remains the only game authority.
const SDK_URL=new URL('./vendor/agora-rtm-2.3.0.js',import.meta.url).href;
const TYPE='candy.room.changed.v1';let sdkPromise;
function loadSdk(){
 if(globalThis.AgoraRTM?.RTM)return Promise.resolve(globalThis.AgoraRTM);
 if(sdkPromise)return sdkPromise;
 sdkPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=SDK_URL;script.async=true;
  const timer=setTimeout(()=>finish(false),20000);
  function finish(ok){clearTimeout(timer);script.onload=script.onerror=null;if(ok&&globalThis.AgoraRTM?.RTM)resolve(globalThis.AgoraRTM);else{script.remove();reject(new Error('signal_sdk_load'));}}
  script.onload=()=>finish(true);script.onerror=()=>finish(false);document.head.append(script);
 }).catch(error=>{sdkPromise=null;throw error;});return sdkPromise;
}
function credentials(value){
 if(!value||!/^[a-f0-9]{32}$/i.test(value.appId)||!/^[a-z0-9_-]{1,63}$/i.test(value.channel)||!/^\d{1,10}$/.test(value.userId)||typeof value.token!=='string'||!value.token.startsWith('007')||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now())throw new Error('invalid_signal_credentials');return value;
}
export function createSignaling({getCredentials,onHint=()=>{},onStatus=()=>{},onTraffic=()=>{},sdkLoader=loadSdk,timers=globalThis,now=()=>Date.now()}){
 let generation=0,current=null,key=null,transition=Promise.resolve(),status='idle';const traffic={sent:0,received:0};
 const active=s=>current===s&&s.generation===generation;
 const notify=(state,error)=>{status=state;const raw=error?.errorCode??error?.code;const code=/^(?:-?\d{1,8}|[A-Z_]{2,60})$/.test(String(raw))?String(raw):undefined;onStatus({state,errorCode:code});};
 async function dispose(s){
  if(!s)return;if(s.cleanup)return s.cleanup;
  s.cleanup=(async()=>{timers.clearTimeout(s.renewTimer);timers.clearTimeout(s.pulseTimer);
   if(s.subscribed)try{await s.client.unsubscribe(s.credentials.channel);}catch{}
   if(s.client)try{await s.client.logout();}catch{}
   try{s.client?.release?.();}catch{}s.ready=false;
  })();return s.cleanup;
 }
 function schedule(s){
  timers.clearTimeout(s.renewTimer);const remaining=s.credentials.expiresAt-now(),margin=Math.min(60000,Math.max(5000,remaining/4));
  s.renewTimer=timers.setTimeout(()=>void renew(s),Math.max(1000,remaining-margin));s.renewTimer?.unref?.();
 }
 async function renew(s){
  if(!active(s)||s.renewing)return;s.renewing=true;
  try{const next=credentials(await getCredentials());if(!active(s))return;
   for(const k of ['appId','channel','userId'])if(next[k]!==s.credentials[k])throw new Error('signal_identity_changed');
   await s.client.renewToken(next.token);if(active(s)){s.credentials=next;schedule(s);notify('connected');}
  }catch(error){if(active(s)){notify('error',error);s.ready=false;await dispose(s);}}
  finally{s.renewing=false;}
 }
 function register(s){
  s.client.addEventListener('message',e=>{
   if(!active(s)||!s.ready||e.channelName!==s.credentials.channel||e.customType!==TYPE||String(e.publisher)===s.credentials.userId||typeof e.message!=='string'||e.message.length>160)return;
   let data;try{data=JSON.parse(e.message);}catch{return;}
   if(!data||Object.keys(data).some(k=>!['v','version'].includes(k))||data.v!==1||!Number.isSafeInteger(data.version)||data.version<0)return;
   traffic.received++;onTraffic({...traffic});onHint({version:data.version});
  });
  s.client.addEventListener('presence',e=>{if(active(s)&&s.ready&&e.channelName===s.credentials.channel)onHint({presence:true});});
  s.client.addEventListener('linkState',e=>{
   if(!active(s)||!s.ready)return;
   if(e.currentState==='CONNECTED'){notify('connected');onHint({reconnected:true});}
   else if(e.currentState==='FAILED'){
    if(e.reasonCode==='TOKEN_EXPIRED')void connect(s.key,true);else notify('error',{code:e.reasonCode});
   }else notify('reconnecting');
  });
  s.client.addEventListener('tokenPrivilegeWillExpire',channel=>{if(!channel||channel===s.credentials.channel)void renew(s);});
 }
 function connect(nextKey,retry=false){
  if(key===nextKey&&!retry)return transition;
  key=nextKey;const id=++generation,prior=current;current=null;
  transition=transition.catch(()=>{}).then(async()=>{
   await dispose(prior);if(id!==generation)return false;
   const s=current={generation:id,key:nextKey,ready:false,subscribed:false,lastPulse:-Infinity};notify('connecting');
   try{
    const [sdk,auth]=await Promise.all([sdkLoader(),getCredentials()]);if(!active(s))return false;
    s.credentials=credentials(auth);s.client=new sdk.RTM(auth.appId,auth.userId,{logLevel:'none',logUpload:false});register(s);
    await s.client.login({token:auth.token});if(!active(s)){await dispose(s);return false;}
    await s.client.subscribe(auth.channel,{withMessage:true,withPresence:true});s.subscribed=true;
    if(!active(s)){await dispose(s);return false;}
    s.ready=true;schedule(s);notify('connected');onHint({connected:true});return true;
   }catch(error){if(active(s))notify('error',error);await dispose(s);return false;}
  });return transition;
 }
 function pulse(version){
  const s=current;if(!s?.ready||!active(s)||!Number.isSafeInteger(version)||version<0)return;
  s.queuedVersion=Math.max(s.queuedVersion??0,version);
  const flush=()=>{s.pulseTimer=null;if(!active(s)||!s.ready)return;const next=s.queuedVersion;s.queuedVersion=null;s.lastPulse=now();
   void s.client.publish(s.credentials.channel,JSON.stringify({v:1,version:next}),{customType:TYPE,channelType:'MESSAGE'}).then(()=>{if(active(s)){traffic.sent++;onTraffic({...traffic});}}).catch(()=>{if(active(s))notify('reconnecting');});};
  if(s.pulseTimer)return;const delay=Math.max(0,120-(now()-s.lastPulse));if(delay)s.pulseTimer=timers.setTimeout(flush,delay);else flush();
 }
 function leave(){key=null;generation++;const prior=current;current=null;notify('idle');transition=transition.catch(()=>{}).then(()=>dispose(prior));return transition;}
 return{connect,leave,pulse,get state(){return status;},get traffic(){return{...traffic};}};
}
