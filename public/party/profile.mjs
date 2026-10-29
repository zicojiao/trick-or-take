const words = {
  en: [['Sneaky','Sleepy','Lucky','Tiny','Spooky','Dizzy','Bouncy','Happy'],['Ghost','Pumpkin','Mochi','Bat','Witch','Cookie','Kitten','Goblin']],
  zh: [['糯糯','偷偷','迷糊','勇敢','贪吃','开心','圆滚滚','甜甜'],['小南瓜','小幽灵','小蝙蝠','糯米团','小黑猫','糖果精','小布丁','小饼干']],
};
const pools = Object.fromEntries(Object.entries(words).map(([lang,[adjectives,nouns]])=>[
  lang,adjectives.flatMap(a=>nouns.map(n=>a+(lang==='en'?' ':'')+n)),
]));

/** Skip the current name rather than retrying, so every click changes it. */
export function randomNickname(lang,previous='',random=()=>crypto.getRandomValues(new Uint32Array(1))[0]) {
  const pool=pools[lang]||pools.en,previousIndex=pool.indexOf(previous.trim());
  let index=random()%(pool.length-(previousIndex>=0?1:0));
  if(previousIndex>=0&&index>=previousIndex)index++;
  return pool[index];
}
