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

const RESULT_TEXT={
 en:(n,label)=>[
  `${n} candies stolen! 🎃 Beat my Halloween score`,
  `${label}. A free Halloween candy-stealing game. Hold to steal, let go before Lily turns. You have 60 seconds to beat ${n} candies. Play solo or with friends!`,
  `🎃 I stole ${n} candies in Trick or Take!\nA free Halloween game: steal candy, dodge Lily, and look innocent. 🍬\nCan you beat my score in 60 seconds?`,
 ],
 zh:(n,label)=>[
  `${n} 颗糖到手！🎃 万圣节偷糖挑战`,
  `${label}。免费万圣节偷糖小游戏：按住偷糖，松手装乖，别让莉莉抓到！给你 60 秒，能超过 ${n} 颗糖吗？支持单人和好友对战。`,
  `🎃 我在 Trick or Take 偷到了 ${n} 颗糖！\n免费万圣节偷糖小游戏：按住偷糖，松手装乖，别被莉莉抓到 🍬\n给你 60 秒，能超过我的成绩吗？`,
 ],
 'zh-tw':(n,label)=>[
  `${n} 顆糖到手！🎃 萬聖節偷糖挑戰`,
  `${label}。免費萬聖節偷糖小遊戲：按住偷糖，鬆手裝乖，別讓莉莉抓到！給你 60 秒，能超過 ${n} 顆糖嗎？支援單人和好友對戰。`,
  `🎃 我在 Trick or Take 偷到了 ${n} 顆糖！\n免費萬聖節偷糖小遊戲：按住偷糖，鬆手裝乖，別被莉莉抓到 🍬\n給你 60 秒，能超過我的成績嗎？`,
 ],
 es:(n,label)=>[
  `¡${n} caramelos robados! 🎃 Mi reto de Halloween`,
  `${label}. Un juego gratis de Halloween para robar caramelos. Mantén para robar y suelta antes de que Lily mire. ¿Puedes superar ${n} caramelos en 60 segundos? Juega solo o con amigos.`,
  `🎃 ¡Robé ${n} caramelos en Trick or Take!\nUn juego gratis de Halloween: roba caramelos, esquiva a Lily y hazte el inocente. 🍬\n¿Superarás mi puntuación en 60 segundos?`,
 ],
 ja:(n,label)=>[
  `お菓子${n}個ゲット！🎃 ハロウィン泥棒チャレンジ`,
  `${label}。無料のハロウィンお菓子泥棒ゲーム。長押しで盗んで、リリーが振り向く前に離そう。60秒で${n}個を超えられる？1人でも友達とも遊べます。`,
  `🎃 Trick or Takeでお菓子を${n}個盗んだ！\n無料のハロウィンゲーム。お菓子を盗み、リリーの目をかわして知らんぷり。🍬\n60秒でこの記録を超えられる？`,
 ],
 ko:(n,label)=>[
  `사탕 ${n}개 획득! 🎃 할로윈 사탕 훔치기 도전`,
  `${label}. 무료 할로윈 사탕 훔치기 게임. 누르면 훔치고 릴리가 돌아보기 전에 떼세요. 60초 안에 ${n}개를 넘을 수 있나요? 혼자 또는 친구와 즐기세요.`,
  `🎃 Trick or Take에서 사탕 ${n}개를 훔쳤어요!\n무료 할로윈 게임: 사탕을 훔치고, 릴리를 피하고, 모르는 척하세요. 🍬\n60초 안에 내 점수를 넘을 수 있나요?`,
 ],
 fr:(n,label)=>[
  `${n} bonbons volés ! 🎃 Mon défi d’Halloween`,
  `${label}. Un jeu gratuit de vol de bonbons pour Halloween. Maintiens pour voler, relâche avant que Lily se retourne. Peux-tu dépasser ${n} bonbons en 60 secondes ? En solo ou entre amis.`,
  `🎃 J’ai volé ${n} bonbons dans Trick or Take !\nUn jeu gratuit d’Halloween : vole des bonbons, évite Lily et fais l’innocent. 🍬\nPeux-tu me battre en 60 secondes ?`,
 ],
 de:(n,label)=>[
  `${n} Süßigkeiten geklaut! 🎃 Meine Halloween-Challenge`,
  `${label}. Ein kostenloses Halloween-Spiel auf Süßigkeitenjagd. Halten zum Klauen, loslassen bevor Lily sich umdreht. Schaffst du mehr als ${n} in 60 Sekunden? Solo oder mit Freunden.`,
  `🎃 Ich habe ${n} Süßigkeiten in Trick or Take geklaut!\nEin kostenloses Halloween-Spiel: Süßigkeiten klauen, Lily ausweichen und unschuldig schauen. 🍬\nSchlägst du mich in 60 Sekunden?`,
 ],
 pt:(n,label)=>[
  `${n} doces roubados! 🎃 Meu desafio de Halloween`,
  `${label}. Um jogo grátis de Halloween para roubar doces. Segure para pegar e solte antes de Lily olhar. Consegue superar ${n} doces em 60 segundos? Jogue sozinho ou com amigos.`,
  `🎃 Roubei ${n} doces em Trick or Take!\nUm jogo grátis de Halloween: pegue doces, desvie de Lily e faça cara de inocente. 🍬\nConsegue me superar em 60 segundos?`,
 ],
 ru:(n,label)=>[
  `${n} конфет украдено! 🎃 Мой хэллоуинский вызов`,
  `${label}. Бесплатная игра на Хэллоуин про кражу конфет. Удерживай, чтобы красть, и отпусти до поворота Лили. Соберёшь больше ${n} за 60 секунд? Играй один или с друзьями.`,
  `🎃 Я украл ${n} конфет в Trick or Take!\nБесплатная игра на Хэллоуин: кради конфеты, избегай Лили и притворяйся невинным. 🍬\nПобьёшь мой результат за 60 секунд?`,
 ],
 it:(n,label)=>[
  `${n} caramelle rubate! 🎃 La mia sfida di Halloween`,
  `${label}. Un gioco gratis di Halloween per rubare caramelle. Tieni premuto per rubare e rilascia prima che Lily si giri. Supererai ${n} caramelle in 60 secondi? Gioca da solo o con amici.`,
  `🎃 Ho rubato ${n} caramelle in Trick or Take!\nUn gioco gratis di Halloween: ruba caramelle, evita Lily e fai l’innocente. 🍬\nRiesci a battermi in 60 secondi?`,
 ],
 id:(n,label)=>[
  `${n} permen dicuri! 🎃 Tantangan Halloween-ku`,
  `${label}. Game Halloween gratis untuk mencuri permen. Tahan untuk mencuri, lepas sebelum Lily menoleh. Bisa melebihi ${n} permen dalam 60 detik? Main sendiri atau bersama teman.`,
  `🎃 Aku mencuri ${n} permen di Trick or Take!\nGame Halloween gratis: curi permen, hindari Lily, dan pura-pura polos. 🍬\nBisa kalahkan skorku dalam 60 detik?`,
 ],
};
const resultText=(lang,result)=>(RESULT_TEXT[lang]||RESULT_TEXT.en)(result.score,shareLabel(result,lang));

export function shareMeta(lang='en',result=null){
  const meta=PAGE_META[lang] || PAGE_META.en;
  if(!result) {
    if(lang === 'zh') return {...meta, alt:'Trick or Take：万圣节 60 秒偷糖挑战'};
    if(lang === 'zh-tw') return {...meta, alt:'Trick or Take：萬聖節 60 秒偷糖挑戰'};
    return {...meta, alt: 'Trick or Take: a 60-second Halloween candy challenge'};
  }
  const [headline,description]=resultText(lang,result);
  return {...meta,title:headline+' · Trick or Take',description,alt:`${headline} · ${shareLabel(result,lang)} · Trick or Take`};
}

/** Full post copy for social composers; the URL is supplied separately. */
export function sharePost(lang='en',result){
  return resultText(lang,result)[2]+'\n#Halloween #HalloweenGame #TrickOrTake';
}

export function challengeUrl(origin,id,lang='en'){
  const base = String(origin).replace(/\/$/, '');
  const path = languagePath(lang);
  const url = new URL(base + (path === '/' ? '/' : path));
  url.searchParams.set('result',id);
  return url.href;
}
