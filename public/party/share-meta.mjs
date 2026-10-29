import {PAGE_META} from './locale.mjs';
export const SHARE_SIZE={width:1200,height:630};
export const shareLevel=(level,lang='en')=>(lang==='zh'?{easy:'简单',medium:'中等',hard:'困难'}:{easy:'Easy',medium:'Medium',hard:'Hard'})[level]||level;
export const shareMode=(mode,lang='en')=>lang==='zh'?(mode==='online'?'好友对战':'单人挑战'):(mode==='online'?'With friends':'Solo');
export const shareLabel=(r,lang='en')=>r?shareLevel(r.difficulty,lang)+' · '+shareMode(r.mode,lang):(lang==='zh'?'60 秒 · 免费开玩':'60 seconds · Play free');
export function shareMeta(lang='en',result=null){
  const meta=PAGE_META[lang];
  if(!result)return {...meta,alt:lang==='zh'?'Trick or Take：万圣节 60 秒偷糖挑战':'Trick or Take: a 60-second Halloween candy challenge'};
  return {...meta,title:lang==='zh'?`${result.score} 颗糖！你能超过我吗？· Trick or Take`:`${result.score} treats. Can you beat me? · Trick or Take`,
    description:lang==='zh'?`${shareLabel(result,lang)}。60 秒偷糖挑战，松手装乖，试试能否打破这个成绩！`:`${shareLabel(result,lang)}. A 60-second candy heist. Hold to steal, release to look innocent. Try to beat this score!`,
    alt:lang==='zh'?`${result.score} 颗糖 · ${shareLabel(result,lang)} · Trick or Take`:`${result.score} treats · ${shareLabel(result,lang)} · Trick or Take`};
}
export function challengeUrl(origin,id,lang='en'){const url=new URL(lang==='zh'?'/zh':'/',origin);url.searchParams.set('result',id);return url.href;}
