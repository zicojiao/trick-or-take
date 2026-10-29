import {PAGE_META, languagePath} from './locale.mjs';
export const SHARE_SIZE={width:1200,height:630};

const LEVELS = {
  zh: {easy:'简单',medium:'中等',hard:'困难'},
  'zh-tw': {easy:'簡單',medium:'中等',hard:'困難'},
  es: {easy:'Fácil',medium:'Medio',hard:'Difícil'},
  ja: {easy:'かんたん',medium:'ふつう',hard:'むずかしい'},
  ko: {easy:'쉬움',medium:'보통',hard:'어려움'},
  fr: {easy:'Facile',medium:'Moyen',hard:'Difficile'},
  de: {easy:'Einfach',medium:'Mittel',hard:'Schwer'},
  pt: {easy:'Fácil',medium:'Médio',hard:'Difícil'},
  ru: {easy:'Легко',medium:'Средне',hard:'Сложно'},
  it: {easy:'Facile',medium:'Medio',hard:'Difficile'},
  id: {easy:'Mudah',medium:'Sedang',hard:'Sulit'},
  en: {easy:'Easy',medium:'Medium',hard:'Hard'}
};

const MODES = {
  zh: {online:'好友对战',solo:'单人挑战'},
  'zh-tw': {online:'好友對戰',solo:'單人挑戰'},
  es: {online:'Con amigos',solo:'En solitario'},
  ja: {online:'友達と対戦',solo:'ソロ'},
  ko: {online:'친구 대결',solo:'솔로'},
  fr: {online:'Entre amis',solo:'Solo'},
  de: {online:'Mit Freunden',solo:'Solo'},
  pt: {online:'Com amigos',solo:'Solo'},
  ru: {online:'С друзьями',solo:'Соло'},
  it: {online:'Con amici',solo:'In solitaria'},
  id: {online:'Bareng teman',solo:'Solo'},
  en: {online:'With friends',solo:'Solo'}
};

const LABELS = {
  zh: '60 秒 · 免费开玩',
  'zh-tw': '60 秒 · 免費開玩',
  es: '60 segundos · Juega gratis',
  ja: '60秒 · 無料でプレイ',
  ko: '60초 · 무료 플레이',
  fr: '60 secondes · Jouer gratuitement',
  de: '60 Sekunden · Kostenlos spielen',
  pt: '60 segundos · Jogue grátis',
  ru: '60 секунд · Играть бесплатно',
  it: '60 secondi · Gioca gratis',
  id: '60 detik · Main gratis',
  en: '60 seconds · Play free'
};

export const shareLevel=(level,lang='en')=>(LEVELS[lang]||LEVELS.en)[level]||level;
export const shareMode=(mode,lang='en')=>(MODES[lang]||MODES.en)[mode]||mode;
export const shareLabel=(r,lang='en')=>r?shareLevel(r.difficulty,lang)+' · '+shareMode(r.mode,lang):(LABELS[lang]||LABELS.en);

export function shareMeta(lang='en',result=null){
  const meta=PAGE_META[lang] || PAGE_META.en;
  if(!result) {
    if(lang === 'zh') return {...meta, alt:'Trick or Take：万圣节 60 秒偷糖挑战'};
    if(lang === 'zh-tw') return {...meta, alt:'Trick or Take：萬聖節 60 秒偷糖挑戰'};
    return {...meta, alt: 'Trick or Take: a 60-second Halloween candy challenge'};
  }
  const score = result.score;
  const label = shareLabel(result, lang);
  if(lang === 'zh') {
    return {...meta, title: `${score} 颗糖！你能超过我吗？· Trick or Take`,
      description: `${label}。60 秒偷糖挑战，松手装乖，试试能否打破这个成绩！`,
      alt: `${score} 颗糖 · ${label} · Trick or Take`};
  }
  if(lang === 'zh-tw') {
    return {...meta, title: `${score} 顆糖！你能超過我嗎？· Trick or Take`,
      description: `${label}。60 秒偷糖挑戰，鬆手裝乖，試試能否打破這個成績！`,
      alt: `${score} 顆糖 · ${label} · Trick or Take`};
  }
  return {
    ...meta,
    title: `${score} treats. Can you beat me? · Trick or Take`,
    description: `${label}. A 60-second candy heist. Hold to steal, release to look innocent. Try to beat this score!`,
    alt: `${score} treats · ${label} · Trick or Take`
  };
}

export function challengeUrl(origin,id,lang='en'){
  const base = String(origin).replace(/\/$/, '');
  const path = languagePath(lang);
  const url = new URL(base + (path === '/' ? '/' : path));
  url.searchParams.set('result',id);
  return url.href;
}
