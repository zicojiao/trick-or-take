import {publicUrl} from './locale.mjs';
import {shareCardBlob} from './share-card.mjs';
import {shareMeta,shareLabel,challengeUrl} from './share-meta.mjs';
const COPY={en:{title:'Dare your friends to beat you',note:'Share your score. Your name stays private. This does not add you to the leaderboard.',prepare:'Make a challenge link',loading:'Making your card…',native:'Share',copy:'Copy link',save:'Save card',x:'Share on X',ready:'Your challenge is ready.',copied:'Challenge link copied.',manual:'Select and copy the link below.',saved:'Card saved. Add the challenge link to your post.',error:'Could not make the card. Please try again.',cancelled:'Sharing cancelled.',challenge:'A little challenge for you',accept:'Play this challenge →',notFound:'This challenge could not load. You can still play.'},zh:{title:'让朋友来挑战你',note:'仅分享成绩，不公开名字，也不会自动加入排行榜。',prepare:'生成挑战链接',loading:'正在生成卡片……',native:'分享',copy:'复制链接',save:'保存卡片',x:'分享到 X',ready:'挑战卡片已准备好。',copied:'挑战链接已复制。',manual:'请选中下方链接复制。',saved:'卡片已保存，发布时记得带上挑战链接。',error:'卡片生成失败，请重试。',cancelled:'已取消分享。',challenge:'收到一个偷糖挑战',accept:'接受挑战，开玩 →',notFound:'暂时无法加载这个挑战，你仍然可以直接开玩。'}};
export function createResultSharing({document:doc,nav,origin,search,getContext,request,onChallenge,track=()=>{},makeCard=options=>shareCardBlob(doc,options)}){
  const $=id=>doc.getElementById(id);let key='',state={status:''},incoming=null;
  const lang=()=>getContext().lang==='zh'?'zh':'en';
  function refresh(){
    const c=getContext(),l=lang(),t=COPY[l];
    if(key!==c.key){key=c.key;state={status:''};$('share-link').value='';}
    for(const[id,label]of Object.entries({'share-title':t.title,'share-note':t.note,'share-prepare':state.pending?t.loading:t.prepare,'share-native':t.native,'share-copy':t.copy,'share-save':t.save,'share-x':t.x,'challenge-eyebrow':t.challenge,'challenge-accept':t.accept}))$(id).textContent=label;
    $('share-prepare').disabled=!c.available||!!state.pending;
    $('result-share').hidden=!c.available&&!state.result;
    $('share-actions').hidden=!state.result;$('share-prepare').hidden=!!state.result;
    $('share-native').hidden=typeof nav.share!=='function';
    $('share-status').textContent=t[state.status]||'';
    $('challenge-accept').disabled=!c.canStart;
    if(incoming){
      $('challenge-title').textContent=l==='zh'?`${incoming.score} 颗糖，等你来超越。`:`${incoming.score} treats. Your turn.`;
      $('challenge-copy').textContent=shareLabel(incoming,l);
    }
    const m=shareMeta(l,incoming);doc.title=m.title;
    $('meta-description').content=m.description;
    for(const type of ['og','twitter']){ $('meta-'+type+'-title').content=m.title;$('meta-'+type+'-description').content=m.description;}
    $('meta-og-image').content=$('meta-twitter-image').content=new URL('/og/'+(incoming?.id||'default')+'.png?lang='+l+'&v=3',origin).href;
    $('meta-og-url').content=$('canonical-url').href=incoming?challengeUrl(origin,incoming.id,l):publicUrl(origin,l);
    $('meta-og-image-alt').content=$('meta-twitter-image-alt').content=m.alt;
  }

  async function prepare(){
    const c=getContext();if(!c.available||state.pending||state.result)return;
    const current=key;state.pending=true;state.status='';refresh();
    try{
      const {result}=await request('share-result',c.body,c.identity);
      const blob=await makeCard({result,lang:lang(),origin});
      if(current!==getContext().key)return;
      state={result,blob,url:challengeUrl(origin,result.id,lang()),status:'ready'};track('challenge_created',{mode:result.mode,difficulty:result.difficulty});
      $('share-link').value=state.url;
      const tweet=new URL('https://twitter.com/intent/tweet');tweet.searchParams.set('text',shareMeta(lang(),result).title);tweet.searchParams.set('url',state.url);$('share-x').href=tweet.href;
    }catch{if(current===getContext().key)state={status:'error'};}
    finally{if(current===getContext().key){state.pending=false;refresh();}}
  }
  $('share-prepare').addEventListener('click',prepare);
  $('share-copy').addEventListener('click',async()=>{if(!state.url)return;try{await nav.clipboard.writeText(state.url);state.status='copied';track('challenge_link_copied');}catch{state.status='manual';$('share-link').focus();$('share-link').select();}refresh();});
  $('share-native').addEventListener('click',()=>{if(!state.result||!nav.share)return;const payload={title:shareMeta(lang(),state.result).title,text:shareMeta(lang(),state.result).description,url:state.url};
    // The link is already prepared, so the share sheet opens in this click's
    // user activation, including Safari. Nothing is ever posted automatically.
    Promise.resolve(nav.share(payload)).catch(error=>{state.status=error?.name==='AbortError'?'cancelled':'error';refresh();});
  });
  $('share-save').addEventListener('click',()=>{if(!state.blob)return;const url=URL.createObjectURL(state.blob),a=doc.createElement('a');a.href=url;a.download='trick-or-take-'+state.result.score+'.png';doc.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);state.status='saved';refresh();});
  $('challenge-accept').addEventListener('click',()=>{if(incoming&&getContext().canStart){track('challenge_accepted',{mode:incoming.mode,difficulty:incoming.difficulty});onChallenge(incoming);}});
  const id=new URLSearchParams(search).get('result');
  if(/^[a-f0-9]{24}$/.test(id||''))void request('shared-result?id='+id).then(data=>{incoming=data.result;$('challenge-banner').hidden=false;refresh();}).catch(()=>{$('challenge-banner').hidden=false;$('challenge-title').textContent=COPY[lang()].notFound;$('challenge-accept').hidden=true;});
  return {refresh,prepare};
}
