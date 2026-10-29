import {PAGE_META, languagePath} from './locale.mjs';
export const SHARE_SIZE={width:1200,height:630};

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

export const shareMode=(mode,lang='en')=>(MODES[lang]||MODES.en)[mode]||mode;
export const shareLabel=(r,lang='en')=>r?shareMode(r.mode,lang):(LABELS[lang]||LABELS.en);

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
  const localized = {
    es:[`${score} caramelos. ¿Puedes superarme?`,`${label}. Un robo de caramelos de 60 segundos. Mantén para robar y suelta para disimular. ¡Supera mi puntuación!`],
    ja:[`${score}個のお菓子！このスコアを超えられる？`,`${label}。60秒のお菓子泥棒チャレンジ。長押しで盗んで、離して知らんぷり。記録に挑戦しよう！`],
    ko:[`사탕 ${score}개! 내 점수를 넘을 수 있나요?`,`${label}. 60초 사탕 훔치기 도전. 누르면 훔치고 떼면 숨겨요. 이 점수에 도전하세요!`],
    fr:[`${score} bonbons. Peux-tu me battre ?`,`${label}. Un casse de bonbons de 60 secondes. Maintiens pour voler, relâche pour faire l’innocent. Bats mon score !`],
    de:[`${score} Süßigkeiten. Kannst du mich schlagen?`,`${label}. 60 Sekunden auf Süßigkeitenjagd. Halten zum Klauen, loslassen und unschuldig schauen. Schlage diesen Punktestand!`],
    pt:[`${score} doces. Consegue me superar?`,`${label}. Um roubo de doces de 60 segundos. Segure para pegar e solte para disfarçar. Supere esta pontuação!`],
    ru:[`${score} конфет. Сможешь побить мой результат?`,`${label}. 60 секунд на кражу конфет. Удерживай, чтобы красть, отпусти и притворись невинным. Побей этот результат!`],
    it:[`${score} caramelle. Riesci a battermi?`,`${label}. Un furto di caramelle di 60 secondi. Tieni premuto per rubare e rilascia per fare l’innocente. Batti questo punteggio!`],
    id:[`${score} permen. Bisa mengalahkanku?`,`${label}. Aksi mencuri permen selama 60 detik. Tahan untuk mencuri, lepas untuk berpura-pura polos. Kalahkan skor ini!`],
  }[lang];
  if(localized)return {...meta,title:localized[0]+' · Trick or Take',description:localized[1],alt:`${localized[0]} · ${label} · Trick or Take`};
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
