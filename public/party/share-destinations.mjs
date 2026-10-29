import {shareMeta} from './share-meta.mjs';
export const SOCIAL_PLATFORMS=Object.freeze(['x','whatsapp','facebook','telegram','reddit']);
export function shareDestinations(result,url,lang='en') {
 const text=shareMeta(lang,result).title;
 const intent=(base,params)=>{const link=new URL(base);for(const [key,value] of Object.entries(params))link.searchParams.set(key,value);return link.href;};
 return {
  x:intent('https://twitter.com/intent/tweet',{text,url}),
  whatsapp:intent('https://wa.me/',{text:text+'\n'+url}),
  facebook:intent('https://www.facebook.com/sharer/sharer.php',{u:url}),
  telegram:intent('https://t.me/share/url',{url,text}),
  reddit:intent('https://www.reddit.com/submit',{url,title:text}),
 };
}
