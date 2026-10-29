import test from 'node:test';import assert from 'node:assert/strict';
import {createSignaling} from '../public/party/signaling.mjs';
import {generateSignalCredentials} from '../server/agora-token.mjs';
import tokenTools from 'agora-token/src/AccessToken2.js';
const env={AGORA_APP_ID:'0123456789abcdef0123456789abcdef',AGORA_APP_CERTIFICATE:'fedcba9876543210fedcba9876543210'};
const auth=()=>({appId:env.AGORA_APP_ID,userId:'71',channel:'pumpkin_1234567890abcdef',token:'007fixture',expiresAt:Date.now()+3600000});
function rig({login,subscribe,getCredentials}={}){
 const calls=[],clients=[],hints=[],states=[],traffic=[],timers=new Map();let time=0,id=0,requests=0;
 class RTM{constructor(appId,userId){calls.push(['new',appId,userId]);this.events={};clients.push(this);}addEventListener(k,f){this.events[k]=f;}async login(value){calls.push(['login',value]);await login?.();}async subscribe(...a){calls.push(['subscribe',...a]);await subscribe?.();}async publish(...a){calls.push(['publish',...a]);}async renewToken(token){calls.push(['renew',token]);}async unsubscribe(...a){calls.push(['unsubscribe',...a]);}async logout(){calls.push(['logout']);}}
 const signal=createSignaling({getCredentials:async()=>{requests++;return getCredentials?getCredentials():auth();},sdkLoader:async()=>({RTM}),now:()=>time,timers:{setTimeout(f,ms){timers.set(++id,{f,ms});return id;},clearTimeout(id){timers.delete(id);}},onHint:e=>hints.push(e),onStatus:s=>states.push(s),onTraffic:t=>traffic.push(t)});
 return{signal,calls,clients,hints,states,traffic,timers,get requests(){return requests;},advance(n){time+=n;}};
}
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
test('official RTM tokens are signed, bound to the exact RTC member string and bounded by room expiry',()=>{
 const room={channel:auth().channel,expiresAt:Date.now()+90000},player={uid:71,left:false};
 const value=generateSignalCredentials(env,room,player),parsed=new tokenTools.AccessToken2();assert.equal(parsed.from_string(value.token),true);
 assert.equal(parsed.verifySignature(env.AGORA_APP_CERTIFICATE),true);assert.equal(value.userId,'71');assert.equal(value.channel,room.channel);
 assert.equal(parsed.getServices(tokenTools.kRtmServiceType)[0].__user_id.toString(),'71');assert.equal(parsed.getServices(tokenTools.kRtcServiceType).length,0);
 assert.ok(value.expiresAt<=room.expiresAt);assert.equal(JSON.stringify(value).includes(env.AGORA_APP_CERTIFICATE),false);
 assert.throws(()=>generateSignalCredentials({},room,player),{code:'voice_unconfigured'});assert.throws(()=>generateSignalCredentials(env,room,{...player,left:true}),{code:'voice_not_member'});
});
test('login precedes subscribe, identity stays a string, repeated renders connect once and teardown is ordered',async()=>{
 const r=rig();assert.equal(await r.signal.connect('seat'),true);await r.signal.connect('seat');
 assert.equal(r.requests,1);assert.deepEqual(r.calls.slice(0,3).map(c=>c[0]),['new','login','subscribe']);assert.equal(r.calls[0][2],'71');
 assert.deepEqual(r.calls[2][2],{withMessage:true,withPresence:true});assert.equal(r.signal.state,'connected');
 await r.signal.leave();assert.deepEqual(r.calls.slice(-2).map(c=>c[0]),['unsubscribe','logout']);assert.equal(r.timers.size,0);assert.equal(r.signal.state,'idle');
});
test('RTM refresh notifications never contain scores or credentials and malformed/cross-room payloads are ignored',async()=>{
 const r=rig();await r.signal.connect('seat');r.hints.length=0;r.signal.pulse(7);await flush();
 const p=r.calls.find(c=>c[0]==='publish');assert.deepEqual(JSON.parse(p[2]),{v:1,version:7});assert.equal(p[3].customType,'candy.room.changed.v1');
 const emit=message=>r.clients[0].events.message({channelName:auth().channel,customType:'candy.room.changed.v1',publisher:'72',message});
 for(const m of ['{}','null','bad','{"v":1,"version":7,"score":999}','{"v":1,"version":-1}'])emit(m);
 r.clients[0].events.message({channelName:'different',customType:'candy.room.changed.v1',publisher:'72',message:'{"v":1,"version":8}'});assert.equal(r.hints.length,0);
 emit('{"v":1,"version":8}');assert.deepEqual(r.hints,[{version:8}]);assert.equal(r.signal.traffic.received,1);await r.signal.leave();
});
test('burst announcements are coalesced instead of turning polling into a broadcast loop',async()=>{
 const r=rig();await r.signal.connect('seat');for(let n=1;n<=20;n++)r.signal.pulse(n);await flush();assert.equal(r.calls.filter(c=>c[0]==='publish').length,1);
 const task=[...r.timers.values()].find(t=>t.ms===120);assert.ok(task);r.advance(120);task.f();await flush();assert.equal(r.calls.filter(c=>c[0]==='publish').length,2);assert.equal(JSON.parse(r.calls.filter(c=>c[0]==='publish').at(-1)[2]).version,20);await r.signal.leave();
});
test('token renewal keeps identity and stops when credentials change',async()=>{
 let credential=auth();const r=rig({getCredentials:()=>credential});await r.signal.connect('seat');
 const renew=[...r.timers.values()][0];credential={...credential,token:'007renewed'};renew.f();await flush();assert.ok(r.calls.some(c=>c[0]==='renew'&&c[1]==='007renewed'));
 credential={...credential,userId:'different'};[...r.timers.values()].at(-1).f();await flush();assert.equal(r.signal.state,'error');await r.signal.leave();
});
test('failed login never subscribes, and leaving during login cannot leave a ghost subscription',async()=>{
 const failed=rig({login:()=>{throw new Error('private provider detail');}});assert.equal(await failed.signal.connect('seat'),false);assert.equal(failed.calls.some(c=>c[0]==='subscribe'),false);assert.equal(JSON.stringify(failed.states).includes('private provider detail'),false);await failed.signal.leave();
 let done;const pending=new Promise(resolve=>done=resolve),r=rig({login:()=>pending});const join=r.signal.connect('seat');await flush();const leave=r.signal.leave();done();await join;await leave;assert.equal(r.calls.some(c=>c[0]==='subscribe'),false);assert.equal(r.signal.state,'idle');
});
