import {publicUrl, SUPPORTED_LANGS} from './locale.mjs';
import {ogImageUrl} from './seo.mjs';
import {shareCardBlob} from './share-card.mjs';
import {shareMeta,shareLabel,challengeUrl} from './share-meta.mjs';
import {sharingCopy} from './sharing-copy.mjs';
import {SOCIAL_PLATFORMS,shareDestinations} from './share-destinations.mjs';

export function createResultSharing({document:doc,nav,origin,search,getContext,request,onChallenge,track=()=>{},makeCard=options=>shareCardBlob(doc,options),openWindow=(...args)=>doc.defaultView?.open(...args)}) {
  const $=id=>doc.getElementById(id);
  const platformNames={x:'X',whatsapp:'WhatsApp',facebook:'Facebook',telegram:'Telegram',reddit:'Reddit'};
  let key='',state={status:''},incoming=null;
  const lang=()=>SUPPORTED_LANGS.includes(getContext().lang)?getContext().lang:'en';
  const current=s=>s===state&&s.key===getContext().key;
  const status=value=>{state.status=value;refresh();};
  function preview(s,result) {
    if(s.previewTask)return s.previewTask;
    const revision=s.previewRevision=(s.previewRevision||0)+1;
    s.previewTask=Promise.resolve().then(()=>makeCard({result,lang:lang(),origin})).then(blob=>{
      if(!current(s)||revision!==s.previewRevision)return;
      s.blob=blob;s.previewUrl=URL.createObjectURL(blob);
      $('share-preview-image').src=s.previewUrl;
      const FileType=doc.defaultView?.File;
      if(FileType)s.file=new FileType([blob],`trick-or-take-${result.score}.png`,{type:'image/png'});
    }).catch(()=>{if(current(s)&&revision===s.previewRevision)s.imageError=true;}).finally(()=>{if(current(s)&&revision===s.previewRevision){s.previewDone=true;refresh();}});
    return s.previewTask;
  }
  function refresh() {
    const c=getContext(),l=lang(),t=sharingCopy(l);
    if(key!==c.key){
      if(state.previewUrl)URL.revokeObjectURL(state.previewUrl);
      key=c.key;state={key,status:''};$('share-link').value='';$('share-preview-image').removeAttribute?.('src');
    }
    for(const [id,label] of Object.entries({'share-title':t.title,'share-note':t.privacy,'share-prepare-label':state.pending?t.loading:t.prepare,'share-native-label':t.native,'share-copy-label':t.copy,'share-save-label':t.save,'share-link-label':t.label,'challenge-eyebrow':t.challenge,'challenge-accept':t.accept}))$(id).textContent=label;
    $('share-socials').setAttribute?.('aria-label',t.prepare);
    $('share-preview-image').alt=t.imageAlt;
    $('share-preview-image').hidden=!state.previewUrl;
    $('share-preview-loading').hidden=!!state.previewUrl;
    $('share-preview-loading').textContent=state.imageError?t.imageError:t.loading;
    $('share-preview').setAttribute?.('aria-busy',String(!state.previewDone));
    $('share-prepare').disabled=!c.available||!!state.pending;
    $('result-share').hidden=!c.available&&!state.result;
    $('share-actions').hidden=!state.result||typeof nav.share!=='function';
    $('share-prepare').hidden=!!state.result;
    $('share-copy').disabled=!c.available||!!state.pending;
    $('share-save').disabled=!state.blob;
    $('share-link-row').hidden=!state.result;
    $('share-link').value=state.url||'';
    $('share-status').textContent=t[state.status]||'';
    $('challenge-accept').disabled=!c.canStart;
    const links=state.result?shareDestinations(state.result,state.url,l):null;
    for(const platform of SOCIAL_PLATFORMS){
      $('share-'+platform).setAttribute?.('aria-label',t.native+' · '+platformNames[platform]);
      $('share-'+platform).href=links?.[platform]||'#result-share';
      $('share-'+platform).setAttribute?.('aria-disabled',String(!c.available||!!state.pending));
    }
    if(c.available&&c.result&&!state.previewTask)void preview(state,c.result);
    if(incoming){
      $('challenge-title').textContent=shareMeta(l,incoming).title;
      $('challenge-copy').textContent=shareLabel(incoming,l);
    }
    const m=shareMeta(l,incoming);doc.title=m.title;
    $('meta-description').content=m.description;
    for(const type of ['og','twitter']){$('meta-'+type+'-title').content=m.title;$('meta-'+type+'-description').content=m.description;}
    $('meta-og-image').content=$('meta-twitter-image').content=ogImageUrl(origin,l,incoming?.id||'default');
    $('meta-og-url').content=$('canonical-url').href=incoming?challengeUrl(origin,incoming.id,l):publicUrl(origin,l);
    $('meta-og-image-alt').content=$('meta-twitter-image-alt').content=m.alt;
  }
  async function prepare() {
    const c=getContext(),s=state;
    if(!c.available)return;
    if(s.result)return s.result;
    if(s.requestTask)return s.requestTask;
    s.pending=true;s.status='';refresh();
    // Creating a public challenge is an explicit action, independent of leaderboard consent.
    s.requestTask=(async()=>{
      try{
        const {result}=await request('share-result',c.body,c.identity);
        if(!current(s))return;
        s.result=result;s.url=challengeUrl(origin,result.id,lang());s.status='ready';
        track('challenge_created',{mode:result.mode,score:result.score});
        // A broken image must never block a usable challenge link.
        if(c.result?.score!==result.score||c.result?.mode!==result.mode){
          if(s.previewUrl)URL.revokeObjectURL(s.previewUrl);
          s.previewRevision=(s.previewRevision||0)+1;s.previewTask=null;s.previewUrl=null;s.blob=null;s.file=null;s.previewDone=false;
        }
        void preview(s,result);
        return result;
      }catch{if(current(s))s.status='error';}
      finally{if(current(s)){s.pending=false;s.requestTask=null;refresh();}}
    })();
    return s.requestTask;
  }
  $('share-prepare').addEventListener('click',async()=>{
    track('score_share_clicked',{destination:'more'});
    const s=state;if(await prepare()&&current(s)){
      if(typeof nav.share==='function')$('share-native').focus();else $('share-copy').focus();
    }
  });
  for(const platform of SOCIAL_PLATFORMS)$('share-'+platform).addEventListener('click',async event=>{
    const s=state;
    if(!getContext().available||s.pending){event.preventDefault();return;}
    track('score_share_clicked',{destination:platform});
    if(s.result){track('share_composer_opened',{destination:platform});return;}
    event.preventDefault();
    // Reserve the tab within this click, before awaiting verification. Safari
    // otherwise blocks a window opened after the network response.
    let popup;
    try{popup=openWindow('about:blank','_blank');if(popup){popup.opener=null;popup.document.title=sharingCopy(lang()).opening;if(popup.document.body)popup.document.body.textContent=sharingCopy(lang()).opening;}}catch{}
    const result=await prepare();
    if(!result||!current(s)){popup?.close();return;}
    if(!popup||popup.closed){status('blocked');return;}
    try{popup.location.replace(shareDestinations(result,s.url,lang())[platform]);s.status='opening';refresh();track('share_composer_opened',{destination:platform});}
    catch{popup.close();status('blocked');}
  });
  $('share-copy').addEventListener('click',async()=>{
    const s=state;if(!await prepare()||!current(s))return;
    try{await nav.clipboard.writeText(s.url);if(current(s)){s.status='copied';track('challenge_link_copied');}}
    catch{if(current(s)){s.status='manual';$('share-link').focus();$('share-link').select();}}
    if(current(s))refresh();
  });
  $('share-native').addEventListener('click',()=>{
    const s=state;if(!s.result||!nav.share)return;
    const m=shareMeta(lang(),s.result),payload={title:m.title,text:m.title,url:s.url};
    try{if(s.file&&nav.canShare?.({files:[s.file]}))payload.files=[s.file];}catch{}
    // Call directly in the click: no await before Safari's native share sheet.
    try{
      const attempt=nav.share(payload);track('score_share_clicked',{destination:'native',with_image:!!payload.files});
      Promise.resolve(attempt).then(()=>{if(current(s)){s.status='';refresh();track('native_share_completed',{with_image:!!payload.files});}})
        .catch(error=>{if(current(s)){s.status=error?.name==='AbortError'?'cancelled':'shareError';refresh();}});
    }catch{status('shareError');}
  });
  $('share-save').addEventListener('click',()=>{
    if(!state.previewUrl)return;
    const a=doc.createElement('a');a.href=state.previewUrl;a.download=`trick-or-take-${(state.result||getContext().result).score}.png`;doc.body.append(a);a.click();a.remove();
    status('saved');track('score_card_download_clicked');
  });
  $('challenge-accept').addEventListener('click',()=>{if(incoming&&getContext().canStart){track('challenge_accepted',{mode:incoming.mode,score:incoming.score});onChallenge(incoming);}});
  const id=new URLSearchParams(search).get('result');
  if(/^[a-f0-9]{24}$/.test(id||''))void request('shared-result?id='+id).then(data=>{incoming=data.result;$('challenge-banner').hidden=false;track('challenge_viewed',{mode:incoming.mode});refresh();}).catch(()=>{$('challenge-banner').hidden=false;$('challenge-title').textContent=sharingCopy(lang()).notFound;$('challenge-accept').hidden=true;});
  return {refresh,prepare};
}
